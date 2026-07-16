// Portfolio Q&A — the interactive feature the deployment plan reserved for a
// chat surface. Users ask questions about their own book ("why is my margin
// utilization flagged?", "what's my real exposure to IT?") and get answers
// grounded in their holdings + the precomputed risk snapshot + today's market
// context. Same compliance posture as the brief: descriptive only, and the
// model narrates precomputed numbers rather than computing its own.

import { anthropic } from "./anthropic.js";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { checkCompliance } from "./compliance.js";
import { recordUsage } from "./usage.js";
import type { Holding } from "../broker/types.js";
import type { RiskSnapshot } from "../risk/engine.js";

const QA_SYSTEM = `You are Meridian's portfolio Q&A desk. A user is asking a question about their own portfolio. You receive their holdings JSON, a precomputed risk snapshot, and (when available) today's market context.

Rules:
- Answer only from the data provided plus general market mechanics. If the data doesn't cover the question, say what's missing rather than guessing.
- NEVER independently calculate portfolio numbers - use only figures present in the risk snapshot. You may restate and combine them in prose, but not derive new ones.
- Output must be descriptive of portfolio state and market mechanics, never prescriptive of action. No buy/sell/trim/add/hedge suggestions, no price targets, no "consider..." action language. If the user explicitly asks what to do ("should I sell X?"), explain that Meridian describes portfolio state but does not give investment advice, then offer the relevant descriptive facts.
- 1-3 short paragraphs. Concrete numbers, no filler, no em dashes.`;

const MAX_QUESTIONS_PER_DAY = 25;

export class QaRateLimitError extends Error {}

export async function answerPortfolioQuestion(input: {
  userId: number;
  question: string;
  holdings: Holding[];
  risk: RiskSnapshot;
  marketContextText: string | null;
}): Promise<string> {
  const { rows } = await db().query(
    `SELECT count(*) AS n FROM qa_log WHERE user_id = $1 AND created_at > now() - interval '1 day'`,
    [input.userId],
  );
  if (Number(rows[0]?.n ?? 0) >= MAX_QUESTIONS_PER_DAY) {
    throw new QaRateLimitError(`daily question limit (${MAX_QUESTIONS_PER_DAY}) reached`);
  }

  const model = config().BRIEF_MODEL;
  const response = await anthropic().messages.create({
    model,
    max_tokens: 1500,
    system: [
      { type: "text", text: QA_SYSTEM },
      {
        type: "text",
        text: input.marketContextText
          ? `TODAY'S MARKET CONTEXT:\n${input.marketContextText}`
          : "No market context is available for today.",
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `MY HOLDINGS (JSON):\n${JSON.stringify(
          input.holdings.map((h) => ({
            ticker: h.ticker,
            quantity: h.quantity,
            avg_price: h.avgPrice,
            last_price: h.lastPrice,
            segment: h.segment,
          })),
        )}\n\nPRECOMPUTED RISK SNAPSHOT (JSON):\n${JSON.stringify(input.risk)}\n\nQUESTION: ${input.question}`,
      },
    ],
  });

  await recordUsage("portfolio_qa", model, response.usage, input.userId);

  const answer = response.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!answer) throw new Error("Q&A returned no text");

  const compliance = checkCompliance(answer);
  if (!compliance.ok) {
    // Q&A is synchronous and user-facing: fail closed rather than retry-loop.
    throw new Error(`answer failed compliance check: ${compliance.violations.join("; ")}`);
  }

  await db().query(`INSERT INTO qa_log (user_id, question, answer) VALUES ($1, $2, $3)`, [
    input.userId,
    input.question,
    answer,
  ]);

  return answer;
}
