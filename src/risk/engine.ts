// Deterministic risk engine (PRD §6): every number in the brief is computed
// here in plain code. The LLM only ever NARRATES these numbers — it must never
// calculate them itself.

import type { Holding, MarginSummary } from "../broker/types.js";
import { sectorFor } from "./sectors.js";

export interface Thresholds {
  sectorConcentrationPct: number; // default 30
  correlationThreshold: number; // default 0.7
  marginUtilizationPct: number; // default 70
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  sectorConcentrationPct: 30,
  correlationThreshold: 0.7,
  marginUtilizationPct: 70,
};

export interface RiskFlag {
  kind: "sector_concentration" | "correlation_cluster" | "margin_utilization" | "single_stock_overweight";
  /** Human-readable, descriptive-not-prescriptive summary of the breach. */
  detail: string;
  value: number;
  threshold: number;
}

export interface SectorWeight {
  sector: string;
  weightPct: number;
  tickers: string[];
}

export interface StockWeight {
  ticker: string;
  weightPct: number;
}

export interface CorrelationPair {
  a: string;
  b: string;
  correlation: number;
}

export interface RiskSnapshot {
  totalValue: number;
  sectorWeights: SectorWeight[];
  stockWeights: StockWeight[];
  topCorrelations: CorrelationPair[];
  marginUtilizationPct: number | null;
  flags: RiskFlag[];
}

export function marketValue(h: Holding): number {
  const price = h.lastPrice ?? h.avgPrice;
  return Math.abs(h.quantity) * price;
}

export function computeSectorWeights(holdings: Holding[]): SectorWeight[] {
  const total = holdings.reduce((s, h) => s + marketValue(h), 0);
  if (total === 0) return [];
  const bySector = new Map<string, { value: number; tickers: string[] }>();
  for (const h of holdings) {
    const sector = sectorFor(h.ticker);
    const entry = bySector.get(sector) ?? { value: 0, tickers: [] };
    entry.value += marketValue(h);
    entry.tickers.push(h.ticker);
    bySector.set(sector, entry);
  }
  return [...bySector.entries()]
    .map(([sector, { value, tickers }]) => ({
      sector,
      weightPct: round2((value / total) * 100),
      tickers,
    }))
    .sort((a, b) => b.weightPct - a.weightPct);
}

export function computeStockWeights(holdings: Holding[]): StockWeight[] {
  const total = holdings.reduce((s, h) => s + marketValue(h), 0);
  if (total === 0) return [];
  const byTicker = new Map<string, number>();
  for (const h of holdings) {
    byTicker.set(h.ticker, (byTicker.get(h.ticker) ?? 0) + marketValue(h));
  }
  return [...byTicker.entries()]
    .map(([ticker, value]) => ({ ticker, weightPct: round2((value / total) * 100) }))
    .sort((a, b) => b.weightPct - a.weightPct);
}

/** Pearson correlation of two equal-length return series. */
export function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const xs = a.slice(-n);
  const ys = b.slice(-n);
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - meanX;
    const dy = ys[i]! - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  if (varX === 0 || varY === 0) return 0;
  return cov / Math.sqrt(varX * varY);
}

/** Daily log returns from a close-price series (oldest first). */
export function dailyReturns(closes: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1]!;
    const curr = closes[i]!;
    if (prev > 0 && curr > 0) returns.push(Math.log(curr / prev));
  }
  return returns;
}

/**
 * Pairwise correlations among the top-N holdings by weight, given 90-day
 * close-price history per ticker (oldest first). Tickers without price data
 * are skipped.
 */
export function topHoldingsCorrelations(
  stockWeights: StockWeight[],
  priceSeries: Map<string, number[]>,
  topN = 4,
): CorrelationPair[] {
  const top = stockWeights
    .slice(0, topN)
    .map((w) => w.ticker)
    .filter((t) => (priceSeries.get(t)?.length ?? 0) >= 30);
  const pairs: CorrelationPair[] = [];
  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) {
      const a = top[i]!;
      const b = top[j]!;
      const corr = pearson(dailyReturns(priceSeries.get(a)!), dailyReturns(priceSeries.get(b)!));
      pairs.push({ a, b, correlation: round2(corr) });
    }
  }
  return pairs.sort((x, y) => y.correlation - x.correlation);
}

export function computeMarginUtilizationPct(margins: MarginSummary | null): number | null {
  if (!margins || margins.available <= 0) return null;
  return round2((margins.utilised / margins.available) * 100);
}

export function computeRiskSnapshot(
  holdings: Holding[],
  margins: MarginSummary | null,
  priceSeries: Map<string, number[]>,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): RiskSnapshot {
  const totalValue = round2(holdings.reduce((s, h) => s + marketValue(h), 0));
  const sectorWeights = computeSectorWeights(holdings);
  const stockWeights = computeStockWeights(holdings);
  const topCorrelations = topHoldingsCorrelations(stockWeights, priceSeries);
  const marginUtilizationPct = computeMarginUtilizationPct(margins);

  const flags: RiskFlag[] = [];

  for (const s of sectorWeights) {
    if (s.sector !== "Other" && s.weightPct > thresholds.sectorConcentrationPct) {
      flags.push({
        kind: "sector_concentration",
        detail: `${s.sector} weight is ${s.weightPct}% of the book against a ${thresholds.sectorConcentrationPct}% threshold (${s.tickers.join(", ")})`,
        value: s.weightPct,
        threshold: thresholds.sectorConcentrationPct,
      });
    }
  }

  for (const p of topCorrelations) {
    if (p.correlation > thresholds.correlationThreshold) {
      flags.push({
        kind: "correlation_cluster",
        detail: `${p.a} and ${p.b} show a ${p.correlation} correlation over the last 90 sessions, above the ${thresholds.correlationThreshold} threshold`,
        value: p.correlation,
        threshold: thresholds.correlationThreshold,
      });
    }
  }

  if (marginUtilizationPct != null && marginUtilizationPct > thresholds.marginUtilizationPct) {
    flags.push({
      kind: "margin_utilization",
      detail: `F&O margin utilization is ${marginUtilizationPct}% against a ${thresholds.marginUtilizationPct}% threshold`,
      value: marginUtilizationPct,
      threshold: thresholds.marginUtilizationPct,
    });
  }

  // Single-stock overweight: flag any single name above 25% of the book.
  const SINGLE_STOCK_PCT = 25;
  for (const w of stockWeights) {
    if (w.weightPct > SINGLE_STOCK_PCT) {
      flags.push({
        kind: "single_stock_overweight",
        detail: `${w.ticker} alone is ${w.weightPct}% of the book (single-name threshold ${SINGLE_STOCK_PCT}%)`,
        value: w.weightPct,
        threshold: SINGLE_STOCK_PCT,
      });
    }
  }

  return { totalValue, sectorWeights, stockWeights, topCorrelations, marginUtilizationPct, flags };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
