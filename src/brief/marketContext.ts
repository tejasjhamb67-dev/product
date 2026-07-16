import { anthropic } from "./anthropic.js";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { MARKET_CONTEXT_SYSTEM } from "./prompts.js";
import { paragraphsToHtml } from "./render.js";
import { recordUsage } from "./usage.js";

export interface MarketContext {
  text: string;
  html: string;
}

/**
 * Generates the shared market context once per run date and stores it; every
 * user's brief that day reuses it (PRD §6: shared fetch, cached, reused).
 * Sourcing uses the server-side web_search tool (the Morning Coffee pattern).
 */
export async function getOrCreateMarketContext(runDate: string): Promise<MarketContext> {
  const existing = await db().query(
    "SELECT summary_text, summary_html FROM market_context WHERE run_date = $1",
    [runDate],
  );
  if (existing.rows.length > 0) {
    return { text: existing.rows[0].summary_text, html: existing.rows[0].summary_html };
  }

  const response = await anthropic().messages.create({
    model: config().BRIEF_MODEL,
    max_tokens: 4000,
    system: MARKET_CONTEXT_SYSTEM,
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 14 }],
    messages: [
      {
        role: "user",
        content: `Today is ${runDate} (IST, pre-market). Source overnight cross-asset moves and write today's market summary.`,
      },
    ],
  });

  await recordUsage("market_context", config().BRIEF_MODEL, response.usage);

  const text = response.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n\n")
    .trim();
  if (!text) throw new Error("market context generation returned no text");

  const html = paragraphsToHtml(text.split(/\n{2,}/));

  await db().query(
    `INSERT INTO market_context (run_date, summary_html, summary_text)
     VALUES ($1, $2, $3)
     ON CONFLICT (run_date) DO NOTHING`,
    [runDate, html, text],
  );

  return { text, html };
}
