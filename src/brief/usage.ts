import type Anthropic from "@anthropic-ai/sdk";
import { db } from "../db/client.js";

// Records per-call token usage so the margin assumptions in business plan §7
// (shared-context cache hits across users) are measured, not assumed.
// Never throws — cost accounting must not fail a brief.

export type UsagePurpose = "market_context" | "user_brief" | "portfolio_qa";

export async function recordUsage(
  purpose: UsagePurpose,
  model: string,
  usage: Anthropic.Usage,
  userId?: number,
): Promise<void> {
  try {
    await db().query(
      `INSERT INTO llm_usage
         (user_id, purpose, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId ?? null,
        purpose,
        model,
        usage.input_tokens ?? 0,
        usage.output_tokens ?? 0,
        usage.cache_read_input_tokens ?? 0,
        usage.cache_creation_input_tokens ?? 0,
      ],
    );
  } catch (err) {
    console.warn("[usage] failed to record llm usage:", err);
  }
}

/** Daily aggregate for the ops endpoint: tokens by purpose + cache hit ratio. */
export async function usageSummary(days = 7): Promise<unknown[]> {
  const { rows } = await db().query(
    `SELECT date_trunc('day', created_at)::date AS day,
            purpose,
            count(*) AS calls,
            sum(input_tokens) AS input_tokens,
            sum(output_tokens) AS output_tokens,
            sum(cache_read_tokens) AS cache_read_tokens,
            sum(cache_creation_tokens) AS cache_creation_tokens
     FROM llm_usage
     WHERE created_at > now() - ($1 || ' days')::interval
     GROUP BY 1, 2 ORDER BY 1 DESC, 2`,
    [days],
  );
  return rows;
}
