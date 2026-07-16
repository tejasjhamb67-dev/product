// Scenario stress-test engine (Pro tier; roadmap item #2).
//
// Deterministic P&L simulation: given user-input shocks, compute the
// per-holding and total P&L impact on the user's ACTUAL book. Not a canned
// model — exposures come from live positions and betas estimated from the
// same 90-day price history the correlation module uses.
//
// Shock resolution priority per holding: explicit ticker shock > sector
// shock > index shock scaled by the holding's beta to NIFTY.
//
// Like the risk engine, this is plain code. The LLM never computes these
// numbers; if we ever narrate a scenario, the model only describes output
// produced here.

import type { Holding } from "../broker/types.js";
import { dailyReturns, pearson } from "./engine.js";
import { sectorFor } from "./sectors.js";

export interface ScenarioShocks {
  /** Broad index move, in percent (e.g. -3 for "Nifty down 3%"). */
  indexPct?: number;
  /** Sector-specific moves in percent, keyed by sector name (see risk/sectors.ts). */
  sectorPct?: Record<string, number>;
  /** Instrument-specific moves in percent, keyed by ticker. */
  tickerPct?: Record<string, number>;
}

export interface Scenario {
  name: string;
  shocks: ScenarioShocks;
}

export interface HoldingImpact {
  ticker: string;
  sector: string;
  /** Signed exposure in INR (negative for net short positions). */
  exposure: number;
  /** The percent move applied to this holding. */
  appliedShockPct: number;
  /** How the shock was resolved. */
  basis: "ticker" | "sector" | "index_beta" | "none";
  /** Beta used when basis is index_beta. */
  beta: number | null;
  pnl: number;
}

export interface ScenarioResult {
  scenario: Scenario;
  totalPnl: number;
  totalExposure: number;
  /** P&L as percent of gross book value. */
  pnlPctOfBook: number;
  impacts: HoldingImpact[];
}

/**
 * Beta of a ticker's daily returns vs the index's daily returns:
 * cov(r, m) / var(m). Returns null with under 30 overlapping sessions.
 */
export function betaVsIndex(tickerCloses: number[], indexCloses: number[]): number | null {
  const r = dailyReturns(tickerCloses);
  const m = dailyReturns(indexCloses);
  const n = Math.min(r.length, m.length);
  if (n < 30) return null;
  const rs = r.slice(-n);
  const ms = m.slice(-n);
  const meanR = rs.reduce((s, v) => s + v, 0) / n;
  const meanM = ms.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let varM = 0;
  for (let i = 0; i < n; i++) {
    cov += (rs[i]! - meanR) * (ms[i]! - meanM);
    varM += (ms[i]! - meanM) ** 2;
  }
  if (varM === 0) return null;
  return round2(cov / varM);
}

/** Index derivatives track the index one-for-one under an index shock. */
function isIndexInstrument(ticker: string): boolean {
  return sectorFor(ticker) === "Index derivatives";
}

export function runScenario(
  holdings: Holding[],
  scenario: Scenario,
  priceSeries: Map<string, number[]>,
  indexCloses: number[],
): ScenarioResult {
  const impacts: HoldingImpact[] = [];

  for (const h of holdings) {
    const price = h.lastPrice ?? h.avgPrice;
    const exposure = h.quantity * price; // signed: shorts are negative
    const sector = sectorFor(h.ticker);

    let appliedShockPct = 0;
    let basis: HoldingImpact["basis"] = "none";
    let beta: number | null = null;

    const tickerShock = scenario.shocks.tickerPct?.[h.ticker];
    const sectorShock = scenario.shocks.sectorPct?.[sector];

    if (tickerShock !== undefined) {
      appliedShockPct = tickerShock;
      basis = "ticker";
    } else if (sectorShock !== undefined) {
      appliedShockPct = sectorShock;
      basis = "sector";
    } else if (scenario.shocks.indexPct !== undefined) {
      if (isIndexInstrument(h.ticker)) {
        beta = 1;
      } else {
        const closes = priceSeries.get(h.ticker);
        beta = closes ? betaVsIndex(closes, indexCloses) : null;
        if (beta == null) beta = 1; // conservative default: moves with the market
      }
      appliedShockPct = round2(scenario.shocks.indexPct * beta);
      basis = "index_beta";
    }

    impacts.push({
      ticker: h.ticker,
      sector,
      exposure: round2(exposure),
      appliedShockPct,
      basis,
      beta,
      pnl: round2((exposure * appliedShockPct) / 100),
    });
  }

  const totalPnl = round2(impacts.reduce((s, i) => s + i.pnl, 0));
  const totalExposure = round2(impacts.reduce((s, i) => s + Math.abs(i.exposure), 0));

  return {
    scenario,
    totalPnl,
    totalExposure,
    pnlPctOfBook: totalExposure > 0 ? round2((totalPnl / totalExposure) * 100) : 0,
    impacts: impacts.sort((a, b) => a.pnl - b.pnl),
  };
}

/** Preset scenarios exposed in the API; users can also submit custom shocks. */
export const PRESET_SCENARIOS: Scenario[] = [
  { name: "Nifty -3%", shocks: { indexPct: -3 } },
  { name: "Nifty -5%", shocks: { indexPct: -5 } },
  {
    name: "Nifty -3%, crude +5%",
    shocks: {
      indexPct: -3,
      // Crude up: upstream energy holds up, fuel consumers hit harder.
      sectorPct: { Energy: -1, Aviation: -6, Consumer: -4 },
    },
  },
  {
    name: "Banking stress (BFSI -6%)",
    shocks: { indexPct: -2, sectorPct: { BFSI: -6 } },
  },
  {
    name: "IT selloff on US recession fears",
    shocks: { indexPct: -2, sectorPct: { IT: -7 } },
  },
  { name: "Relief rally +3%", shocks: { indexPct: 3 } },
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
