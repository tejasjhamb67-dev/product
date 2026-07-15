import { anthropic } from "./anthropic.js";
import { config } from "../config.js";
import type { Holding } from "../broker/types.js";
import type { RiskSnapshot, Thresholds } from "../risk/engine.js";
import { checkCompliance } from "./compliance.js";
import {
  USER_BRIEF_OUTPUT_SCHEMA,
  USER_BRIEF_SYSTEM,
  userBriefMessage,
} from "./prompts.js";

export interface UserBriefSections {
  portfolioReadthrough: string[];
  riskNarration: string;
}

/**
 * Generates the per-user brief sections. The model only NARRATES the
 * precomputed risk numbers (PRD §6/§7) - it receives them as structured input
 * and is instructed never to compute its own.
 *
 * Prompt-caching layout: [static system prompt][shared market context <- cache
 * breakpoint][per-user message]. The prefix is byte-identical across every
 * user in a run, so calls 2..N read the cached prefix (~90% input savings on
 * the shared portion — the margin assumption in business plan §7).
 */
export async function generateUserBrief(input: {
  marketContextText: string;
  holdings: Holding[];
  risk: RiskSnapshot;
  thresholds: Thresholds;
}): Promise<UserBriefSections> {
  const message = userBriefMessage({
    holdingsJson: JSON.stringify(
      input.holdings.map((h) => ({
        ticker: h.ticker,
        quantity: h.quantity,
        avg_price: h.avgPrice,
        last_price: h.lastPrice,
        segment: h.segment,
      })),
    ),
    riskJson: JSON.stringify(input.risk),
    thresholdsJson: JSON.stringify(input.thresholds),
  });

  const attempt = async (extraInstruction?: string): Promise<UserBriefSections> => {
    const response = await anthropic().messages.create({
      model: config().BRIEF_MODEL,
      max_tokens: 2000,
      system: [
        { type: "text", text: USER_BRIEF_SYSTEM },
        {
          type: "text",
          text: `TODAY'S SHARED MARKET CONTEXT:\n${input.marketContextText}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: USER_BRIEF_OUTPUT_SCHEMA,
        },
      },
      messages: [
        {
          role: "user",
          content: extraInstruction ? `${message}\n\n${extraInstruction}` : message,
        },
      ],
    });

    const text = response.content.find(
      (b): b is Extract<typeof b, { type: "text" }> => b.type === "text",
    )?.text;
    if (!text) throw new Error("brief generation returned no text");
    const parsed = JSON.parse(text) as {
      portfolio_readthrough: string[];
      risk_narration: string;
    };
    return {
      portfolioReadthrough: parsed.portfolio_readthrough,
      riskNarration: parsed.risk_narration,
    };
  };

  let sections = await attempt();
  const combined = [...sections.portfolioReadthrough, sections.riskNarration].join("\n");
  const compliance = checkCompliance(combined);
  if (!compliance.ok) {
    // One strict retry; if still prescriptive, fail the user rather than send.
    sections = await attempt(
      `IMPORTANT: your previous draft contained prescriptive language (${compliance.violations.join(
        "; ",
      )}). Rewrite with strictly descriptive language - state portfolio facts and mechanics only, no action suggestions of any kind.`,
    );
    const recheck = checkCompliance(
      [...sections.portfolioReadthrough, sections.riskNarration].join("\n"),
    );
    if (!recheck.ok) {
      throw new Error(
        `brief failed compliance check after retry: ${recheck.violations.join("; ")}`,
      );
    }
  }

  return sections;
}
