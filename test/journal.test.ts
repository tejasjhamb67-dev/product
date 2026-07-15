import { describe, expect, it } from "vitest";
import {
  detectHighTurnover,
  detectReentryAfterLoss,
  detectSizingUpAfterLosses,
  pairRoundTrips,
} from "../src/journal/patterns.js";
import type { Trade } from "../src/broker/types.js";

let seq = 0;
const t = (
  ticker: string,
  side: "buy" | "sell",
  quantity: number,
  price: number,
  at: string,
): Trade => ({
  ticker,
  side,
  quantity,
  price,
  segment: "fno",
  executedAt: new Date(at),
  brokerTradeId: String(++seq),
});

describe("pairRoundTrips", () => {
  it("pairs a long round trip with realized pnl", () => {
    const trips = pairRoundTrips([
      t("NIFTY", "buy", 50, 100, "2026-07-13T04:00:00Z"),
      t("NIFTY", "sell", 50, 90, "2026-07-13T05:00:00Z"),
    ]);
    expect(trips).toHaveLength(1);
    expect(trips[0]!.pnl).toBe(-500);
  });

  it("pairs a short round trip", () => {
    const trips = pairRoundTrips([
      t("NIFTY", "sell", 50, 100, "2026-07-13T04:00:00Z"),
      t("NIFTY", "buy", 50, 90, "2026-07-13T05:00:00Z"),
    ]);
    expect(trips).toHaveLength(1);
    expect(trips[0]!.pnl).toBe(500);
  });

  it("handles partial fills FIFO", () => {
    const trips = pairRoundTrips([
      t("X", "buy", 100, 10, "2026-07-13T04:00:00Z"),
      t("X", "sell", 40, 12, "2026-07-13T05:00:00Z"),
      t("X", "sell", 60, 8, "2026-07-13T06:00:00Z"),
    ]);
    expect(trips).toHaveLength(2);
    expect(trips[0]!.pnl).toBe(80); // 40 * (12-10)
    expect(trips[1]!.pnl).toBe(-120); // 60 * (8-10)
  });
});

describe("detectReentryAfterLoss", () => {
  it("flags same-day re-entry within the window after a losing exit", () => {
    const flag = detectReentryAfterLoss([
      t("NIFTY", "buy", 50, 100, "2026-07-13T04:00:00Z"),
      t("NIFTY", "sell", 50, 95, "2026-07-13T04:30:00Z"), // losing exit
      t("NIFTY", "buy", 50, 96, "2026-07-13T04:45:00Z"), // re-entry 15 min later
    ]);
    expect(flag).not.toBeNull();
    expect(flag!.occurrences).toBe(1);
    expect(flag!.detail).toContain("NIFTY");
  });

  it("does not flag re-entry after a winning exit", () => {
    const flag = detectReentryAfterLoss([
      t("NIFTY", "buy", 50, 100, "2026-07-13T04:00:00Z"),
      t("NIFTY", "sell", 50, 110, "2026-07-13T04:30:00Z"), // winner
      t("NIFTY", "buy", 50, 111, "2026-07-13T04:45:00Z"),
    ]);
    expect(flag).toBeNull();
  });

  it("does not flag re-entry outside the window", () => {
    const flag = detectReentryAfterLoss([
      t("NIFTY", "buy", 50, 100, "2026-07-13T04:00:00Z"),
      t("NIFTY", "sell", 50, 95, "2026-07-13T04:30:00Z"),
      t("NIFTY", "buy", 50, 96, "2026-07-13T07:00:00Z"), // 2.5h later
    ]);
    expect(flag).toBeNull();
  });
});

describe("detectSizingUpAfterLosses", () => {
  it("flags size increase after three consecutive losses", () => {
    const trades: Trade[] = [];
    // Three losing round trips at ~1000 notional each
    for (let i = 0; i < 3; i++) {
      trades.push(t("A" + i, "buy", 10, 100, `2026-07-13T0${i + 1}:00:00Z`));
      trades.push(t("A" + i, "sell", 10, 90, `2026-07-13T0${i + 1}:30:00Z`));
    }
    // Next entry at 3x the size
    trades.push(t("BIG", "buy", 30, 100, "2026-07-13T05:00:00Z"));
    trades.push(t("BIG", "sell", 30, 101, "2026-07-13T05:30:00Z"));

    const flag = detectSizingUpAfterLosses(trades);
    expect(flag).not.toBeNull();
    expect(flag!.detail).toMatch(/3 consecutive losing/);
  });

  it("does not flag steady sizing", () => {
    const trades: Trade[] = [];
    for (let i = 0; i < 5; i++) {
      trades.push(t("A" + i, "buy", 10, 100, `2026-07-13T0${i + 1}:00:00Z`));
      trades.push(t("A" + i, "sell", 10, 90, `2026-07-13T0${i + 1}:30:00Z`));
    }
    expect(detectSizingUpAfterLosses(trades)).toBeNull();
  });
});

describe("detectHighTurnover", () => {
  it("flags >15 trades in a day", () => {
    const trades = Array.from({ length: 16 }, (_, i) =>
      t("NIFTY", i % 2 === 0 ? "buy" : "sell", 50, 100 + i, `2026-07-13T0${(i % 9) + 1}:0${i % 6}:00Z`),
    );
    const flag = detectHighTurnover(trades);
    expect(flag).not.toBeNull();
    expect(flag!.detail).toContain("16");
  });

  it("does not flag a quiet week", () => {
    expect(
      detectHighTurnover([
        t("NIFTY", "buy", 50, 100, "2026-07-13T04:00:00Z"),
        t("NIFTY", "sell", 50, 101, "2026-07-13T05:00:00Z"),
      ]),
    ).toBeNull();
  });
});
