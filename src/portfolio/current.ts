import { db } from "../db/client.js";
import { pullBrokerSnapshot } from "../broker/kite.js";
import type { Holding, MarginSummary } from "../broker/types.js";

// Resolves a user's current book for interactive features (Q&A, scenarios):
// live broker pull when a valid token exists, otherwise the latest stored
// snapshot (broker or manual CSV).

export interface CurrentBook {
  holdings: Holding[];
  margins: MarginSummary | null;
  source: "live" | "snapshot";
}

export async function loadCurrentBook(userId: number): Promise<CurrentBook | null> {
  try {
    const live = await pullBrokerSnapshot(userId);
    if (live && live.holdings.length > 0) {
      return { holdings: live.holdings, margins: live.margins, source: "live" };
    }
  } catch (err) {
    console.warn(`[book] live pull failed for user ${userId}, falling back to snapshot:`, err);
  }

  // Latest snapshot batch: rows written in one transaction share captured_at;
  // manual CSV rows land within a second of each other — a 1-minute window
  // around the max groups them safely.
  const { rows } = await db().query(
    `SELECT ticker, quantity, avg_price, last_price, segment FROM holdings_snapshot
     WHERE user_id = $1
       AND captured_at >= (
         SELECT max(captured_at) - interval '1 minute' FROM holdings_snapshot WHERE user_id = $1
       )`,
    [userId],
  );
  if (rows.length === 0) return null;

  const holdings: Holding[] = rows.map((r) => ({
    ticker: r.ticker,
    quantity: Number(r.quantity),
    avgPrice: Number(r.avg_price),
    lastPrice: r.last_price != null ? Number(r.last_price) : null,
    segment: r.segment,
  }));
  return { holdings, margins: null, source: "snapshot" };
}
