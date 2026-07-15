// Weekly behavioral journal (PRD flow D): Sunday email with descriptive
// pattern flags for the week's trades. Deterministic — no LLM involved.

import { fileURLToPath } from "node:url";
import { db, closeDb } from "../db/client.js";
import { detectWeeklyPatterns } from "../journal/patterns.js";
import { renderWeeklyJournal } from "../brief/render.js";
import { sendEmail } from "../delivery/email.js";
import type { Trade } from "../broker/types.js";

export async function runWeeklyJournalJob(): Promise<{ sent: number; failed: number }> {
  const stats = { sent: 0, failed: 0 };

  const now = new Date();
  const weekEnd = new Date(now);
  const weekStart = new Date(now);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const weekEndStr = weekEnd.toISOString().slice(0, 10);

  // Weekly journal goes to every user with trade history this week —
  // including free tier (it's the top-of-funnel hook).
  const { rows: users } = await db().query(
    `SELECT DISTINCT u.id, u.email
     FROM users u
     JOIN trade_history t ON t.user_id = u.id
     WHERE t.executed_at >= $1`,
    [weekStart],
  );

  for (const user of users) {
    try {
      const { rows } = await db().query(
        `SELECT ticker, side, quantity, price, segment, executed_at
         FROM trade_history WHERE user_id = $1 AND executed_at >= $2
         ORDER BY executed_at ASC`,
        [user.id, weekStart],
      );
      const trades: Trade[] = rows.map((r) => ({
        ticker: r.ticker,
        side: r.side,
        quantity: Number(r.quantity),
        price: Number(r.price),
        segment: r.segment,
        executedAt: new Date(r.executed_at),
        brokerTradeId: null,
      }));

      const flags = detectWeeklyPatterns(trades);

      await db().query(
        `INSERT INTO journal_summaries (user_id, week_start, week_end, flags, sent_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (user_id, week_start) DO UPDATE SET flags = EXCLUDED.flags, sent_at = now()`,
        [user.id, weekStartStr, weekEndStr, JSON.stringify(flags)],
      );

      await sendEmail({
        to: user.email,
        subject: `Meridian Weekly Journal — week of ${weekStartStr}`,
        html: renderWeeklyJournal({
          weekLabel: `${weekStartStr} to ${weekEndStr}`,
          flags,
          tradeCount: trades.length,
        }),
      });
      stats.sent++;
    } catch (err) {
      stats.failed++;
      console.error(`[weekly-journal] user ${user.id} failed:`, err);
    }
  }

  console.log(`[weekly-journal] done: sent=${stats.sent} failed=${stats.failed}`);
  return stats;
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  runWeeklyJournalJob()
    .then(() => closeDb())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
