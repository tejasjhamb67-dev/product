import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";
import { config } from "../config.js";
import { db } from "../db/client.js";

// Razorpay subscriptions (PRD §3.6): Free / Core ₹999 / Pro ₹2,499 monthly.
// Plans are created in the Razorpay dashboard; their IDs come from env.

export type PaidTier = "core" | "pro";

let client: Razorpay | undefined;

function razorpay(): Razorpay {
  const cfg = config();
  if (!cfg.RAZORPAY_KEY_ID || !cfg.RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay is not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)");
  }
  if (!client) {
    client = new Razorpay({ key_id: cfg.RAZORPAY_KEY_ID, key_secret: cfg.RAZORPAY_KEY_SECRET });
  }
  return client;
}

function planIdFor(tier: PaidTier): string {
  const cfg = config();
  const planId = tier === "core" ? cfg.RAZORPAY_PLAN_ID_CORE : cfg.RAZORPAY_PLAN_ID_PRO;
  if (!planId) throw new Error(`Razorpay plan id for tier "${tier}" is not configured`);
  return planId;
}

/** Creates a subscription and returns its id + short checkout URL. */
export async function createSubscription(
  userId: number,
  tier: PaidTier,
): Promise<{ subscriptionId: string; shortUrl: string | null }> {
  const sub = await razorpay().subscriptions.create({
    plan_id: planIdFor(tier),
    total_count: 12, // 12 monthly cycles, renewable
    customer_notify: 1,
    notes: { meridian_user_id: String(userId), tier },
  });
  await db().query(
    `UPDATE users SET razorpay_subscription_id = $1, tier = $2, subscription_status = 'past_due'
     WHERE id = $3`,
    [sub.id, tier, userId],
  );
  return { subscriptionId: sub.id, shortUrl: (sub as any).short_url ?? null };
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = config().RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  return sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf);
}

/** Applies a Razorpay webhook event to the user's subscription state. */
export async function handleWebhookEvent(event: {
  event: string;
  payload?: { subscription?: { entity?: { id?: string; notes?: Record<string, unknown> } } };
}): Promise<void> {
  const sub = event.payload?.subscription?.entity;
  const subId = sub?.id;
  if (!subId) return;

  const statusByEvent: Record<string, string | undefined> = {
    "subscription.activated": "active",
    "subscription.charged": "active",
    "subscription.pending": "past_due",
    "subscription.halted": "past_due",
    "subscription.cancelled": "cancelled",
    "subscription.completed": "cancelled",
  };
  const status = statusByEvent[event.event];
  if (!status) return;

  if (status === "cancelled") {
    await db().query(
      `UPDATE users SET subscription_status = 'cancelled', tier = 'free'
       WHERE razorpay_subscription_id = $1`,
      [subId],
    );
  } else {
    await db().query(
      `UPDATE users SET subscription_status = $1 WHERE razorpay_subscription_id = $2`,
      [status, subId],
    );
  }
}
