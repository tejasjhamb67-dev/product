import { describe, expect, it } from "vitest";
import {
  computeMarginUtilizationPct,
  computeRiskSnapshot,
  computeSectorWeights,
  computeStockWeights,
  dailyReturns,
  pearson,
  topHoldingsCorrelations,
  DEFAULT_THRESHOLDS,
} from "../src/risk/engine.js";
import { sectorFor } from "../src/risk/sectors.js";
import type { Holding } from "../src/broker/types.js";

const h = (ticker: string, quantity: number, avgPrice: number, lastPrice?: number): Holding => ({
  ticker,
  quantity,
  avgPrice,
  lastPrice: lastPrice ?? null,
  segment: "equity",
});

describe("sectorFor", () => {
  it("maps known tickers", () => {
    expect(sectorFor("HDFCBANK")).toBe("BFSI");
    expect(sectorFor("TCS")).toBe("IT");
    expect(sectorFor("RELIANCE")).toBe("Energy");
  });
  it("maps index derivatives", () => {
    expect(sectorFor("NIFTY25JANFUT")).toBe("Index derivatives");
    expect(sectorFor("BANKNIFTY25JAN48000CE")).toBe("Index derivatives");
  });
  it("maps stock derivatives to underlying sector", () => {
    expect(sectorFor("RELIANCE25JANFUT")).toBe("Energy");
  });
  it("falls back to Other", () => {
    expect(sectorFor("SOMEUNKNOWN")).toBe("Other");
  });
});

describe("computeSectorWeights", () => {
  it("computes weights that sum to ~100", () => {
    const weights = computeSectorWeights([
      h("HDFCBANK", 10, 100), // BFSI 1000
      h("ICICIBANK", 10, 100), // BFSI 1000
      h("TCS", 10, 200), // IT 2000
    ]);
    const total = weights.reduce((s, w) => s + w.weightPct, 0);
    expect(total).toBeCloseTo(100, 1);
    expect(weights[0]).toMatchObject({ sector: "BFSI", weightPct: 50 });
    expect(weights[1]).toMatchObject({ sector: "IT", weightPct: 50 });
  });

  it("uses last_price when available", () => {
    const weights = computeSectorWeights([h("TCS", 10, 100, 300), h("HDFCBANK", 10, 100)]);
    expect(weights[0]).toMatchObject({ sector: "IT", weightPct: 75 });
  });

  it("returns empty on empty book", () => {
    expect(computeSectorWeights([])).toEqual([]);
  });
});

describe("pearson / dailyReturns", () => {
  it("perfectly correlated series → 1", () => {
    const a = [1, 2, 3, 4, 5];
    const b = [2, 4, 6, 8, 10];
    expect(pearson(a, b)).toBeCloseTo(1, 6);
  });
  it("inversely correlated series → -1", () => {
    expect(pearson([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1, 6);
  });
  it("constant series → 0", () => {
    expect(pearson([1, 1, 1], [1, 2, 3])).toBe(0);
  });
  it("dailyReturns computes log returns", () => {
    const r = dailyReturns([100, 110, 99]);
    expect(r).toHaveLength(2);
    expect(r[0]).toBeCloseTo(Math.log(1.1), 6);
  });
});

describe("topHoldingsCorrelations", () => {
  it("skips tickers with insufficient history and flags correlated pairs", () => {
    const base = Array.from({ length: 60 }, (_, i) => 100 + i + Math.sin(i));
    const series = new Map<string, number[]>([
      ["A", base],
      ["B", base.map((v) => v * 1.02)], // ~perfectly correlated with A
      ["C", [100, 101]], // too short — skipped
    ]);
    const pairs = topHoldingsCorrelations(
      [
        { ticker: "A", weightPct: 40 },
        { ticker: "B", weightPct: 35 },
        { ticker: "C", weightPct: 25 },
      ],
      series,
    );
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ a: "A", b: "B" });
    expect(pairs[0]!.correlation).toBeGreaterThan(0.9);
  });
});

describe("computeMarginUtilizationPct", () => {
  it("computes percentage", () => {
    expect(computeMarginUtilizationPct({ utilised: 70, available: 100 })).toBe(70);
  });
  it("returns null with no margin data", () => {
    expect(computeMarginUtilizationPct(null)).toBeNull();
    expect(computeMarginUtilizationPct({ utilised: 10, available: 0 })).toBeNull();
  });
});

describe("computeRiskSnapshot flags", () => {
  it("flags sector concentration, single-stock overweight, and margin", () => {
    const snapshot = computeRiskSnapshot(
      [
        h("HDFCBANK", 10, 400), // BFSI 4000 = 80% of book, single stock 80%
        h("TCS", 10, 100), // 1000
      ],
      { utilised: 90, available: 100 },
      new Map(),
      DEFAULT_THRESHOLDS,
    );
    const kinds = snapshot.flags.map((f) => f.kind);
    expect(kinds).toContain("sector_concentration");
    expect(kinds).toContain("single_stock_overweight");
    expect(kinds).toContain("margin_utilization");
  });

  it("no flags on a balanced book", () => {
    const snapshot = computeRiskSnapshot(
      [
        h("HDFCBANK", 10, 100),
        h("TCS", 10, 100),
        h("RELIANCE", 10, 100),
        h("SUNPHARMA", 10, 100),
        h("MARUTI", 10, 100),
      ],
      { utilised: 10, available: 100 },
      new Map(),
      DEFAULT_THRESHOLDS,
    );
    expect(snapshot.flags).toEqual([]);
    expect(snapshot.totalValue).toBe(5000);
  });

  it("stock weights aggregate duplicate tickers", () => {
    const weights = computeStockWeights([h("TCS", 5, 100), h("TCS", 5, 100), h("INFY", 10, 100)]);
    expect(weights[0]).toMatchObject({ ticker: "TCS", weightPct: 50 });
  });
});
