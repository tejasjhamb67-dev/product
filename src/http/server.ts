import { Readable } from "node:stream";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import { z } from "zod";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { issueOtp, verifyOtp } from "../auth/otp.js";
import { createSessionToken, verifySessionToken } from "../auth/session.js";
import { completeKiteLogin, kiteLoginUrl } from "../broker/kite.js";
import { parseHoldingsCsv, CSV_TEMPLATE } from "../portfolio/csv.js";
import {
  createSubscription,
  handleWebhookEvent,
  verifyWebhookSignature,
} from "../billing/razorpay.js";
import { runDailyBriefJob } from "../jobs/dailyBrief.js";
import { verifyFeedbackSignature } from "../delivery/feedback.js";
import { answerPortfolioQuestion, QaRateLimitError } from "../brief/qa.js";
import { usageSummary } from "../brief/usage.js";
import { loadCurrentBook } from "../portfolio/current.js";
import { computeRiskSnapshot, DEFAULT_THRESHOLDS } from "../risk/engine.js";
import { loadPriceSeries } from "../risk/prices.js";
import { PRESET_SCENARIOS, runScenario, type Scenario } from "../risk/scenario.js";
import { NIFTY_INDEX_TICKER } from "../broker/kiteHistory.js";
import { renderWebPage, escapeHtml } from "../brief/render.js";
import { landingPage, loginPage, dashboardPage } from "./pages.js";
import { sectorFor } from "../risk/sectors.js";
import { marketValue } from "../risk/engine.js";

const SESSION_COOKIE = "meridian_session";

declare module "fastify" {
  interface FastifyRequest {
    userId?: number;
  }
}

function requireAuth(req: FastifyRequest, reply: FastifyReply): number | undefined {
  const token = req.cookies[SESSION_COOKIE];
  const payload = token ? verifySessionToken(token, config().SESSION_SIGNING_KEY) : null;
  if (!payload) {
    reply.code(401).send({ error: "not authenticated" });
    return undefined;
  }
  return payload.uid;
}

export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: true });
  void app.register(cookie);

  app.get("/health", async () => ({ ok: true }));

  // ---- Web UI ----

  app.get("/", async (_req, reply) => reply.type("text/html; charset=utf-8").send(landingPage()));

  app.get("/app", async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    const payload = token ? verifySessionToken(token, config().SESSION_SIGNING_KEY) : null;
    return reply.type("text/html; charset=utf-8").send(payload ? dashboardPage() : loginPage());
  });

  app.get("/api/dashboard", async (req, reply) => {
    const uid = requireAuth(req, reply);
    if (uid == null) return;

    const { rows: userRows } = await db().query(
      `SELECT email, tier, subscription_status FROM users WHERE id = $1`,
      [uid],
    );
    const user = userRows[0];
    if (!user) return reply.code(404).send({ error: "user not found" });

    const book = await loadCurrentBook(uid);
    if (!book) {
      return {
        email: user.email,
        tier: user.tier,
        book: null,
        holdings: [],
        risk: null,
        presets: PRESET_SCENARIOS.map((p) => ({ name: p.name })),
        briefs: [],
      };
    }

    const priceSeries = await loadPriceSeries(book.holdings.map((h) => h.ticker));
    const risk = computeRiskSnapshot(book.holdings, book.margins, priceSeries, DEFAULT_THRESHOLDS);

    const holdings = book.holdings
      .map((h) => ({
        ticker: h.ticker,
        sector: sectorFor(h.ticker),
        quantity: h.quantity,
        value: marketValue(h),
        weightPct: risk.stockWeights.find((w) => w.ticker === h.ticker)?.weightPct ?? 0,
      }))
      .sort((a, b) => b.value - a.value);

    const { rows: briefRows } = await db().query(
      `SELECT id, generated_at, jsonb_array_length(risk_flags) AS flag_count
       FROM briefs WHERE user_id = $1 ORDER BY generated_at DESC LIMIT 10`,
      [uid],
    );

    return {
      email: user.email,
      tier: user.tier,
      book: { source: book.source },
      holdings,
      risk,
      presets: PRESET_SCENARIOS.map((p) => ({ name: p.name })),
      briefs: briefRows.map((b) => ({
        id: Number(b.id),
        date: new Date(b.generated_at).toISOString().slice(0, 10),
        flagCount: Number(b.flag_count),
      })),
    };
  });

  // ---- Auth (email/OTP) ----

  app.post("/auth/otp/request", async (req, reply) => {
    const body = z.object({ email: z.string().email() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid email" });
    await issueOtp(body.data.email);
    return { ok: true };
  });

  app.post("/auth/otp/verify", async (req, reply) => {
    const body = z
      .object({ email: z.string().email(), code: z.string().regex(/^\d{6}$/) })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid input" });
    const uid = await verifyOtp(body.data.email, body.data.code);
    if (uid == null) return reply.code(401).send({ error: "invalid or expired code" });
    const token = createSessionToken(uid, config().SESSION_SIGNING_KEY);
    void reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: config().NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return { ok: true, userId: uid };
  });

  app.post("/auth/logout", async (_req, reply) => {
    void reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  // ---- Broker connection (Kite Connect OAuth) ----

  app.get("/broker/kite/login", async (req, reply) => {
    const uid = requireAuth(req, reply);
    if (uid == null) return;
    return reply.redirect(kiteLoginUrl());
  });

  // Kite redirects here with ?request_token=... after the user logs in.
  app.get("/broker/kite/callback", async (req, reply) => {
    const uid = requireAuth(req, reply);
    if (uid == null) return;
    const query = z.object({ request_token: z.string().min(1) }).safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "missing request_token" });
    await completeKiteLogin(uid, query.data.request_token);
    return { ok: true, connected: "zerodha" };
  });

  app.get("/broker/status", async (req, reply) => {
    const uid = requireAuth(req, reply);
    if (uid == null) return;
    const { rows } = await db().query(
      `SELECT broker, token_expires_at, refresh_needed, connected_at
       FROM broker_connections WHERE user_id = $1`,
      [uid],
    );
    return { connections: rows };
  });

  // ---- Manual CSV portfolio upload (free-tier path, PRD flow B) ----

  app.get("/portfolio/csv-template", async (_req, reply) => {
    return reply.type("text/csv").send(CSV_TEMPLATE);
  });

  app.post("/portfolio/csv", async (req, reply) => {
    const uid = requireAuth(req, reply);
    if (uid == null) return;
    const body = z.object({ csv: z.string().min(1).max(200_000) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "expected { csv: string }" });
    const { holdings, errors } = parseHoldingsCsv(body.data.csv);
    if (holdings.length === 0) {
      return reply.code(400).send({ error: "no valid rows", details: errors });
    }
    for (const h of holdings) {
      await db().query(
        `INSERT INTO holdings_snapshot (user_id, source, ticker, quantity, avg_price, segment)
         VALUES ($1, 'manual', $2, $3, $4, $5)`,
        [uid, h.ticker, h.quantity, h.avgPrice, h.segment],
      );
    }
    return { ok: true, imported: holdings.length, warnings: errors };
  });

  // ---- Briefs (web view of history, PRD §3.7) ----

  app.get("/briefs", async (req, reply) => {
    const uid = requireAuth(req, reply);
    if (uid == null) return;
    const { rows } = await db().query(
      `SELECT id, generated_at, risk_flags, sent_at FROM briefs
       WHERE user_id = $1 ORDER BY generated_at DESC LIMIT 60`,
      [uid],
    );
    return { briefs: rows };
  });

  app.get("/briefs/:id", async (req, reply) => {
    const uid = requireAuth(req, reply);
    if (uid == null) return;
    const params = z.object({ id: z.coerce.number() }).safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: "bad id" });
    const { rows } = await db().query(
      `SELECT market_summary_html, portfolio_section_html, generated_at
       FROM briefs WHERE id = $1 AND user_id = $2`,
      [params.data.id, uid],
    );
    const brief = rows[0];
    if (!brief) return reply.code(404).send({ error: "not found" });
    return reply
      .type("text/html")
      .send(`${brief.market_summary_html}\n${brief.portfolio_section_html}`);
  });

  // "Generate my first brief now" (PRD flow A step 4 - instant gratification).
  app.post("/briefs/generate-now", async (req, reply) => {
    const uid = requireAuth(req, reply);
    if (uid == null) return;
    const stats = await runDailyBriefJob({ onlyUserId: uid });
    if (stats.sent === 0) {
      return reply.code(409).send({
        error:
          "could not generate a brief - check that your broker is connected, your subscription is active, and you hold positions",
        stats,
      });
    }
    return { ok: true };
  });

  // ---- Billing (Razorpay) ----

  app.post("/billing/subscribe", async (req, reply) => {
    const uid = requireAuth(req, reply);
    if (uid == null) return;
    const body = z.object({ tier: z.enum(["core", "pro"]) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "tier must be core or pro" });
    const sub = await createSubscription(uid, body.data.tier);
    return { ok: true, ...sub };
  });

  // Razorpay webhook - signature verified against the raw body.
  app.post(
    "/billing/webhook",
    {
      config: { rawBody: true },
      preParsing: (req, _reply, payload, done) => {
        const chunks: Buffer[] = [];
        payload.on("data", (c: Buffer) => chunks.push(c));
        payload.on("end", () => {
          (req as any).rawBodyString = Buffer.concat(chunks).toString("utf8");
          done(null, bufferToStream(Buffer.concat(chunks)));
        });
      },
    },
    async (req, reply) => {
      const signature = req.headers["x-razorpay-signature"];
      const raw = (req as any).rawBodyString as string | undefined;
      if (typeof signature !== "string" || !raw || !verifyWebhookSignature(raw, signature)) {
        return reply.code(400).send({ error: "invalid signature" });
      }
      await handleWebhookEvent(JSON.parse(raw));
      return { ok: true };
    },
  );

  // ---- Brief feedback (signed links from email, no login needed) ----

  app.get("/feedback", async (req, reply) => {
    const query = z
      .object({
        brief: z.coerce.number(),
        user: z.coerce.number(),
        score: z.enum(["up", "down"]),
        sig: z.string().min(1),
      })
      .safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "bad feedback link" });
    const { brief, user, score, sig } = query.data;
    if (!verifyFeedbackSignature(brief, user, score, sig)) {
      return reply.code(403).send({ error: "invalid signature" });
    }
    await db().query(
      `INSERT INTO brief_feedback (brief_id, user_id, score)
       VALUES ($1, $2, $3)
       ON CONFLICT (brief_id, user_id) DO UPDATE SET score = EXCLUDED.score, created_at = now()`,
      [brief, user, score],
    );
    return reply
      .type("text/html")
      .send(
        renderWebPage(
          "Feedback",
          new Date().toDateString(),
          `<p style="font-size:15px;color:#1a1a1a;">Thanks - your feedback was recorded.</p>`,
        ),
      );
  });

  // ---- Portfolio Q&A (interactive, Core/Pro) ----

  app.post("/ask", async (req, reply) => {
    const uid = requireAuth(req, reply);
    if (uid == null) return;
    if (!(await hasTier(uid, ["core", "pro"]))) {
      return reply.code(402).send({ error: "portfolio Q&A requires an active Core or Pro subscription" });
    }
    const body = z.object({ question: z.string().min(3).max(1000) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "expected { question: string }" });

    const book = await loadCurrentBook(uid);
    if (!book) {
      return reply.code(409).send({ error: "no portfolio data - connect a broker or upload a CSV first" });
    }

    const priceSeries = await loadPriceSeries(book.holdings.map((h) => h.ticker));
    const risk = computeRiskSnapshot(book.holdings, book.margins, priceSeries, DEFAULT_THRESHOLDS);
    const { rows: ctxRows } = await db().query(
      `SELECT summary_text FROM market_context ORDER BY run_date DESC LIMIT 1`,
    );

    try {
      const answer = await answerPortfolioQuestion({
        userId: uid,
        question: body.data.question,
        holdings: book.holdings,
        risk,
        marketContextText: ctxRows[0]?.summary_text ?? null,
      });
      return { answer, bookSource: book.source };
    } catch (err) {
      if (err instanceof QaRateLimitError) return reply.code(429).send({ error: err.message });
      throw err;
    }
  });

  // ---- Scenario stress-test (Pro) ----

  app.get("/scenarios/presets", async (req, reply) => {
    const uid = requireAuth(req, reply);
    if (uid == null) return;
    return { presets: PRESET_SCENARIOS };
  });

  app.post("/scenarios/run", async (req, reply) => {
    const uid = requireAuth(req, reply);
    if (uid == null) return;
    if (!(await hasTier(uid, ["pro"]))) {
      return reply.code(402).send({ error: "scenario stress-tests require an active Pro subscription" });
    }
    const body = z
      .object({
        preset: z.string().optional(),
        shocks: z
          .object({
            indexPct: z.number().min(-50).max(50).optional(),
            sectorPct: z.record(z.number().min(-50).max(50)).optional(),
            tickerPct: z.record(z.number().min(-90).max(90)).optional(),
          })
          .optional(),
      })
      .refine((v) => v.preset || v.shocks, { message: "provide a preset name or custom shocks" })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message ?? "bad input" });

    let scenario: Scenario;
    if (body.data.preset) {
      const found = PRESET_SCENARIOS.find((s) => s.name === body.data.preset);
      if (!found) return reply.code(404).send({ error: "unknown preset" });
      scenario = found;
    } else {
      scenario = { name: "Custom scenario", shocks: body.data.shocks! };
    }

    const book = await loadCurrentBook(uid);
    if (!book) {
      return reply.code(409).send({ error: "no portfolio data - connect a broker or upload a CSV first" });
    }

    const tickers = book.holdings.map((h) => h.ticker);
    const priceSeries = await loadPriceSeries([...tickers, NIFTY_INDEX_TICKER]);
    const indexCloses = priceSeries.get(NIFTY_INDEX_TICKER) ?? [];

    const result = runScenario(book.holdings, scenario, priceSeries, indexCloses);
    return { ...result, bookSource: book.source };
  });

  // ---- Web view (brief archive) ----

  app.get("/app/briefs", async (req, reply) => {
    const uid = requireAuth(req, reply);
    if (uid == null) return;
    const { rows } = await db().query(
      `SELECT id, generated_at, jsonb_array_length(risk_flags) AS flag_count
       FROM briefs WHERE user_id = $1 ORDER BY generated_at DESC LIMIT 60`,
      [uid],
    );
    const items =
      rows.length === 0
        ? `<p style="font-size:15px;color:#6b6b6b;">No briefs yet. Your first one arrives the morning after you connect a broker.</p>`
        : `<ul style="margin:0;padding-left:0;list-style:none;">${rows
            .map((r) => {
              const date = new Date(r.generated_at).toISOString().slice(0, 10);
              const flags = Number(r.flag_count) > 0 ? ` &middot; ${r.flag_count} risk flag(s)` : "";
              return `<li style="margin:0 0 10px;font-size:15px;"><a href="/app/briefs/${r.id}" style="color:#8a6d3b;">${escapeHtml(date)}</a><span style="color:#6b6b6b;font-size:13px;">${flags}</span></li>`;
            })
            .join("\n")}</ul>`;
    return reply.type("text/html; charset=utf-8").send(renderWebPage("Brief Archive", "", items));
  });

  app.get("/app/briefs/:id", async (req, reply) => {
    const uid = requireAuth(req, reply);
    if (uid == null) return;
    const params = z.object({ id: z.coerce.number() }).safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: "bad id" });
    const { rows } = await db().query(
      `SELECT market_summary_html, portfolio_section_html, generated_at
       FROM briefs WHERE id = $1 AND user_id = $2`,
      [params.data.id, uid],
    );
    const brief = rows[0];
    if (!brief) return reply.code(404).send({ error: "not found" });
    const date = new Date(brief.generated_at).toISOString().slice(0, 10);
    return reply
      .type("text/html")
      .send(
        renderWebPage(
          "Daily Brief",
          date,
          `${brief.market_summary_html}\n${brief.portfolio_section_html}\n<p style="margin-top:20px;font-size:13px;"><a href="/app/briefs" style="color:#8a6d3b;">&larr; All briefs</a></p>`,
        ),
      );
  });

  // ---- Ops: LLM spend + cache-hit verification ----

  app.get("/ops/usage", async (req, reply) => {
    const uid = requireAuth(req, reply);
    if (uid == null) return;
    return { usage: await usageSummary(14) };
  });

  // ---- Risk thresholds (configurable, PRD §5) ----

  app.put("/settings/thresholds", async (req, reply) => {
    const uid = requireAuth(req, reply);
    if (uid == null) return;
    const body = z
      .object({
        sector_concentration_pct: z.number().min(5).max(100).optional(),
        correlation_threshold: z.number().min(0).max(1).optional(),
        margin_utilization_pct: z.number().min(5).max(100).optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid thresholds" });
    const t = body.data;
    await db().query(
      `INSERT INTO risk_thresholds (user_id, sector_concentration_pct, correlation_threshold, margin_utilization_pct)
       VALUES ($1, COALESCE($2, 30), COALESCE($3, 0.7), COALESCE($4, 70))
       ON CONFLICT (user_id) DO UPDATE SET
         sector_concentration_pct = COALESCE($2, risk_thresholds.sector_concentration_pct),
         correlation_threshold    = COALESCE($3, risk_thresholds.correlation_threshold),
         margin_utilization_pct   = COALESCE($4, risk_thresholds.margin_utilization_pct)`,
      [uid, t.sector_concentration_pct, t.correlation_threshold, t.margin_utilization_pct],
    );
    return { ok: true };
  });

  return app;
}

function bufferToStream(buf: Buffer): Readable {
  return Readable.from(buf);
}

async function hasTier(userId: number, tiers: string[]): Promise<boolean> {
  const { rows } = await db().query(
    `SELECT 1 FROM users WHERE id = $1 AND tier = ANY($2) AND subscription_status = 'active'`,
    [userId, tiers],
  );
  return rows.length > 0;
}
