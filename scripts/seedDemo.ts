// Seeds a demo account with a realistic book so the product can be exercised
// end-to-end without live broker/LLM credentials. Idempotent-ish: wipes and
// re-creates the demo user. Never run against production.
//
//   npm run seed:demo

import { db, closeDb } from "../src/db/client.js";
import { migrate } from "../src/db/migrate.js";
import { NIFTY_INDEX_TICKER } from "../src/broker/kiteHistory.js";
import { computeRiskSnapshot, DEFAULT_THRESHOLDS } from "../src/risk/engine.js";
import { loadPriceSeries } from "../src/risk/prices.js";
import { paragraphsToHtml, renderDailyBrief } from "../src/brief/render.js";
import { PRESET_SCENARIOS, runScenario, stressLineFor } from "../src/risk/scenario.js";
import type { Holding } from "../src/broker/types.js";

const DEMO_EMAIL = "demo@meridian.example";

// A concentrated-on-purpose book: heavy BFSI (triggers the sector flag),
// two correlated banks, an index future hedge, and one option (excluded
// from stress math, demonstrating the honesty note).
// Multi-broker demo: F&O + core bank book on Zerodha, long-term equity
// holdings on Groww — the union is one aggregated book.
const HOLDINGS: Holding[] = [
  { ticker: "HDFCBANK", quantity: 120, avgPrice: 1480, lastPrice: 1552, segment: "equity", broker: "zerodha" },
  { ticker: "ICICIBANK", quantity: 150, avgPrice: 1015, lastPrice: 1098, segment: "equity", broker: "zerodha" },
  { ticker: "BAJFINANCE", quantity: 25, avgPrice: 6900, lastPrice: 7285, segment: "equity", broker: "zerodha" },
  { ticker: "RELIANCE", quantity: 60, avgPrice: 2410, lastPrice: 2530, segment: "equity", broker: "groww" },
  { ticker: "TCS", quantity: 45, avgPrice: 3890, lastPrice: 4102, segment: "equity", broker: "groww" },
  { ticker: "TATAMOTORS", quantity: 110, avgPrice: 905, lastPrice: 968, segment: "equity", broker: "groww" },
  { ticker: "SUNPHARMA", quantity: 55, avgPrice: 1610, lastPrice: 1685, segment: "equity", broker: "groww" },
  { ticker: "NIFTY25JULFUT", quantity: -25, avgPrice: 24980, lastPrice: 25120, segment: "fno", broker: "zerodha" },
  { ticker: "BANKNIFTY25JUL53000CE", quantity: 30, avgPrice: 420, lastPrice: 385, segment: "fno", broker: "zerodha" },
];

// Deterministic pseudo-random walk (mulberry32) so re-seeding is stable.
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 95 sessions of synthetic closes; per-ticker beta to a common market factor. */
function syntheticPrices(): Map<string, number[]> {
  const random = rng(42);
  const days = 95;
  const market: number[] = [];
  for (let i = 0; i < days; i++) market.push((random() - 0.48) * 0.02); // slight drift up

  const spec: Record<string, { start: number; beta: number; idio: number }> = {
    [NIFTY_INDEX_TICKER]: { start: 24000, beta: 1, idio: 0 },
    HDFCBANK: { start: 1400, beta: 1.15, idio: 0.004 }, // banks: high common factor
    ICICIBANK: { start: 960, beta: 1.2, idio: 0.004 },
    BAJFINANCE: { start: 6500, beta: 1.4, idio: 0.009 },
    RELIANCE: { start: 2350, beta: 0.9, idio: 0.008 },
    TCS: { start: 3800, beta: 0.7, idio: 0.009 },
    TATAMOTORS: { start: 860, beta: 1.3, idio: 0.012 },
    SUNPHARMA: { start: 1550, beta: 0.5, idio: 0.01 },
  };

  const series = new Map<string, number[]>();
  for (const [ticker, { start, beta, idio }] of Object.entries(spec)) {
    const closes = [start];
    for (let i = 1; i < days; i++) {
      const shockCommon = market[i]! * beta;
      const shockIdio = (random() - 0.5) * 2 * idio;
      closes.push(Math.max(1, closes[i - 1]! * (1 + shockCommon + shockIdio)));
    }
    series.set(ticker, closes.map((c) => Math.round(c * 100) / 100));
  }
  return series;
}

const MARKET_SUMMARY = `US equities closed mixed overnight with the S&P 500 off 0.4% as June CPI printed a tenth hot at 3.1% year on year, pushing the 10-year Treasury yield back above 4.45% and trimming September rate-cut odds to about 55%. The dollar index firmed to 104.8, which kept USDINR pinned near 83.9 in the offshore market. That combination, higher US real yields and a firmer dollar, is the classic setup for FII selling pressure in rate-sensitive Indian financials at the open, and bank stocks carry the highest weight in most retail books.

Crude complicated the picture: Brent rose 2.6% to $87.40 on a larger-than-expected US inventory draw and fresh Red Sea shipping disruptions. For Indian markets that flows through as pressure on OMC marketing margins, higher jet fuel costs for airlines, and input cost concerns for paint and FMCG names, while upstream producers and gas names benefit. Asian markets are trading soft, with the Nikkei down 0.8% and Hang Seng flat; GIFT Nifty futures point to an opening about 60 points below yesterday's close.

Domestically, first-quarter earnings season begins in earnest this week with two large private banks and a major IT services firm reporting. IT commentary on client spending will matter more than the headline numbers given the sector's underperformance this quarter, and any margin surprise from the banks lands directly on the heaviest-owned segment of the market.`;

const PORTFOLIO_PARAGRAPHS = [
  "Your book leans hard into the two forces moving overnight. BFSI is your largest exposure through HDFCBANK, ICICIBANK and BAJFINANCE, and the hot US CPI print plus firmer dollar is exactly the mix that has historically drawn FII selling in Indian private banks at the open. BAJFINANCE is the most rate-sensitive of the three given its wholesale funding mix. On the other side, your short NIFTY July future acts as a partial buffer if the GIFT Nifty weakness carries through.",
  "Crude at $87 cuts both ways for you: RELIANCE benefits on the upstream and petchem side, while TATAMOTORS faces input cost and JLR fuel-sensitivity questions at the margin. TCS sits ahead of sector earnings this week, so today's move is likely to be sentiment-driven rather than fundamental. SUNPHARMA remains your least market-correlated name and did most of the diversification work in your book over the past quarter.",
];

const RISK_NARRATION =
  "Your BFSI weight is 45.2% of the book against the 30% threshold you set, driven mainly by HDFCBANK and ICICIBANK, whose 90-session return correlation stands at 0.81. F&O margin utilization is 61%, inside your 70% threshold. No single name breaches the 25% single-stock line, though HDFCBANK is the closest at 20.9%.";

async function main(): Promise<void> {
  await migrate();
  const pool = db();

  await pool.query(`DELETE FROM users WHERE email = $1`, [DEMO_EMAIL]);
  const { rows: userRows } = await pool.query(
    `INSERT INTO users (email, tier, subscription_status) VALUES ($1, 'pro', 'active') RETURNING id`,
    [DEMO_EMAIL],
  );
  const uid = userRows[0].id as number;
  await pool.query(`INSERT INTO risk_thresholds (user_id) VALUES ($1)`, [uid]);

  // Holdings snapshot
  for (const h of HOLDINGS) {
    await pool.query(
      `INSERT INTO holdings_snapshot (user_id, source, ticker, quantity, avg_price, last_price, segment, broker)
       VALUES ($1, 'broker', $2, $3, $4, $5, $6, $7)`,
      [uid, h.ticker, h.quantity, h.avgPrice, h.lastPrice, h.segment, h.broker],
    );
  }

  // Price history (synthetic, deterministic)
  const prices = syntheticPrices();
  const today = new Date();
  for (const [ticker, closes] of prices) {
    for (let i = 0; i < closes.length; i++) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - (closes.length - i));
      await pool.query(
        `INSERT INTO daily_prices (ticker, price_date, close) VALUES ($1, $2, $3)
         ON CONFLICT (ticker, price_date) DO UPDATE SET close = EXCLUDED.close`,
        [ticker, d.toISOString().slice(0, 10), closes[i]],
      );
    }
  }

  // Trade history for the journal: a revenge-trading day + sizing drift.
  const day = (offset: number, h: number, m: number) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - offset);
    d.setUTCHours(h, m, 0, 0);
    return d;
  };
  const trades: [string, "buy" | "sell", number, number, string, Date][] = [
    // Losing exit then re-entry 18 minutes later (revenge proxy)
    ["NIFTY25JULFUT", "buy", 25, 25230, "fno", day(3, 4, 5)],
    ["NIFTY25JULFUT", "sell", 25, 25160, "fno", day(3, 5, 12)],
    ["NIFTY25JULFUT", "buy", 25, 25180, "fno", day(3, 5, 30)],
    ["NIFTY25JULFUT", "sell", 25, 25120, "fno", day(3, 7, 45)],
    // Three losing scalps then 2.5x size
    ["BANKNIFTY25JUL53000CE", "buy", 30, 480, "fno", day(2, 4, 15)],
    ["BANKNIFTY25JUL53000CE", "sell", 30, 455, "fno", day(2, 4, 40)],
    ["BANKNIFTY25JUL53000CE", "buy", 30, 450, "fno", day(2, 5, 10)],
    ["BANKNIFTY25JUL53000CE", "sell", 30, 430, "fno", day(2, 5, 35)],
    ["BANKNIFTY25JUL53000CE", "buy", 30, 435, "fno", day(2, 6, 0)],
    ["BANKNIFTY25JUL53000CE", "sell", 30, 410, "fno", day(2, 6, 30)],
    ["BANKNIFTY25JUL53000CE", "buy", 75, 405, "fno", day(2, 6, 50)],
    ["BANKNIFTY25JUL53000CE", "sell", 75, 385, "fno", day(2, 7, 20)],
    // A calm equity add
    ["SUNPHARMA", "buy", 15, 1672, "equity", day(4, 6, 30)],
  ];
  let seq = 0;
  for (const [ticker, side, qty, price, segment, at] of trades) {
    await pool.query(
      `INSERT INTO trade_history (user_id, ticker, side, quantity, price, segment, executed_at, broker_trade_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [uid, ticker, side, qty, price, segment, at, `demo-${++seq}`],
    );
  }

  // Journal summary for last week (what the Monday brief calls back to).
  const weekStart = new Date(today);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  const journalFlags = [
    {
      kind: "reentry_after_loss",
      detail:
        "Re-entered the same instrument within 60 minutes of a losing exit on 1 occasion this week: NIFTY25JULFUT (18 min after a losing exit)",
      occurrences: 1,
    },
    {
      kind: "sizing_up_after_losses",
      detail:
        "Position size increased to 2.5x the prior average immediately after 3 consecutive losing trades (1 instance this week)",
      occurrences: 1,
    },
  ];
  await pool.query(
    `INSERT INTO journal_summaries (user_id, week_start, week_end, flags, sent_at)
     VALUES ($1, $2, $3, $4, now())`,
    [
      uid,
      weekStart.toISOString().slice(0, 10),
      today.toISOString().slice(0, 10),
      JSON.stringify(journalFlags),
    ],
  );

  // Market context for today (canned; in production this comes from Claude+web search).
  const runDate = new Date().toISOString().slice(0, 10);
  const marketHtml = paragraphsToHtml(MARKET_SUMMARY.split(/\n{2,}/));
  await pool.query(
    `INSERT INTO market_context (run_date, summary_html, summary_text) VALUES ($1, $2, $3)
     ON CONFLICT (run_date) DO UPDATE SET summary_html = EXCLUDED.summary_html, summary_text = EXCLUDED.summary_text`,
    [runDate, marketHtml, MARKET_SUMMARY],
  );

  // A stored brief exactly as the pipeline would produce it — risk numbers
  // and stress line computed by the real engines, prose canned.
  const priceSeries = await loadPriceSeries([
    ...HOLDINGS.map((h) => h.ticker),
    NIFTY_INDEX_TICKER,
  ]);
  const risk = computeRiskSnapshot(
    HOLDINGS,
    { utilised: 305000, available: 500000 },
    priceSeries,
    DEFAULT_THRESHOLDS,
  );
  const stress = runScenario(
    HOLDINGS,
    PRESET_SCENARIOS.find((s) => s.name === "Nifty -3%")!,
    priceSeries,
    priceSeries.get(NIFTY_INDEX_TICKER) ?? [],
  );
  const rendered = renderDailyBrief({
    dateLabel: runDate,
    marketSummaryHtml: marketHtml,
    portfolioParagraphs: PORTFOLIO_PARAGRAPHS,
    riskNarration: RISK_NARRATION,
    riskFlags: risk.flags,
    stressLine: stressLineFor(stress),
    journalCallback: journalFlags.map((f) => f.detail),
  });
  await pool.query(
    `INSERT INTO briefs (user_id, market_summary_html, portfolio_section_html, risk_flags, sent_at)
     VALUES ($1, $2, $3, $4, now())`,
    [uid, marketHtml, rendered.portfolioSectionHtml, JSON.stringify(risk.flags)],
  );

  console.log(`seeded demo user ${DEMO_EMAIL} (id ${uid}, pro/active)`);
  console.log(`risk flags: ${risk.flags.length}, stress: ${stressLineFor(stress)}`);
}

main()
  .then(() => closeDb())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
