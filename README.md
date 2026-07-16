# Meridian

Read-only AI portfolio judgment layer for serious Indian retail traders. Connects to a user's Zerodha account (Kite Connect), generates a daily personalized cross-asset brief on their actual holdings, computes a deterministic portfolio risk snapshot, and journals trading behavior weekly.

**No order placement — ever.** This is a product and compliance invariant, not a missing feature: read-only analytics keeps Meridian outside SEBI's algo-provider/empanelment regime. Do not add order-placement code without a full compliance review.

## Architecture

```
[cron 06:30 IST, Mon-Fri]
  → for each active paid, broker-connected user:
      Kite Connect REST  → holdings / positions / margins / trades
      Risk engine        → concentration, correlation, margin util, overweight
                           (plain code — the LLM never computes numbers)
      Market context     → generated ONCE per run via Claude + web_search,
                           reused (and prompt-cached) across every user
      Claude API         → per-user narration of the precomputed numbers
      HTML render        → email (Resend) + stored in briefs table

[cron Sunday 09:00 IST]
  → weekly behavioral journal: deterministic pattern flags from trade history
```

Key modules:

| Path | What |
|---|---|
| `src/broker/kite.ts` | Kite OAuth + read-only data pulls; daily token expiry + re-auth nudge |
| `src/risk/engine.ts` | Deterministic risk math (sector %, 90d correlations, margin %, overweight) |
| `src/journal/patterns.ts` | Deterministic behavior flags (re-entry after loss, sizing drift, turnover) |
| `src/brief/` | Prompts, shared market context, per-user generation, compliance guard, HTML |
| `src/risk/scenario.ts` | Scenario stress-tests (Pro): shocks → per-holding P&L via betas vs NIFTY |
| `src/broker/kiteHistory.ts` | Daily close ingestion via Kite historical API (feeds correlations + betas) |
| `src/brief/qa.ts` | Portfolio Q&A (Core/Pro): descriptive answers grounded in the risk snapshot |
| `src/brief/usage.ts` | Per-call LLM token accounting (verifies the prompt-cache margin assumptions) |
| `src/delivery/feedback.ts` | Signed one-click 👍/👎 links in the brief email |
| `src/jobs/` | Daily brief pipeline, weekly journal, price ingestion, IST cron scheduler |
| `src/http/server.ts` | Fastify API: OTP auth, Kite OAuth, CSV upload, brief history, Razorpay |

## Compliance posture (do not regress)

- All output is **descriptive of portfolio state**, never **prescriptive of action**. This is enforced in the prompts (`src/brief/prompts.ts`) and backstopped by a deterministic output check (`src/brief/compliance.ts`) — a brief that fails the check after one retry is not sent.
- Broker tokens: AES-256-GCM encrypted at rest, expire daily with Kite's token lifecycle, never logged, **never sent to the LLM** (the model sees only processed holdings/risk JSON).
- Get securities-lawyer review of output copy before public launch (deployment plan §4).

## Deploying (Render, ~10 minutes)

This is a persistent server (Fastify + in-process cron), so it needs a real
process — **not** Vercel serverless. The repo ships a Render blueprint:

1. Push this repo to GitHub.
2. render.com → New → **Blueprint** → select the repo (`render.yaml` is picked up).
3. Fill in the prompted secrets: `ANTHROPIC_API_KEY`, `KITE_API_KEY`/`SECRET`
   (from developers.kite.trade, ₹2000/mo + historical add-on), `RESEND_API_KEY`
   + a verified sender for `EMAIL_FROM`, and the Razorpay keys/plan IDs.
   Set `APP_BASE_URL` to the Render URL (or your domain).
4. In the Kite developer console, set the redirect URL to
   `https://<your-domain>/broker/kite/callback`.
5. Postgres, migrations (run on boot), and the schedulers come up automatically.

Railway/Fly work the same way via the `Dockerfile`. To try it locally without
any external accounts: `npm run seed:demo` then `npm run dev` and sign in is
bypassed by seeding — see `scripts/seedDemo.ts`.

## Running

```bash
cp .env.example .env   # fill in keys
npm install
npm run migrate
npm run dev            # API + scheduler
```

One-off jobs:

```bash
npm run job:daily-brief
npm run job:weekly-journal
npm run job:prices        # backfill daily_prices from Kite historical API
```

Interactive endpoints (session cookie auth):

```
POST /ask                  { question }            Core/Pro — Q&A about your own book
GET  /scenarios/presets                            list preset stress scenarios
POST /scenarios/run        { preset | shocks }     Pro — deterministic P&L simulation
GET  /app/briefs                                   web view of brief history
GET  /ops/usage                                    LLM token spend + cache-hit data
GET  /feedback?...&sig=                            signed 👍/👎 from the email
```

Tests (deterministic modules — risk engine, journal, CSV, crypto, compliance guard):

```bash
npm test
```

## Notes / open items

- `daily_prices` is populated by `job:prices` (also runs at the start of the daily brief job) using Kite's historical candles API — this requires the historical-data add-on on the Kite Connect subscription; without it the job logs and skips, and correlations/betas degrade gracefully. Longer term (PRD §10): evaluate NSE/BSE public feeds vs licensed data.
- Razorpay plan IDs (Core ₹999 / Pro ₹2,499 monthly) are created in the dashboard and set via env.
- Free tier = manual CSV + weekly journal only; Core/Pro = broker-connected daily brief.
- Kite tokens expire ~6-7 AM IST daily; the daily job emails a reconnect nudge when a token has lapsed.
