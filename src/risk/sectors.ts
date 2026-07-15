// Static NSE ticker → sector map for the MVP. Unknown tickers fall into
// "Other". Phase 2: replace with an instrument master feed.

const SECTOR_MAP: Record<string, string> = {
  // BFSI
  HDFCBANK: "BFSI",
  ICICIBANK: "BFSI",
  SBIN: "BFSI",
  KOTAKBANK: "BFSI",
  AXISBANK: "BFSI",
  INDUSINDBK: "BFSI",
  BAJFINANCE: "BFSI",
  BAJAJFINSV: "BFSI",
  HDFCLIFE: "BFSI",
  SBILIFE: "BFSI",
  ICICIGI: "BFSI",
  ICICIPRULI: "BFSI",
  PFC: "BFSI",
  RECLTD: "BFSI",
  // IT
  TCS: "IT",
  INFY: "IT",
  WIPRO: "IT",
  HCLTECH: "IT",
  TECHM: "IT",
  LTIM: "IT",
  PERSISTENT: "IT",
  COFORGE: "IT",
  // Energy / Oil & Gas
  RELIANCE: "Energy",
  ONGC: "Energy",
  IOC: "Energy",
  BPCL: "Energy",
  GAIL: "Energy",
  NTPC: "Energy",
  POWERGRID: "Energy",
  TATAPOWER: "Energy",
  ADANIGREEN: "Energy",
  ADANIPOWER: "Energy",
  // Auto
  TATAMOTORS: "Auto",
  MARUTI: "Auto",
  "M&M": "Auto",
  BAJAJ_AUTO: "Auto",
  "BAJAJ-AUTO": "Auto",
  EICHERMOT: "Auto",
  HEROMOTOCO: "Auto",
  TVSMOTOR: "Auto",
  // Pharma / Healthcare
  SUNPHARMA: "Pharma",
  DRREDDY: "Pharma",
  CIPLA: "Pharma",
  DIVISLAB: "Pharma",
  APOLLOHOSP: "Pharma",
  LUPIN: "Pharma",
  AUROPHARMA: "Pharma",
  // FMCG
  HINDUNILVR: "FMCG",
  ITC: "FMCG",
  NESTLEIND: "FMCG",
  BRITANNIA: "FMCG",
  DABUR: "FMCG",
  TATACONSUM: "FMCG",
  VBL: "FMCG",
  // Metals
  TATASTEEL: "Metals",
  JSWSTEEL: "Metals",
  HINDALCO: "Metals",
  VEDL: "Metals",
  NMDC: "Metals",
  SAIL: "Metals",
  // Infra / Cement / Construction
  LT: "Infra",
  ULTRACEMCO: "Infra",
  GRASIM: "Infra",
  SHREECEM: "Infra",
  AMBUJACEM: "Infra",
  ADANIPORTS: "Infra",
  ADANIENT: "Infra",
  DLF: "Infra",
  // Telecom / Media
  BHARTIARTL: "Telecom",
  IDEA: "Telecom",
  INDUSTOWER: "Telecom",
  ZEEL: "Telecom",
  // Consumer / Retail / Internet
  TITAN: "Consumer",
  ASIANPAINT: "Consumer",
  DMART: "Consumer",
  TRENT: "Consumer",
  ZOMATO: "Consumer",
  NYKAA: "Consumer",
  PAYTM: "Consumer",
  POLICYBZR: "Consumer",
  IRCTC: "Consumer",
  // Aviation
  INDIGO: "Aviation",
  SPICEJET: "Aviation",
};

export function sectorFor(ticker: string): string {
  // Derivatives map to the underlying's sector where recognizable
  // (e.g. NIFTY25JANFUT → Index).
  const upper = ticker.toUpperCase();
  if (upper.startsWith("NIFTY") || upper.startsWith("BANKNIFTY") || upper.startsWith("FINNIFTY") || upper.startsWith("SENSEX")) {
    return "Index derivatives";
  }
  if (SECTOR_MAP[upper]) return SECTOR_MAP[upper];
  // Strip derivative suffixes like RELIANCE25JANFUT / RELIANCE25JAN2500CE
  const base = upper.match(/^([A-Z&-]+?)\d{2}[A-Z]{3}/)?.[1];
  if (base && SECTOR_MAP[base]) return SECTOR_MAP[base];
  return "Other";
}
