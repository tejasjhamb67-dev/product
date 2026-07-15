// Zerodha Kite Connect integration — READ-ONLY BY DESIGN.
//
// Compliance invariant (PRD §8): this codebase must never gain order-placement
// capability. Only data-read endpoints are called here: holdings, positions,
// margins, trades. Do not add placeOrder/modifyOrder/cancelOrder — that would
// pull the product into SEBI's algo-provider regime and requires a full
// compliance review first.

import { KiteConnect, type Connect } from "kiteconnect";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { decryptToken, encryptToken } from "../crypto/tokens.js";
import type { BrokerSnapshot, Holding, MarginSummary, Trade } from "./types.js";

export function kiteLoginUrl(): string {
  const kc = new KiteConnect({ api_key: config().KITE_API_KEY });
  return kc.getLoginURL();
}

/**
 * Completes the Kite Connect OAuth flow: exchanges the request_token from the
 * redirect for an access token and stores it encrypted. Kite access tokens
 * expire daily (~6-7 AM IST) — we record expiry as the next 6:00 AM IST.
 */
export async function completeKiteLogin(userId: number, requestToken: string): Promise<void> {
  const cfg = config();
  const kc = new KiteConnect({ api_key: cfg.KITE_API_KEY });
  const session = await kc.generateSession(requestToken, cfg.KITE_API_SECRET);
  const accessToken = session.access_token;
  if (!accessToken) throw new Error("Kite session did not return an access token");

  const encrypted = encryptToken(accessToken, cfg.TOKEN_ENCRYPTION_KEY);
  const expiresAt = nextKiteTokenExpiry();

  await db().query(
    `INSERT INTO broker_connections (user_id, broker, access_token_encrypted, token_expires_at, refresh_needed)
     VALUES ($1, 'zerodha', $2, $3, FALSE)
     ON CONFLICT (user_id, broker) DO UPDATE SET
       access_token_encrypted = EXCLUDED.access_token_encrypted,
       token_expires_at = EXCLUDED.token_expires_at,
       refresh_needed = FALSE,
       connected_at = now()`,
    [userId, encrypted, expiresAt],
  );
}

/** Kite tokens die daily around 6:00-7:30 AM IST; treat 6:00 AM IST as expiry. */
export function nextKiteTokenExpiry(now = new Date()): Date {
  // 6:00 IST == 00:30 UTC
  const expiry = new Date(now);
  expiry.setUTCHours(0, 30, 0, 0);
  if (expiry <= now) expiry.setUTCDate(expiry.getUTCDate() + 1);
  return expiry;
}

async function getConnectedClient(userId: number): Promise<Connect | null> {
  const cfg = config();
  const { rows } = await db().query(
    `SELECT access_token_encrypted, token_expires_at FROM broker_connections
     WHERE user_id = $1 AND broker = 'zerodha'`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  if (new Date(row.token_expires_at) <= new Date()) {
    await markRefreshNeeded(userId);
    return null;
  }
  const kc = new KiteConnect({ api_key: cfg.KITE_API_KEY });
  kc.setAccessToken(decryptToken(row.access_token_encrypted, cfg.TOKEN_ENCRYPTION_KEY));
  return kc;
}

export async function markRefreshNeeded(userId: number): Promise<void> {
  await db().query(
    `UPDATE broker_connections SET refresh_needed = TRUE WHERE user_id = $1 AND broker = 'zerodha'`,
    [userId],
  );
}

/**
 * Pulls holdings, F&O positions, margins, and today's trades for a user.
 * Returns null when the user has no live broker connection (expired token —
 * the re-auth nudge flow takes over from there).
 */
export async function pullBrokerSnapshot(userId: number): Promise<BrokerSnapshot | null> {
  const kc = await getConnectedClient(userId);
  if (!kc) return null;

  try {
    const [rawHoldings, rawPositions, rawMargins, rawTrades] = await Promise.all([
      kc.getHoldings(),
      kc.getPositions(),
      kc.getMargins(),
      kc.getTrades(),
    ]);

    const holdings: Holding[] = (rawHoldings ?? []).map((h: any) => ({
      ticker: String(h.tradingsymbol),
      quantity: Number(h.quantity),
      avgPrice: Number(h.average_price),
      lastPrice: h.last_price != null ? Number(h.last_price) : null,
      segment: "equity" as const,
    }));

    // Net F&O positions count toward the book too.
    for (const p of rawPositions?.net ?? []) {
      if (Number(p.quantity) === 0) continue;
      holdings.push({
        ticker: String(p.tradingsymbol),
        quantity: Number(p.quantity),
        avgPrice: Number(p.average_price),
        lastPrice: p.last_price != null ? Number(p.last_price) : null,
        segment: "fno",
      });
    }

    const equity = (rawMargins as any)?.equity;
    const margins: MarginSummary | null = equity
      ? {
          utilised: Number(equity.utilised?.debits ?? 0),
          available: Number(equity.net ?? 0) + Number(equity.utilised?.debits ?? 0),
        }
      : null;

    const trades: Trade[] = (rawTrades ?? []).map((t: any) => ({
      ticker: String(t.tradingsymbol),
      side: String(t.transaction_type).toLowerCase() === "sell" ? "sell" : "buy",
      quantity: Number(t.quantity),
      price: Number(t.average_price),
      segment: String(t.exchange).includes("NFO") ? "fno" : "equity",
      executedAt: new Date(t.fill_timestamp ?? t.exchange_timestamp ?? Date.now()),
      brokerTradeId: t.trade_id != null ? String(t.trade_id) : null,
    }));

    return { holdings, trades, margins };
  } catch (err: any) {
    // Kite throws TokenException when the daily token has lapsed mid-day.
    if (err?.error_type === "TokenException" || err?.status === 403) {
      await markRefreshNeeded(userId);
      return null;
    }
    throw err;
  }
}

/** Persists a broker snapshot into holdings_snapshot + trade_history. */
export async function persistSnapshot(userId: number, snapshot: BrokerSnapshot): Promise<void> {
  const pool = db();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const h of snapshot.holdings) {
      await client.query(
        `INSERT INTO holdings_snapshot (user_id, source, ticker, quantity, avg_price, last_price, segment)
         VALUES ($1, 'broker', $2, $3, $4, $5, $6)`,
        [userId, h.ticker, h.quantity, h.avgPrice, h.lastPrice, h.segment],
      );
    }
    for (const t of snapshot.trades) {
      await client.query(
        `INSERT INTO trade_history (user_id, ticker, side, quantity, price, segment, executed_at, broker_trade_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (user_id, broker_trade_id) DO NOTHING`,
        [userId, t.ticker, t.side, t.quantity, t.price, t.segment, t.executedAt, t.brokerTradeId],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
