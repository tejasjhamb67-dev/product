// Daily brief pipeline (PRD §6): for each active broker-connected user —
// pull broker data → deterministic risk engine → shared market context
// (once per run, prompt-cached) → per-user Claude narration → render → email.

import { fileURLToPath } from "node:url";
import { db, closeDb } from "../db/client.js";
import { persistSnapshot } from "../broker/kite.js";
import { pullAllBrokers } from "../broker/aggregate.js";
import { computeRiskSnapshot, DEFAULT_THRESHOLDS, type Thresholds } from "../risk/engine.js";
import { loadPriceSeries } from "../risk/prices.js";
import { PRESET_SCENARIOS, runScenario, stressLineFor } from "../risk/scenario.js";
import { NIFTY_INDEX_TICKER } from "../broker/kiteHistory.js";
import { getOrCreateMarketContext } from "../brief/marketContext.js";
import { generateUserBrief } from "../brief/generate.js";
import { renderDailyBrief, renderReauthNudge } from "../brief/render.js";
import { sendEmail } from "../delivery/email.js";
import { feedbackUrl } from "../delivery/feedback.js";
import { ingestDailyPrices } from "../broker/kiteHistory.js";
import { config } from "../config.js";

function istDateString(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now); // YYYY-MM-DD
}

function isIstMonday(now = new Date()): boolean {
  return (
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "short" }).format(now) ===
    "Mon"
  );
}

interface BriefUser {
  id: number;
  email: string;
  tier: string;
}

async function loadThresholds(userId: number): Promise<Thresholds> {
  const { rows } = await db().query(
    `SELECT sector_concentration_pct, correlation_threshold, margin_utilization_pct
     FROM risk_thresholds WHERE user_id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return DEFAULT_THRESHOLDS;
  return {
    sectorConcentrationPct: Number(row.sector_concentration_pct),
    correlationThreshold: Number(row.correlation_threshold),
    marginUtilizationPct: Number(row.margin_utilization_pct),
  };
}

export async function runDailyBriefJob(options: { onlyUserId?: number } = {}): Promise<{
  sent: number;
  reauthNudged: number;
  failed: number;
}> {
  const runDate = istDateString();
  const stats = { sent: 0, reauthNudged: 0, failed: 0 };

  // Daily brief goes to paying, broker-connected users (free tier gets the
  // weekly summary only — PRD flow B).
  const { rows: users } = await db().query<BriefUser>(
    `SELECT u.id, u.email, u.tier
     FROM users u
     JOIN broker_connections bc ON bc.user_id = u.id
     WHERE u.tier IN ('core', 'pro')
       AND u.subscription_status = 'active'
       ${options.onlyUserId ? "AND u.id = $1" : ""}`,
    options.onlyUserId ? [options.onlyUserId] : [],
  );

  if (users.length === 0) {
    console.log(`[daily-brief ${runDate}] no eligible users`);
    return stats;
  }

  // Refresh price history first (best-effort): correlations and scenario
  // betas both read daily_prices.
  try {
    await ingestDailyPrices();
  } catch (err) {
    console.warn(`[daily-brief ${runDate}] price ingestion failed, continuing:`, err);
  }

  // Shared market context: generated once, reused across every user below.
  const marketContext = await getOrCreateMarketContext(runDate);
  console.log(`[daily-brief ${runDate}] market context ready, ${users.length} users`);

  for (const user of users) {
    try {
      const snapshot = await pullAllBrokers(user.id);
      if (!snapshot || snapshot.holdings.length === 0) {
        // Zerodha's daily token expiry needs the user's hands; Groww re-mints
        // its own tokens, so only a failed Kite pull triggers the nudge.
        if (snapshot?.failed.includes("zerodha")) {
          await sendEmail({
            to: user.email,
            subject: "Meridian: reconnect Zerodha to get today's brief",
            html: renderReauthNudge(`${config().APP_BASE_URL}/broker/kite/login`),
          });
          stats.reauthNudged++;
        }
        continue;
      }

      await persistSnapshot(user.id, snapshot);

      const thresholds = await loadThresholds(user.id);
      const priceSeries = await loadPriceSeries([
        ...snapshot.holdings.map((h) => h.ticker),
        NIFTY_INDEX_TICKER,
      ]);
      const risk = computeRiskSnapshot(snapshot.holdings, snapshot.margins, priceSeries, thresholds);

      // Deterministic stress line: what a 3% Nifty drop maps to on this book.
      const stressScenario = PRESET_SCENARIOS.find((s) => s.name === "Nifty -3%")!;
      const stress = runScenario(
        snapshot.holdings,
        stressScenario,
        priceSeries,
        priceSeries.get(NIFTY_INDEX_TICKER) ?? [],
      );
      const stressLine = stress.totalExposure > 0 ? stressLineFor(stress) : undefined;

      // Monday briefs carry last week's journal flags as a callback.
      let journalCallback: string[] | undefined;
      if (isIstMonday()) {
        const { rows: journalRows } = await db().query(
          `SELECT flags FROM journal_summaries
           WHERE user_id = $1 ORDER BY week_start DESC LIMIT 1`,
          [user.id],
        );
        const flags = (journalRows[0]?.flags ?? []) as { detail: string }[];
        if (flags.length > 0) journalCallback = flags.map((f) => f.detail);
      }

      const sections = await generateUserBrief({
        marketContextText: marketContext.text,
        holdings: snapshot.holdings,
        risk,
        thresholds,
        userId: user.id,
      });

      // Insert first so feedback links can carry the brief id.
      const first = renderDailyBrief({
        dateLabel: runDate,
        marketSummaryHtml: marketContext.html,
        portfolioParagraphs: sections.portfolioReadthrough,
        riskNarration: sections.riskNarration,
        riskFlags: risk.flags,
        stressLine,
        journalCallback,
      });
      const { rows } = await db().query(
        `INSERT INTO briefs (user_id, market_summary_html, portfolio_section_html, risk_flags)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [user.id, marketContext.html, first.portfolioSectionHtml, JSON.stringify(risk.flags)],
      );
      const briefId = Number(rows[0].id);

      const { fullHtml } = renderDailyBrief({
        dateLabel: runDate,
        marketSummaryHtml: marketContext.html,
        portfolioParagraphs: sections.portfolioReadthrough,
        riskNarration: sections.riskNarration,
        riskFlags: risk.flags,
        stressLine,
        journalCallback,
        webViewUrl: `${config().APP_BASE_URL}/app/briefs`,
        feedbackUrls: {
          up: feedbackUrl(briefId, user.id, "up"),
          down: feedbackUrl(briefId, user.id, "down"),
        },
      });

      await sendEmail({
        to: user.email,
        subject: `Meridian Daily Brief — ${runDate}`,
        html: fullHtml,
      });
      await db().query("UPDATE briefs SET sent_at = now() WHERE id = $1", [briefId]);
      stats.sent++;
    } catch (err) {
      stats.failed++;
      console.error(`[daily-brief ${runDate}] user ${user.id} failed:`, err);
    }
  }

  console.log(
    `[daily-brief ${runDate}] done: sent=${stats.sent} reauth=${stats.reauthNudged} failed=${stats.failed}`,
  );
  return stats;
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  runDailyBriefJob()
    .then(() => closeDb())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
