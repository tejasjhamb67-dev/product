import { createHash, randomInt } from "node:crypto";
import { db } from "../db/client.js";
import { sendEmail } from "../delivery/email.js";

const OTP_TTL_MINUTES = 10;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export async function issueOtp(email: string): Promise<void> {
  const code = String(randomInt(100000, 1000000));
  await db().query(
    `INSERT INTO auth_otps (email, code_hash, expires_at)
     VALUES ($1, $2, now() + interval '${OTP_TTL_MINUTES} minutes')`,
    [email.toLowerCase(), hashCode(code)],
  );
  await sendEmail({
    to: email,
    subject: `${code} is your Meridian login code`,
    html: `<p>Your Meridian login code is <strong>${code}</strong>. It expires in ${OTP_TTL_MINUTES} minutes.</p>`,
  });
}

/** Verifies the OTP and returns the user id (creating the user on first login). */
export async function verifyOtp(email: string, code: string): Promise<number | null> {
  const normalized = email.toLowerCase();
  const { rows } = await db().query(
    `UPDATE auth_otps SET consumed_at = now()
     WHERE id = (
       SELECT id FROM auth_otps
       WHERE email = $1 AND code_hash = $2 AND consumed_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1
     )
     RETURNING id`,
    [normalized, hashCode(code)],
  );
  if (rows.length === 0) return null;

  const user = await db().query(
    `INSERT INTO users (email) VALUES ($1)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING id`,
    [normalized],
  );
  const uid = user.rows[0].id as number;
  await db().query(
    `INSERT INTO risk_thresholds (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [uid],
  );
  return uid;
}
