// Daily close-price ingestion via Kite Connect's historical data API.
//
// This partially closes PRD §10's open question (price data sourcing): we
// already hold a user's daily access token, and Kite's historical candles API
// serves daily closes. We borrow any one live connected token per run to
// backfill daily_prices for every ticker held across all users, plus the
// NIFTY 50 index (needed for scenario betas).
//
// Caveats, documented on purpose:
//  - Kite's historical API requires the historical-data add-on on the API
//    subscription. If the account lacks it, calls fail and we log + skip —
//    the risk engine degrades gracefully (correlations/betas just skip
//    tickers without history).
//  - Read-only, same as everything else in this codebase.

import { KiteConnect, type Connect } from "kiteconnect";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { decryptToken } from "../crypto/tokens.js";

/** daily_prices key under which NIFTY 50 index closes are stored. */
export const NIFTY_INDEX_TICKER = "NIFTY50_INDEX";
const NIFTY_INDEX_INSTRUMENT_TOKEN = 256265; // NSE:NIFTY 50

const HISTORY_DAYS = 120; // calendar days; ~85 trading sessions

/** Borrows any currently-valid Zerodha token for market-data reads. */
async function anyLiveClient(): Promise<Connect | null> {
  const cfg = config();
  const { rows } = await db().query(
    `SELECT access_token_encrypted FROM broker_connections
     WHERE broker = 'zerodha' AND token_expires_at > now()
     ORDER BY connected_at DESC LIMIT 1`,
  );
  const row = rows[0];
  if (!row) return null;
  const kc = new KiteConnect({ api_key: cfg.KITE_API_KEY });
  kc.setAccessToken(decryptToken(row.access_token_encrypted, cfg.TOKEN_ENCRYPTION_KEY));
  return kc;
}

/**
 * Resolves NSE instrument tokens for the given tradingsymbols, using the
 * cached instrument_tokens table and refreshing from the (large) instruments
 * dump only when tickers are missing or the cache is older than 7 days.
 */
async function resolveInstrumentTokens(
  kc: Connect,
  tickers: string[],
): Promise<Map<string, number>> {
  const tokens = new Map<string, number>();
  const { rows } = await db().query(
    `SELECT ticker, instrument_token FROM instrument_tokens
     WHERE ticker = ANY($1) AND refreshed_at > now() - interval '7 days'`,
    [tickers],
  );
  for (const row of rows) tokens.set(row.ticker, Number(row.instrument_token));

  const missing = tickers.filter((t) => !tokens.has(t));
  if (missing.length === 0) return tokens;

  const instruments = await kc.getInstruments("NSE");
  const bySymbol = new Map<string, { token: number; exchange: string }>();
  for (const inst of instruments) {
    if (inst.instrument_type === "EQ") {
      bySymbol.set(String(inst.tradingsymbol).toUpperCase(), {
        token: Number(inst.instrument_token),
        exchange: String(inst.exchange),
      });
    }
  }

  for (const ticker of missing) {
    const found = bySymbol.get(ticker.toUpperCase());
    if (!found) continue;
    tokens.set(ticker, found.token);
    await db().query(
      `INSERT INTO instrument_tokens (ticker, instrument_token, exchange, refreshed_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (ticker) DO UPDATE SET
         instrument_token = EXCLUDED.instrument_token,
         exchange = EXCLUDED.exchange,
         refreshed_at = now()`,
      [ticker, found.token, found.exchange],
    );
  }
  return tokens;
}

async function upsertCloses(
  ticker: string,
  candles: { date: Date | string; close: number }[],
): Promise<void> {
  for (const c of candles) {
    const date = new Date(c.date).toISOString().slice(0, 10);
    await db().query(
      `INSERT INTO daily_prices (ticker, price_date, close)
       VALUES ($1, $2, $3)
       ON CONFLICT (ticker, price_date) DO UPDATE SET close = EXCLUDED.close`,
      [ticker, date, c.close],
    );
  }
}

/**
 * Ingests daily closes for every distinct equity ticker currently held across
 * users, plus the NIFTY 50 index. Best-effort: individual ticker failures are
 * logged and skipped; a missing historical-data subscription fails fast with
 * a clear message.
 */
export async function ingestDailyPrices(): Promise<{ tickers: number; skipped: number }> {
  const stats = { tickers: 0, skipped: 0 };

  const kc = await anyLiveClient();
  if (!kc) {
    console.warn("[prices] no live Zerodha token available; skipping ingestion");
    return stats;
  }

  const { rows } = await db().query(
    `SELECT DISTINCT ticker FROM holdings_snapshot
     WHERE segment = 'equity'
       AND captured_at > now() - interval '7 days'`,
  );
  const tickers: string[] = rows.map((r) => r.ticker);

  const from = new Date(Date.now() - HISTORY_DAYS * 86_400_000);
  const to = new Date();

  // Index first — scenario betas need it even when no equity resolves.
  try {
    const candles = await kc.getHistoricalData(NIFTY_INDEX_INSTRUMENT_TOKEN, "day", from, to);
    await upsertCloses(NIFTY_INDEX_TICKER, candles as any);
    stats.tickers++;
  } catch (err: any) {
    if (String(err?.message ?? err).toLowerCase().includes("subscription")) {
      console.warn("[prices] historical-data API not enabled on this Kite subscription; skipping");
      return stats;
    }
    console.warn("[prices] NIFTY index history failed:", err?.message ?? err);
  }

  const tokenMap = await resolveInstrumentTokens(kc, tickers);
  for (const ticker of tickers) {
    const token = tokenMap.get(ticker);
    if (!token) {
      stats.skipped++;
      continue;
    }
    try {
      const candles = await kc.getHistoricalData(token, "day", from, to);
      await upsertCloses(ticker, candles as any);
      stats.tickers++;
      // Kite historical API is rate-limited (~3 req/s); stay well under it.
      await sleep(400);
    } catch (err: any) {
      stats.skipped++;
      console.warn(`[prices] ${ticker} history failed:`, err?.message ?? err);
    }
  }

  console.log(`[prices] ingested ${stats.tickers} tickers, skipped ${stats.skipped}`);
  return stats;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
