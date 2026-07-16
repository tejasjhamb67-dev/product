export type BrokerName = "zerodha" | "groww";

export interface Holding {
  ticker: string;
  quantity: number;
  avgPrice: number;
  lastPrice: number | null;
  segment: "equity" | "fno";
  broker?: BrokerName;
}

export interface Trade {
  ticker: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  segment: "equity" | "fno";
  executedAt: Date;
  brokerTradeId: string | null;
}

export interface MarginSummary {
  /** Margin currently used, in INR */
  utilised: number;
  /** Total available margin (net cash + collateral), in INR */
  available: number;
}

export interface BrokerSnapshot {
  holdings: Holding[];
  trades: Trade[];
  margins: MarginSummary | null;
}
