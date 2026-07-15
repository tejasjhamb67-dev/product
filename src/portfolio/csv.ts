import type { Holding } from "../broker/types.js";

// Manual CSV fallback for free-tier users who don't want to connect a broker.
// Template: ticker,quantity,avg_price[,segment]

export interface CsvParseResult {
  holdings: Holding[];
  errors: string[];
}

export function parseHoldingsCsv(text: string): CsvParseResult {
  const holdings: Holding[] = [];
  const errors: string[] = [];

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let start = 0;
  const first = lines[0]?.toLowerCase() ?? "";
  if (first.startsWith("ticker")) start = 1; // header row

  for (let i = start; i < lines.length; i++) {
    const line = lines[i]!;
    const cols = line.split(",").map((c) => c.trim());
    if (cols.length < 3) {
      errors.push(`line ${i + 1}: expected ticker,quantity,avg_price`);
      continue;
    }
    const [ticker, qtyStr, priceStr, segmentRaw] = cols;
    const quantity = Number(qtyStr);
    const avgPrice = Number(priceStr);
    if (!ticker || !/^[A-Za-z0-9&._-]+$/.test(ticker)) {
      errors.push(`line ${i + 1}: invalid ticker "${ticker}"`);
      continue;
    }
    if (!Number.isFinite(quantity) || quantity === 0) {
      errors.push(`line ${i + 1}: invalid quantity "${qtyStr}"`);
      continue;
    }
    if (!Number.isFinite(avgPrice) || avgPrice <= 0) {
      errors.push(`line ${i + 1}: invalid avg_price "${priceStr}"`);
      continue;
    }
    const segment = segmentRaw?.toLowerCase() === "fno" ? "fno" : "equity";
    holdings.push({ ticker: ticker.toUpperCase(), quantity, avgPrice, lastPrice: null, segment });
  }

  return { holdings, errors };
}

export const CSV_TEMPLATE = `ticker,quantity,avg_price,segment
RELIANCE,50,2450.00,equity
HDFCBANK,100,1520.50,equity
NIFTY25JANFUT,75,23400,fno
`;
