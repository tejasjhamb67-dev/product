import { Resend } from "resend";
import { config } from "../config.js";

let client: Resend | undefined;

function resend(): Resend {
  if (!client) client = new Resend(config().RESEND_API_KEY);
  return client;
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const { error } = await resend().emails.send({
    from: config().EMAIL_FROM,
    to: input.to,
    subject: input.subject,
    html: input.html,
  });
  if (error) throw new Error(`email send failed: ${error.message}`);
}
