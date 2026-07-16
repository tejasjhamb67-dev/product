// Behavioral journal pattern detection (PRD §3.4, flow D).
//
// All detection is deterministic. Output is DESCRIPTIVE only — flags state
// what happened ("re-entered NIFTY futures within 15 minutes of a losing exit
// on 3 occasions"), never judgment ("you're revenge trading, stop it").

import type { Trade } from "../broker/types.js";

export interface JournalFlag {
  kind:
    | "reentry_after_loss"
    | "sizing_up_after_losses"
    | "high_turnover"
    | "holding_period_compression";
  detail: string;
  occurrences: number;
}

const REENTRY_WINDOW_MINUTES = 60;
const LOSING_STREAK_LENGTH = 3;
const SIZING_DRIFT_RATIO = 1.5;
const HIGH_TURNOVER_TRADES_PER_DAY = 15;

interface RoundTrip {
  ticker: string;
  entryAt: Date;
  exitAt: Date;
  pnl: number;
  notional: number;
}

/**
 * Pairs buys and sells per ticker (FIFO) into round trips with realized P&L.
 * Long-side only for the MVP; short round trips (sell first) are paired the
 * same way with the sign inverted.
 */
export function pairRoundTrips(trades: Trade[]): RoundTrip[] {
  const byTicker = new Map<string, Trade[]>();
  for (const t of [...trades].sort((a, b) => a.executedAt.getTime() - b.executedAt.getTime())) {
    const arr = byTicker.get(t.ticker) ?? [];
    arr.push(t);
    byTicker.set(t.ticker, arr);
  }

  const trips: RoundTrip[] = [];
  for (const [ticker, list] of byTicker) {
    // FIFO queue of open lots: positive qty = long lot, negative = short lot.
    const open: { qty: number; price: number; at: Date }[] = [];
    for (const t of list) {
      let remaining = t.side === "buy" ? t.quantity : -t.quantity;
      while (remaining !== 0) {
        const head = open[0];
        if (!head || Math.sign(head.qty) === Math.sign(remaining)) {
          open.push({ qty: remaining, price: t.price, at: t.executedAt });
          remaining = 0;
        } else {
          const closed = Math.min(Math.abs(head.qty), Math.abs(remaining));
          const direction = Math.sign(head.qty); // +1 closing a long, -1 closing a short
          const pnl = direction * (t.price - head.price) * closed;
          trips.push({
            ticker,
            entryAt: head.at,
            exitAt: t.executedAt,
            pnl,
            notional: closed * head.price,
          });
          head.qty -= direction * closed;
          remaining += direction * closed;
          if (head.qty === 0) open.shift();
        }
      }
    }
  }
  return trips.sort((a, b) => a.exitAt.getTime() - b.exitAt.getTime());
}

/**
 * Re-entry after a losing exit (revenge-trading proxy): a new entry in the
 * same instrument within REENTRY_WINDOW_MINUTES of a losing exit, same day.
 */
export function detectReentryAfterLoss(trades: Trade[]): JournalFlag | null {
  const trips = pairRoundTrips(trades);
  const losingExits = trips.filter((t) => t.pnl < 0);
  let occurrences = 0;
  const examples: string[] = [];

  const sorted = [...trades].sort((a, b) => a.executedAt.getTime() - b.executedAt.getTime());
  for (const exit of losingExits) {
    const reentry = sorted.find(
      (t) =>
        t.ticker === exit.ticker &&
        t.executedAt > exit.exitAt &&
        t.executedAt.getTime() - exit.exitAt.getTime() <= REENTRY_WINDOW_MINUTES * 60_000 &&
        sameDay(t.executedAt, exit.exitAt),
    );
    if (reentry) {
      occurrences++;
      if (examples.length < 3) {
        const mins = Math.round((reentry.executedAt.getTime() - exit.exitAt.getTime()) / 60_000);
        examples.push(`${exit.ticker} (${mins} min after a losing exit)`);
      }
    }
  }

  if (occurrences === 0) return null;
  return {
    kind: "reentry_after_loss",
    detail: `Re-entered the same instrument within ${REENTRY_WINDOW_MINUTES} minutes of a losing exit on ${occurrences} occasion${occurrences > 1 ? "s" : ""} this week: ${examples.join("; ")}`,
    occurrences,
  };
}

/**
 * Position sizing drift: average entry notional after a losing streak of
 * LOSING_STREAK_LENGTH round trips is >= SIZING_DRIFT_RATIO x the average
 * entry notional before the streak.
 */
export function detectSizingUpAfterLosses(trades: Trade[]): JournalFlag | null {
  const trips = pairRoundTrips(trades);
  if (trips.length < LOSING_STREAK_LENGTH + 1) return null;

  let occurrences = 0;
  let worstRatio = 0;

  for (let i = LOSING_STREAK_LENGTH; i < trips.length; i++) {
    const streak = trips.slice(i - LOSING_STREAK_LENGTH, i);
    if (!streak.every((t) => t.pnl < 0)) continue;
    const baseline = average(trips.slice(0, i - LOSING_STREAK_LENGTH + 1).map((t) => t.notional));
    const next = trips[i]!.notional;
    if (baseline > 0 && next / baseline >= SIZING_DRIFT_RATIO) {
      occurrences++;
      worstRatio = Math.max(worstRatio, next / baseline);
    }
  }

  if (occurrences === 0) return null;
  return {
    kind: "sizing_up_after_losses",
    detail: `Position size increased to ${worstRatio.toFixed(1)}x the prior average immediately after ${LOSING_STREAK_LENGTH} consecutive losing trades (${occurrences} instance${occurrences > 1 ? "s" : ""} this week)`,
    occurrences,
  };
}

/** High turnover: more than HIGH_TURNOVER_TRADES_PER_DAY trades on any single day. */
export function detectHighTurnover(trades: Trade[]): JournalFlag | null {
  const byDay = new Map<string, number>();
  for (const t of trades) {
    const key = t.executedAt.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  const heavy = [...byDay.entries()].filter(([, n]) => n > HIGH_TURNOVER_TRADES_PER_DAY);
  if (heavy.length === 0) return null;
  const peak = Math.max(...heavy.map(([, n]) => n));
  return {
    kind: "high_turnover",
    detail: `Trade count exceeded ${HIGH_TURNOVER_TRADES_PER_DAY}/day on ${heavy.length} day${heavy.length > 1 ? "s" : ""} this week (peak ${peak} trades in a day)`,
    occurrences: heavy.length,
  };
}

const COMPRESSION_RATIO = 0.5;
const COMPRESSION_MIN_TRIPS = 5;

/**
 * Holding-period compression: the median round-trip holding period this week
 * shrank to under COMPRESSION_RATIO of the previous week's median. Both weeks
 * need at least COMPRESSION_MIN_TRIPS closed round trips to compare.
 */
export function detectHoldingPeriodCompression(
  thisWeekTrades: Trade[],
  previousWeekTrades: Trade[],
): JournalFlag | null {
  const current = pairRoundTrips(thisWeekTrades);
  const previous = pairRoundTrips(previousWeekTrades);
  if (current.length < COMPRESSION_MIN_TRIPS || previous.length < COMPRESSION_MIN_TRIPS) {
    return null;
  }
  const holdMinutes = (trips: { entryAt: Date; exitAt: Date }[]): number[] =>
    trips.map((t) => (t.exitAt.getTime() - t.entryAt.getTime()) / 60_000);
  const currentMedian = median(holdMinutes(current));
  const previousMedian = median(holdMinutes(previous));
  if (previousMedian <= 0 || currentMedian / previousMedian >= COMPRESSION_RATIO) return null;

  return {
    kind: "holding_period_compression",
    detail: `Median holding period compressed from ${formatMinutes(previousMedian)} last week to ${formatMinutes(currentMedian)} this week across ${current.length} round trips`,
    occurrences: current.length,
  };
}

export function detectWeeklyPatterns(
  trades: Trade[],
  previousWeekTrades: Trade[] = [],
): JournalFlag[] {
  return [
    detectReentryAfterLoss(trades),
    detectSizingUpAfterLosses(trades),
    detectHighTurnover(trades),
    detectHoldingPeriodCompression(trades, previousWeekTrades),
  ].filter((f): f is JournalFlag => f !== null);
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function formatMinutes(mins: number): string {
  if (mins >= 24 * 60) return `${(mins / (24 * 60)).toFixed(1)} days`;
  if (mins >= 60) return `${(mins / 60).toFixed(1)} hours`;
  return `${Math.round(mins)} minutes`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

function average(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, v) => s + v, 0) / xs.length;
}
