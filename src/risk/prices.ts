import { db } from "../db/client.js";

// Price history access for the correlation module. The MVP reads from the
// daily_prices table, which is populated out-of-band (open question in PRD §10:
// whether public NSE/BSE feeds suffice at this scale — resolve before scale-up).

/** Returns a map of ticker → close prices (oldest first) over the last `days` sessions. */
export async function loadPriceSeries(tickers: string[], days = 90): Promise<Map<string, number[]>> {
  const series = new Map<string, number[]>();
  if (tickers.length === 0) return series;
  const { rows } = await db().query(
    `SELECT ticker, close FROM (
       SELECT ticker, close, price_date,
              row_number() OVER (PARTITION BY ticker ORDER BY price_date DESC) AS rn
       FROM daily_prices WHERE ticker = ANY($1)
     ) t WHERE rn <= $2 ORDER BY ticker, price_date ASC`,
    [tickers, days],
  );
  for (const row of rows) {
    const arr = series.get(row.ticker) ?? [];
    arr.push(Number(row.close));
    series.set(row.ticker, arr);
  }
  return series;
}
