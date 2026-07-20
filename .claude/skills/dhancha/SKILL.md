---
name: dhancha
description: >-
  Concentrated equity strategy dhancha (framework) for ANY Indian listed stock —
  large, mid, or small cap, NSE or BSE. Produces a full three-lens deep dive:
  sectoral positioning, fundamental analysis (financials, ratios, shareholding,
  governance red flags), and technical analysis (trend, momentum, volumes,
  relative strength) — with all data fetched LIVE from the web at invocation
  time. Use this skill whenever TJ names an Indian company or ticker and wants
  it analysed, researched, evaluated, or looked up — triggers include "dhancha",
  "deep dive", "analyse <company>", "should I look at <stock>", "what do you
  think of <company>", "full workup on <ticker>", "quick take on <stock>", or
  any request to study an Indian equity's fundamentals, technicals, sector, or
  investment case. Do NOT use for portfolio-level questions about TJ's own
  holdings (that's Meridian's job) or for non-Indian stocks.
---

# Dhancha — Concentrated Equity Deep Dive (India)

A repeatable framework for analysing any stock listed on NSE/BSE. The user
gives a company name (or ticker, or even a rough description like "that Tata
defence company"); you deliver a complete, current, three-lens analysis:
**Sector → Fundamentals → Technicals → Concentrated-portfolio verdict**.

Two things make this a dhancha rather than a one-off report:

1. **Coverage is unlimited** because company resolution is a live lookup, not a
   fixed list. Any of the ~5,500 listed Indian companies works.
2. **Data is live** because every invocation fetches fresh numbers from the
   web. Never answer from memory — your training data is stale for prices,
   quarterly results, shareholding, and news. Memory is only allowed for
   timeless context (what the company does, how its industry works).

## Modes

- **Full dhancha** (default): the complete three-lens workup below. ~15–25
  web fetches; take the time, this is the deliverable.
- **Quick take**: when the user says "quick", "fast look", "one-pager", or asks
  a narrow question. Resolve the company, pull the screener.in snapshot + live
  quote + latest quarter + one news sweep, and answer in tight prose with the
  key numbers. No HTML report unless asked.

## Step 0 — Resolve the company

Turn whatever the user typed into an exact NSE symbol (or BSE code for
BSE-only listings):

1. Search: `"<user's words>" NSE symbol screener.in` (screener.in URLs contain
   the symbol: `screener.in/company/<SYMBOL>/`).
2. If ambiguous (e.g. "Tata Power" vs "Tata Power" is fine, but "Adani" or
   "Jindal" alone is not), pick the most likely match, say so explicitly at the
   top of the analysis, and name the alternatives so the user can redirect.
3. Note the listing venue(s). Small caps are sometimes BSE-only — use the BSE
   scrip code and bseindia.com sources in that case.
4. Record: full legal name, NSE symbol / BSE code, sector & industry, and
   market-cap segment per AMFI convention (top 100 by market cap = large,
   101–250 = mid, 251+ = small). Segment matters later: small caps get extra
   scrutiny on liquidity, pledge, and governance; large caps get more weight
   on valuation vs. history.

## Step 1 — Fetch live data

Read `references/sources.md` for the source map (which site for which data,
URL patterns, and fallbacks). Fetch in parallel where possible. Minimum set
for a full dhancha:

- screener.in company page (10-yr financials, ratios, shareholding, peers)
- Live quote + 52w range + delivery % (NSE / Moneycontrol / Trendlyne)
- Latest quarterly results and any concall/press-release highlights
- Shareholding pattern trend + promoter pledge status
- Sector index performance (relevant NIFTY sectoral index) vs NIFTY 50
- News sweep: last 3–6 months of company-specific news, exchange
  announcements, rating actions
- Technical readings: DMAs, RSI, MACD, support/resistance (Trendlyne /
  Tickertape / TradingView / Investing.com)

Cross-check any number that drives a conclusion against a second source.
If sources disagree materially, say so rather than averaging.

## Step 2 — Three lenses

Work the three reference checklists **in this order** — sector first, because
fundamentals mean nothing out of sectoral context (a 15% ROE is great for a
capital-goods firm, mediocre for FMCG), and technicals last because they time
what the first two justify.

1. **Sectoral** — read `references/sectoral.md`. Where is the sector in its
   cycle, what are the sector-specific KPIs for this industry (the file has
   per-sector playbooks — use the right one), how does this company rank
   against its 3–5 closest listed peers, and what policy/regulatory forces are
   in play.
2. **Fundamental** — read `references/fundamental.md`. Growth, profitability,
   balance sheet, cash flow quality, valuation vs. own history and peers,
   shareholding, management & governance, and the red-flag scan. Every claim
   gets a number; every number gets a source.
3. **Technical** — read `references/technical.md`. Trend structure, key moving
   averages, momentum, volume/delivery character, support/resistance,
   relative strength vs NIFTY and the sector index.

## Step 3 — Concentrated-portfolio verdict

This is the point of the exercise: TJ runs a concentrated book, so every stock
must earn its place. Synthesise, don't summarise:

- **Conviction per lens**: rate each lens High / Medium / Low with a
  one-line justification.
- **The thesis in three sentences**: why this stock, why this sector, why now.
  If you can't write it in three sentences, conviction is Low by definition.
- **What breaks the thesis**: the 2–3 specific, observable events that would
  invalidate it (not generic "market risk" — things like "US generics pricing
  re-deflates", "promoter pledge rises above 20%", "loses the 200-DMA on
  volume").
- **Monitoring triggers**: what to check each quarter (the KPIs from the
  sector playbook) and any near-term events (results date, order announcements,
  regulatory decisions).
- **Where it fits**: core compounder / cyclical position / turnaround bet /
  avoid — and the honest counter-case in two sentences.

Be direct and opinionated — this is TJ's own research tool, not a client
report. But stay descriptive-analytical: no "buy at X, target Y" price
recommendations, and end the report with the one-line disclaimer that this is
research analysis, not investment advice.

## Step 4 — Output

**Full dhancha** → a standalone publishable HTML report in TJ's house style
(same family as the morning-coffee brief): white theme, clean typography,
sectioned layout, every data point's source clickable, timestamp of when data
was fetched (IST). Structure:

```
# <Company> — Dhancha Deep Dive          <date, time IST>
## Snapshot          (price, mcap, segment, sector, 52w range, key ratios strip)
## Sector lens       (cycle, KPIs, peer table, policy)
## Fundamental lens  (growth, profitability, balance sheet, cash flow,
                      valuation, shareholding, governance, red flags)
## Technical lens    (trend, momentum, volumes, levels, relative strength)
## Verdict           (conviction ratings, thesis, thesis-breakers,
                      monitoring triggers, portfolio fit)
## Sources           (every source fetched, linked)
```

Save the HTML file, then publish it as an artifact (or send the file) so TJ
gets a shareable link. If the Artifact tool is unavailable, send the file.
Also give a 5–8 line prose summary of the verdict in chat — TJ should get the
answer without opening the report.

**Quick take** → prose in chat only, numbers inline, sources named.

## Monitor mode — "constantly moving"

Freshness normally comes from re-fetching on every invocation. But when TJ
says "track", "monitor", "keep watching", or "update me on" a stock, set up a
recurring re-run (cron/loop tooling if available in the session — e.g. daily
post-market ~16:30 IST or the cadence TJ names) that repeats the **quick
take** and reports only what changed: price vs the levels from the last full
dhancha, any fired thesis-breakers or monitoring triggers, new filings/news.
Escalate to a fresh full dhancha when a trigger fires or results land. Tell
TJ how to stop the monitor when you set it up.

## Failure handling

- Company not found / delisted / suspended: say so and show the nearest
  matches found.
- A source is down or blocked: use the fallbacks in `references/sources.md`;
  note in the report if a section is thinner than usual because of it.
- Very small / illiquid SME-board stocks: data will be sparse — do the best
  possible workup, flag liquidity and disclosure quality prominently, and
  consider the india-company-turnover-research skill's source list (MCA,
  rating-agency reports) for financials that screeners lack.
