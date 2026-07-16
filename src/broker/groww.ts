// Groww trading API integration — READ-ONLY BY DESIGN (same compliance
// invariant as kite.ts: no order placement anywhere in this codebase).
//
// Endpoint surface (verified against Groww's official Python SDK, growwapi
// 1.5.0): base https://api.groww.in/v1
//   POST /token/api/access      — exchange API key + secret for a daily token
//                                 (body: {key_type:"approval", checksum:
//                                  sha256(secret+timestamp), timestamp})
//   GET  /holdings/user         — demat holdings
//   GET  /positions/user        — F&O/intraday positions
//   GET  /margins/detail/user   — margin details
// All authed requests: Authorization: Bearer <token>, x-api-version: 1.0.
// Responses are wrapped in {status, payload}.
//
// Unlike Kite's browser OAuth, Groww's key+secret flow lets the SERVER mint a
// fresh token whenever the stored one goes stale — so Groww connections never
// need the morning re-auth nudge. We store {apiKey, apiSecret, token,
// tokenDate} as a single encrypted blob in access_token_encrypted.

import { createHash } from "node:crypto";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { decryptToken, encryptToken } from "../crypto/tokens.js";
import type { BrokerSnapshot, Holding, MarginSummary, Trade } from "./types.js";

const BASE = "https://api.groww.in/v1";

interface GrowwCredentials {
  apiKey: string;
  apiSecret: string;
  token: string | null;
  /** IST date (YYYY-MM-DD) the token was minted — Groww tokens expire daily. */
  tokenDate: string | null;
}

function istDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}

function headers(bearer: string): Record<string, string> {
  return {
    Authorization: `Bearer ${bearer}`,
    "Content-Type": "application/json",
    "x-api-version": "1.0",
  };
}

/** Exchanges API key + secret for a daily access token. */
export async function generateGrowwToken(apiKey: string, apiSecret: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const checksum = createHash("sha256").update(apiSecret + String(timestamp)).digest("hex");
  const res = await fetch(`${BASE}/token/api/access`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({ key_type: "approval", checksum, timestamp }),
  });
  if (!res.ok) {
    throw new Error(`Groww token generation failed (HTTP ${res.status})`);
  }
  const body = (await res.json()) as { token?: string | { token?: string } };
  const token = typeof body.token === "string" ? body.token : body.token?.token;
  if (!token) throw new Error("Groww token generation returned no token");
  return token;
}

async function growwGet(token: string, path: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`, { headers: headers(token) });
  if (res.status === 401 || res.status === 403) {
    const err = new Error(`Groww auth failed on ${path}`) as Error & { stale?: boolean };
    err.stale = true;
    throw err;
  }
  if (!res.ok) throw new Error(`Groww ${path} failed (HTTP ${res.status})`);
  const body = (await res.json()) as { status?: string; payload?: unknown };
  if (body.status === "FAILURE") throw new Error(`Groww ${path} returned FAILURE`);
  return body.payload ?? body;
}

/** Validates credentials by minting a token, then stores everything encrypted. */
export async function connectGroww(
  userId: number,
  apiKey: string,
  apiSecret: string,
): Promise<void> {
  const token = await generateGrowwToken(apiKey, apiSecret);
  const creds: GrowwCredentials = { apiKey, apiSecret, token, tokenDate: istDate() };
  const encrypted = encryptToken(JSON.stringify(creds), config().TOKEN_ENCRYPTION_KEY);
  // Token itself dies daily, but we can always re-mint from key+secret, so the
  // connection effectively doesn't expire; use a far-future marker.
  await db().query(
    `INSERT INTO broker_connections (user_id, broker, access_token_encrypted, token_expires_at, refresh_needed)
     VALUES ($1, 'groww', $2, now() + interval '10 years', FALSE)
     ON CONFLICT (user_id, broker) DO UPDATE SET
       access_token_encrypted = EXCLUDED.access_token_encrypted,
       token_expires_at = EXCLUDED.token_expires_at,
       refresh_needed = FALSE,
       connected_at = now()`,
    [userId, encrypted],
  );
}

async function loadCredentials(userId: number): Promise<GrowwCredentials | null> {
  const { rows } = await db().query(
    `SELECT access_token_encrypted FROM broker_connections WHERE user_id = $1 AND broker = 'groww'`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  return JSON.parse(
    decryptToken(row.access_token_encrypted, config().TOKEN_ENCRYPTION_KEY),
  ) as GrowwCredentials;
}

async function saveCredentials(userId: number, creds: GrowwCredentials): Promise<void> {
  await db().query(
    `UPDATE broker_connections SET access_token_encrypted = $1 WHERE user_id = $2 AND broker = 'groww'`,
    [encryptToken(JSON.stringify(creds), config().TOKEN_ENCRYPTION_KEY), userId],
  );
}

/** Returns a valid token, re-minting from key+secret when the daily one is stale. */
async function freshToken(userId: number, creds: GrowwCredentials): Promise<string> {
  if (creds.token && creds.tokenDate === istDate()) return creds.token;
  const token = await generateGrowwToken(creds.apiKey, creds.apiSecret);
  await saveCredentials(userId, { ...creds, token, tokenDate: istDate() });
  return token;
}

export function mapGrowwHoldings(payload: any): Holding[] {
  const rows: any[] = payload?.holdings ?? payload ?? [];
  if (!Array.isArray(rows)) return [];
  return rows
    .map((h: any): Holding | null => {
      const ticker = h.trading_symbol ?? h.tradingSymbol ?? h.symbol;
      const quantity = Number(h.quantity ?? h.net_quantity ?? 0);
      const avgPrice = Number(h.average_price ?? h.avg_price ?? 0);
      if (!ticker || quantity === 0) return null;
      return {
        ticker: String(ticker).toUpperCase(),
        quantity,
        avgPrice,
        lastPrice: h.last_price != null ? Number(h.last_price) : null,
        segment: "equity",
        broker: "groww",
      };
    })
    .filter((h): h is Holding => h !== null);
}

export function mapGrowwPositions(payload: any): Holding[] {
  const rows: any[] = payload?.positions ?? [];
  if (!Array.isArray(rows)) return [];
  return rows
    .map((p: any): Holding | null => {
      const ticker = p.trading_symbol ?? p.tradingSymbol ?? p.symbol;
      // Net quantity: prefer explicit net fields, else credit - debit.
      const net =
        p.net_quantity != null
          ? Number(p.net_quantity)
          : Number(p.credit_quantity ?? 0) - Number(p.debit_quantity ?? 0);
      if (!ticker || net === 0) return null;
      const avgPrice = Number(
        p.net_price ?? p.average_price ?? p.credit_price ?? p.debit_price ?? 0,
      );
      return {
        ticker: String(ticker).toUpperCase(),
        quantity: net,
        avgPrice,
        lastPrice: p.last_price != null ? Number(p.last_price) : null,
        segment: "fno",
        broker: "groww",
      };
    })
    .filter((h): h is Holding => h !== null);
}

export function mapGrowwMargins(payload: any): MarginSummary | null {
  if (!payload) return null;
  const available = Number(
    payload.clear_cash ?? payload.net_margin_available ?? payload.available_margin ?? NaN,
  );
  const utilised = Number(payload.net_margin_used ?? payload.margin_used ?? payload.utilised ?? 0);
  if (!Number.isFinite(available)) return null;
  return { utilised, available: available + utilised };
}

/**
 * Pulls the Groww book. Returns null when the user has no Groww connection.
 * Groww's API has no trade-history endpoint in the current public surface, so
 * trades come back empty — the behavioral journal remains Kite-fed for now.
 */
export async function pullGrowwSnapshot(userId: number): Promise<BrokerSnapshot | null> {
  const creds = await loadCredentials(userId);
  if (!creds) return null;

  let token = await freshToken(userId, creds);

  const get = async (path: string): Promise<any> => {
    try {
      return await growwGet(token, path);
    } catch (err: any) {
      if (err?.stale) {
        // Token invalidated mid-day: re-mint once and retry.
        token = await generateGrowwToken(creds.apiKey, creds.apiSecret);
        await saveCredentials(userId, { ...creds, token, tokenDate: istDate() });
        return growwGet(token, path);
      }
      throw err;
    }
  };

  const [holdingsPayload, positionsPayload, marginsPayload] = await Promise.all([
    get("/holdings/user"),
    get("/positions/user").catch(() => null), // positions can 404 for delivery-only accounts
    get("/margins/detail/user").catch(() => null),
  ]);

  const holdings: Holding[] = [...mapGrowwHoldings(holdingsPayload), ...mapGrowwPositions(positionsPayload)];
  const trades: Trade[] = [];
  return { holdings, trades, margins: mapGrowwMargins(marginsPayload) };
}
