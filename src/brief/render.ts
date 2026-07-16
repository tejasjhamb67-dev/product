import type { RiskFlag } from "../risk/engine.js";
import type { JournalFlag } from "../journal/patterns.js";

// Email-safe HTML rendering (inline styles only). One tuned template, reused
// for daily briefs and weekly journals — don't redesign per deployment plan.

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function paragraphsToHtml(paragraphs: string[]): string {
  return paragraphs
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map(
      (p) =>
        `<p style="margin:0 0 14px;line-height:1.6;color:#1a1a1a;font-size:15px;">${escapeHtml(p)}</p>`,
    )
    .join("\n");
}

const DISCLAIMER =
  "Meridian describes the state of your portfolio and market mechanics. It does not provide investment advice, recommendations, or buy/sell calls, and it cannot place orders. Meridian has read-only access to your broker data and never writes anything back to your broker.";

function shell(title: string, dateLabel: string, body: string): string {
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px;">
    <div style="border-bottom:2px solid #1a1a1a;padding-bottom:12px;margin-bottom:24px;">
      <div style="font-size:22px;font-weight:bold;color:#1a1a1a;letter-spacing:0.5px;">MERIDIAN</div>
      <div style="font-size:13px;color:#6b6b6b;margin-top:4px;">${escapeHtml(title)} &middot; ${escapeHtml(dateLabel)}</div>
    </div>
    ${body}
    <div style="border-top:1px solid #d8d6d0;margin-top:28px;padding-top:14px;">
      <p style="font-size:11px;line-height:1.5;color:#8a8a8a;margin:0;">${DISCLAIMER}</p>
    </div>
  </div>
</body>
</html>`;
}

function sectionHeading(text: string): string {
  return `<div style="font-size:12px;font-weight:bold;letter-spacing:1.5px;color:#8a6d3b;text-transform:uppercase;margin:24px 0 10px;">${escapeHtml(text)}</div>`;
}

export function renderRiskFlagsHtml(flags: RiskFlag[]): string {
  if (flags.length === 0) return "";
  const items = flags
    .map(
      (f) =>
        `<li style="margin:0 0 8px;line-height:1.5;color:#1a1a1a;font-size:14px;">${escapeHtml(f.detail)}</li>`,
    )
    .join("\n");
  return `${sectionHeading("Risk flags")}<ul style="margin:0;padding-left:18px;">${items}</ul>`;
}

export function renderDailyBrief(input: {
  dateLabel: string;
  marketSummaryHtml: string;
  portfolioParagraphs: string[];
  riskNarration: string;
  riskFlags: RiskFlag[];
  webViewUrl?: string;
  feedbackUrls?: { up: string; down: string };
}): { fullHtml: string; portfolioSectionHtml: string } {
  const portfolioSectionHtml = [
    sectionHeading("Your book"),
    paragraphsToHtml(input.portfolioParagraphs),
    sectionHeading("Risk snapshot"),
    paragraphsToHtml([input.riskNarration]),
    renderRiskFlagsHtml(input.riskFlags),
  ].join("\n");

  const webViewLink = input.webViewUrl
    ? `<p style="font-size:13px;margin:20px 0 0;"><a href="${escapeHtml(input.webViewUrl)}" style="color:#8a6d3b;">View brief history &rarr;</a></p>`
    : "";

  const feedbackRow = input.feedbackUrls
    ? `<p style="font-size:13px;margin:16px 0 0;color:#6b6b6b;">Was this brief useful?
        <a href="${escapeHtml(input.feedbackUrls.up)}" style="color:#8a6d3b;text-decoration:none;margin-left:6px;">&#128077; Yes</a>
        <a href="${escapeHtml(input.feedbackUrls.down)}" style="color:#8a6d3b;text-decoration:none;margin-left:10px;">&#128078; No</a></p>`
    : "";

  const body = [
    sectionHeading("Markets overnight"),
    input.marketSummaryHtml,
    portfolioSectionHtml,
    feedbackRow,
    webViewLink,
  ].join("\n");

  return { fullHtml: shell("Daily Brief", input.dateLabel, body), portfolioSectionHtml };
}

export function renderWeeklyJournal(input: {
  weekLabel: string;
  flags: JournalFlag[];
  tradeCount: number;
}): string {
  const body =
    input.flags.length === 0
      ? paragraphsToHtml([
          `Across ${input.tradeCount} trades this week, none of the tracked behavioral patterns were flagged.`,
        ])
      : [
          paragraphsToHtml([
            `Patterns observed across ${input.tradeCount} trades this week. These are descriptions of what happened, not judgments or advice.`,
          ]),
          `<ul style="margin:0;padding-left:18px;">${input.flags
            .map(
              (f) =>
                `<li style="margin:0 0 8px;line-height:1.5;color:#1a1a1a;font-size:14px;">${escapeHtml(f.detail)}</li>`,
            )
            .join("\n")}</ul>`,
        ].join("\n");

  return shell("Weekly Journal", input.weekLabel, sectionHeading("Trading patterns") + body);
}

/** Full-page web view reusing the email shell (brief archive, single brief). */
export function renderWebPage(title: string, dateLabel: string, bodyHtml: string): string {
  return shell(title, dateLabel, bodyHtml);
}

export function renderReauthNudge(loginUrl: string): string {
  const body = paragraphsToHtml([
    "Your Zerodha connection expired overnight (Kite tokens reset daily around 6 AM IST). Reconnect to receive today's personalized brief.",
  ]) + `<p style="margin:16px 0 0;"><a href="${escapeHtml(loginUrl)}" style="color:#8a6d3b;font-size:15px;">Reconnect Zerodha &rarr;</a></p>`;
  return shell("Action needed", new Date().toDateString(), body);
}
