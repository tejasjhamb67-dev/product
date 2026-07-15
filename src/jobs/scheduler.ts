import cron from "node-cron";
import { runDailyBriefJob } from "./dailyBrief.js";
import { runWeeklyJournalJob } from "./weeklyJournal.js";

// Deployment plan §1: brief generation ~7:00 AM IST daily, pre-market.
// Batch pipeline starts 6:30 IST so emails land ~7:00.
// Weekly journal: Sunday 9:00 IST.

export function startScheduler(): void {
  cron.schedule("30 6 * * 1-5", () => void safeRun("daily-brief", runDailyBriefJob), {
    timezone: "Asia/Kolkata",
  });
  cron.schedule("0 9 * * 0", () => void safeRun("weekly-journal", runWeeklyJournalJob), {
    timezone: "Asia/Kolkata",
  });
  console.log("scheduler started: daily 06:30 IST (Mon-Fri), weekly Sunday 09:00 IST");
}

async function safeRun(name: string, job: () => Promise<unknown>): Promise<void> {
  try {
    await job();
  } catch (err) {
    console.error(`[scheduler] ${name} crashed:`, err);
  }
}
