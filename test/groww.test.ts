import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://x:x@localhost:5432/x";
process.env.TOKEN_ENCRYPTION_KEY ??= "a".repeat(64);
process.env.SESSION_SIGNING_KEY ??= "s".repeat(64);
process.env.ANTHROPIC_API_KEY ??= "test";
process.env.KITE_API_KEY ??= "test";
process.env.KITE_API_SECRET ??= "test";
process.env.RESEND_API_KEY ??= "test";
process.env.EMAIL_FROM ??= "test@test.in";

const { mapGrowwHoldings, mapGrowwPositions, mapGrowwMargins } = await import(
  "../src/broker/groww.js"
);

describe("mapGrowwHoldings", () => {
  it("maps the documented holdings payload shape", () => {
    const holdings = mapGrowwHoldings({
      holdings: [
        { isin: "INE002A01018", trading_symbol: "RELIANCE", quantity: 10, average_price: 2450.5 },
        { isin: "INE040A01034", trading_symbol: "hdfcbank", quantity: 5, average_price: 1500 },
      ],
    });
    expect(holdings).toHaveLength(2);
    expect(holdings[0]).toMatchObject({
      ticker: "RELIANCE",
      quantity: 10,
      avgPrice: 2450.5,
      segment: "equity",
      broker: "groww",
    });
    expect(holdings[1]!.ticker).toBe("HDFCBANK");
  });

  it("skips zero-quantity and malformed rows", () => {
    const holdings = mapGrowwHoldings({
      holdings: [
        { trading_symbol: "X", quantity: 0, average_price: 10 },
        { average_price: 10, quantity: 5 }, // no symbol
        { trading_symbol: "OK", quantity: 1, average_price: 10 },
      ],
    });
    expect(holdings.map((h) => h.ticker)).toEqual(["OK"]);
  });

  it("tolerates a bare array payload", () => {
    expect(mapGrowwHoldings([{ trading_symbol: "A", quantity: 2, average_price: 5 }])).toHaveLength(1);
    expect(mapGrowwHoldings(null)).toEqual([]);
  });
});

describe("mapGrowwPositions", () => {
  it("nets credit/debit quantities", () => {
    const positions = mapGrowwPositions({
      positions: [
        { trading_symbol: "NIFTY25JULFUT", credit_quantity: 50, debit_quantity: 75, credit_price: 100, debit_price: 101 },
      ],
    });
    expect(positions[0]).toMatchObject({ quantity: -25, segment: "fno", broker: "groww" });
  });

  it("prefers explicit net_quantity and drops flat positions", () => {
    const positions = mapGrowwPositions({
      positions: [
        { trading_symbol: "A", net_quantity: 10, net_price: 99 },
        { trading_symbol: "B", net_quantity: 0 },
      ],
    });
    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({ ticker: "A", quantity: 10, avgPrice: 99 });
  });
});

describe("mapGrowwMargins", () => {
  it("maps clear_cash + margin used", () => {
    const m = mapGrowwMargins({ clear_cash: 100000, net_margin_used: 40000 });
    expect(m).toEqual({ utilised: 40000, available: 140000 });
  });
  it("returns null when shape is unrecognized", () => {
    expect(mapGrowwMargins({ something_else: 1 })).toBeNull();
    expect(mapGrowwMargins(null)).toBeNull();
  });
});
