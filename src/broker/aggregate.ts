// Multi-broker aggregation (Pro promise in the business plan): a user's book
// is the union of everything they hold across connected brokers. The risk
// engine already aggregates duplicate tickers, so cross-broker positions in
// the same name combine naturally in weights/correlations.

import { pullBrokerSnapshot as pullKite } from "./kite.js";
import { pullGrowwSnapshot } from "./groww.js";
import type { BrokerSnapshot } from "./types.js";

export interface AggregatedSnapshot extends BrokerSnapshot {
  /** Brokers that contributed data this pull. */
  sources: ("zerodha" | "groww")[];
  /** Brokers with a connection whose pull failed (expired Kite token etc.). */
  failed: ("zerodha" | "groww")[];
}

export async function pullAllBrokers(userId: number): Promise<AggregatedSnapshot | null> {
  const sources: AggregatedSnapshot["sources"] = [];
  const failed: AggregatedSnapshot["failed"] = [];
  const merged: AggregatedSnapshot = { holdings: [], trades: [], margins: null, sources, failed };

  // Zerodha
  try {
    const kite = await pullKite(userId);
    if (kite) {
      merged.holdings.push(...kite.holdings.map((h) => ({ ...h, broker: "zerodha" as const })));
      merged.trades.push(...kite.trades);
      merged.margins = kite.margins;
      sources.push("zerodha");
    } else {
      // pullKite returns null both for "no connection" and "expired token";
      // only count it failed if a connection row exists.
      const { db } = await import("../db/client.js");
      const { rows } = await db().query(
        `SELECT 1 FROM broker_connections WHERE user_id = $1 AND broker = 'zerodha'`,
        [userId],
      );
      if (rows.length > 0) failed.push("zerodha");
    }
  } catch (err) {
    console.warn(`[aggregate] zerodha pull failed for user ${userId}:`, err);
    failed.push("zerodha");
  }

  // Groww
  try {
    const groww = await pullGrowwSnapshot(userId);
    if (groww) {
      merged.holdings.push(...groww.holdings);
      merged.trades.push(...groww.trades);
      if (groww.margins) {
        merged.margins = merged.margins
          ? {
              utilised: merged.margins.utilised + groww.margins.utilised,
              available: merged.margins.available + groww.margins.available,
            }
          : groww.margins;
      }
      sources.push("groww");
    }
  } catch (err) {
    console.warn(`[aggregate] groww pull failed for user ${userId}:`, err);
    failed.push("groww");
  }

  if (sources.length === 0 && failed.length === 0) return null; // no connections at all
  return merged;
}
