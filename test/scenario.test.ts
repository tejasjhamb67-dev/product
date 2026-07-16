import { describe, expect, it } from "vitest";
import { betaVsIndex, formatInr, instrumentKind, PRESET_SCENARIOS, runScenario, stressLineFor } from "../src/risk/scenario.js";
import type { Holding } from "../src/broker/types.js";

const h = (
  ticker: string,
  quantity: number,
  price: number,
  segment: "equity" | "fno" = "equity",
): Holding => ({ ticker, quantity, avgPrice: price, lastPrice: price, segment });

// A synthetic index series and a stock that moves at exactly 2x the index.
function syntheticSeries(): { index: number[]; doubleBeta: number[] } {
  const index: number[] = [100];
  const doubleBeta: number[] = [100];
  for (let i = 1; i < 60; i++) {
    const move = i % 2 === 0 ? 0.01 : -0.005; // alternating index returns
    index.push(index[i - 1]! * (1 + move));
    doubleBeta.push(doubleBeta[i - 1]! * (1 + 2 * move));
  }
  return { index, doubleBeta };
}

describe("betaVsIndex", () => {
  it("recovers a 2x beta from synthetic data", () => {
    const { index, doubleBeta } = syntheticSeries();
    const beta = betaVsIndex(doubleBeta, index);
    expect(beta).not.toBeNull();
    expect(beta!).toBeGreaterThan(1.8);
    expect(beta!).toBeLessThan(2.2);
  });

  it("returns null with too little history", () => {
    expect(betaVsIndex([100, 101, 102], [100, 101, 102])).toBeNull();
  });
});

describe("runScenario", () => {
  it("applies ticker > sector > index priority", () => {
    const { index, doubleBeta } = syntheticSeries();
    const result = runScenario(
      [h("HDFCBANK", 10, 100), h("TCS", 10, 100), h("RELIANCE", 10, 100)],
      {
        name: "test",
        shocks: {
          indexPct: -3,
          sectorPct: { BFSI: -6 },
          tickerPct: { RELIANCE: 2 },
        },
      },
      new Map([["TCS", doubleBeta]]),
      index,
    );

    const byTicker = Object.fromEntries(result.impacts.map((i) => [i.ticker, i]));
    expect(byTicker.RELIANCE!.basis).toBe("ticker");
    expect(byTicker.RELIANCE!.pnl).toBeCloseTo(20, 0); // 1000 * 2%
    expect(byTicker.HDFCBANK!.basis).toBe("sector");
    expect(byTicker.HDFCBANK!.pnl).toBeCloseTo(-60, 0); // 1000 * -6%
    expect(byTicker.TCS!.basis).toBe("index_beta");
    expect(byTicker.TCS!.beta).toBeGreaterThan(1.5); // ~2x beta → ~-6% applied
  });

  it("short positions gain on a down move", () => {
    const result = runScenario(
      [h("NIFTY25JANFUT", -75, 200, "fno")], // net short index future
      { name: "crash", shocks: { indexPct: -5 } },
      new Map(),
      [],
    );
    expect(result.impacts[0]!.pnl).toBeGreaterThan(0);
    expect(result.impacts[0]!.pnl).toBeCloseTo(750, 0); // -15000 * -5%
  });

  it("defaults beta to 1 without price history", () => {
    const result = runScenario(
      [h("SOMEUNKNOWN", 10, 100)],
      { name: "down", shocks: { indexPct: -3 } },
      new Map(),
      [],
    );
    expect(result.impacts[0]!.appliedShockPct).toBe(-3);
    expect(result.totalPnl).toBeCloseTo(-30, 0);
  });

  it("index futures track the index one-for-one", () => {
    const result = runScenario(
      [h("BANKNIFTY25JANFUT", 30, 500, "fno")],
      { name: "rally", shocks: { indexPct: 3 } },
      new Map(),
      [],
    );
    expect(result.impacts[0]!.beta).toBe(1);
    expect(result.impacts[0]!.pnl).toBeCloseTo(450, 0); // 15000 * 3%
  });

  it("options are excluded from linear stress math and reported", () => {
    const result = runScenario(
      [h("BANKNIFTY25JAN48000CE", 30, 500, "fno"), h("HDFCBANK", 10, 100)],
      { name: "crash", shocks: { indexPct: -5 } },
      new Map(),
      [],
    );
    expect(result.excludedOptions).toEqual(["BANKNIFTY25JAN48000CE"]);
    const option = result.impacts.find((i) => i.ticker === "BANKNIFTY25JAN48000CE")!;
    expect(option.basis).toBe("excluded_option");
    expect(option.pnl).toBe(0);
    // Totals only count the stressed (non-option) book.
    expect(result.totalExposure).toBe(1000);
    expect(result.totalPnl).toBeCloseTo(-50, 0);
  });

  it("classifies instruments", () => {
    expect(instrumentKind("RELIANCE", "equity")).toBe("equity");
    expect(instrumentKind("NIFTY25JANFUT", "fno")).toBe("future");
    expect(instrumentKind("NIFTY25JAN23000CE", "fno")).toBe("option");
    expect(instrumentKind("BANKNIFTY25JAN48000PE", "fno")).toBe("option");
  });

  it("pnlPctOfBook uses gross exposure", () => {
    const result = runScenario(
      [h("A", 10, 100), h("B", -10, 100)],
      { name: "flat book", shocks: { indexPct: -4 } },
      new Map(),
      [],
    );
    expect(result.totalExposure).toBe(2000);
    expect(result.totalPnl).toBeCloseTo(0, 5); // long loses, short gains
  });

  it("presets are well-formed", () => {
    for (const preset of PRESET_SCENARIOS) {
      expect(preset.name.length).toBeGreaterThan(0);
      const hasShock =
        preset.shocks.indexPct !== undefined ||
        preset.shocks.sectorPct !== undefined ||
        preset.shocks.tickerPct !== undefined;
      expect(hasShock).toBe(true);
    }
  });
});

describe("stressLineFor / formatInr", () => {
  it("formats INR with Indian digit grouping", () => {
    expect(formatInr(-42342.4)).toBe("-₹42,342");
    expect(formatInr(1250000)).toBe("+₹12,50,000");
  });

  it("mentions excluded options only when present", () => {
    const base = runScenario(
      [h("HDFCBANK", 100, 1500)],
      { name: "Nifty -3%", shocks: { indexPct: -3 } },
      new Map(),
      [],
    );
    expect(stressLineFor(base)).toContain("Nifty -3%");
    expect(stressLineFor(base)).not.toContain("Option positions");

    const withOption = runScenario(
      [h("HDFCBANK", 100, 1500), h("NIFTY25JAN23000CE", 75, 200, "fno")],
      { name: "Nifty -3%", shocks: { indexPct: -3 } },
      new Map(),
      [],
    );
    expect(stressLineFor(withOption)).toContain("NIFTY25JAN23000CE");
  });
});
