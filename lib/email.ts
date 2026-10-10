import nodemailer from "nodemailer";

/**
 * SMTP email (works with Gmail + an app password, or any provider such as
 * Resend/SendGrid/Brevo SMTP). Configure SMTP_* and EMAIL_FROM.
 */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: Buffer | string; contentType: string }[];
}

export async function sendMail(mail: Mail): Promise<void> {
  if (!isEmailConfigured()) throw new Error("Email is not configured on this server.");
  const port = Number(process.env.SMTP_PORT ?? 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transport.sendMail({
    from: process.env.EMAIL_FROM ?? `Lumen Research <${process.env.SMTP_USER}>`,
    ...mail,
  });
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
