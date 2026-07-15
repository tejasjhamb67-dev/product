import { describe, expect, it } from "vitest";
import { parseHoldingsCsv } from "../src/portfolio/csv.js";

describe("parseHoldingsCsv", () => {
  it("parses valid rows with header", () => {
    const { holdings, errors } = parseHoldingsCsv(
      "ticker,quantity,avg_price\nRELIANCE,50,2450.00\nhdfcbank,100,1520.5",
    );
    expect(errors).toEqual([]);
    expect(holdings).toHaveLength(2);
    expect(holdings[0]).toMatchObject({ ticker: "RELIANCE", quantity: 50, avgPrice: 2450 });
    expect(holdings[1]!.ticker).toBe("HDFCBANK");
  });

  it("parses without header and with segment column", () => {
    const { holdings } = parseHoldingsCsv("NIFTY25JANFUT,75,23400,fno");
    expect(holdings[0]).toMatchObject({ ticker: "NIFTY25JANFUT", segment: "fno" });
  });

  it("collects row errors without dying", () => {
    const { holdings, errors } = parseHoldingsCsv(
      "ticker,quantity,avg_price\nRELIANCE,abc,100\nTCS,10,-5\nGOOD,10,100",
    );
    expect(holdings).toHaveLength(1);
    expect(holdings[0]!.ticker).toBe("GOOD");
    expect(errors).toHaveLength(2);
  });

  it("rejects injection-ish tickers", () => {
    const { holdings, errors } = parseHoldingsCsv("<script>,10,100");
    expect(holdings).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });
});
