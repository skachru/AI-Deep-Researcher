import { extractSummary } from "@/lib/report/markdown";

/** Plain-text summary bullets for share messages (citations and tags removed). Pure. */
export function shareBullets(markdown: string, max = 3): string[] {
  return extractSummary(markdown)
    .split("\n")
    .map((l) =>
      l
        .replace(/^\s*[-*]\s+/, "")
        .replace(/\s?\[\d{1,3}(?:\s*,\s*\d{1,3})*\]/g, "")
        .replace(/\s*\{\{[^}]+\}\}/g, "")
        .replace(/[*_`]/g, "")
        .trim(),
    )
    .filter(Boolean)
    .slice(0, max);
}

/**
 * The default share message: a greeting, what the report is and how it was
 * made, the headline findings, what's attached, and a sign-off. Pure.
 */
export function shareDescription(query: string, markdown: string, appUrl: string, senderName?: string | null): string {
  const findings = shareBullets(markdown, 2);
  return [
    "Hi,",
    "",
    `I wanted to share a research report on "${query}". It was prepared with Lumen (${appUrl}), an AI research assistant that cross-checks each claim against multiple sources and cites them.`,
    ...(findings.length ? ["", "Headline findings:", ...findings.map((f) => `• ${f}`)] : []),
    "",
    "The full report is attached as a PDF, along with an interactive HTML version you can open in any browser.",
    "",
    "Best regards,",
    ...(senderName ? [senderName] : []),
  ].join("\n");
}

export const shareSubject = (query: string) => `Research report: ${query.slice(0, 90)}`;

export type ShareTarget = "gmail" | "outlook" | "whatsapp" | "telegram" | "email";

/** Compose URL for each app, pre-filled with the message (files are attached by the user). Pure. */
export function shareHref(target: ShareTarget, subject: string, text: string, appUrl: string): string {
  const e = encodeURIComponent;
  switch (target) {
    case "gmail":
      return `https://mail.google.com/mail/?view=cm&fs=1&su=${e(subject)}&body=${e(text)}`;
    case "outlook":
      return `https://outlook.live.com/mail/0/deeplink/compose?subject=${e(subject)}&body=${e(text)}`;
    case "whatsapp":
      return `https://wa.me/?text=${e(text)}`;
    case "telegram":
      return `https://t.me/share/url?url=${e(appUrl)}&text=${e(text)}`;
    case "email":
      return `mailto:?subject=${e(subject)}&body=${e(text)}`;
  }
}

export interface Attachment {
  name: string;
  type: string;
  /** File content, base64-encoded. */
  base64: string;
}

const encodeHeader = (v: string) =>
  /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(v)))}?=`;
const wrap76 = (b64: string) => b64.replace(/.{1,76}/g, "$&\r\n").trimEnd();

/**
 * An unsent email draft (.eml) with the files attached. Desktop mail apps
 * (Outlook, Apple Mail, Thunderbird) open it ready to address and send. Pure.
 */
export function buildEmlDraft(
  subject: string,
  text: string,
  attachments: Attachment[],
  boundary = "lumen-boundary",
): string {
  const utf8 = btoa(String.fromCharCode(...new TextEncoder().encode(text.replace(/\r?\n/g, "\r\n"))));
  const parts = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(utf8),
    ...attachments.flatMap((a) => [
      `--${boundary}`,
      `Content-Type: ${a.type}; name="${a.name}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${a.name}"`,
      "",
      wrap76(a.base64),
    ]),
    `--${boundary}--`,
    "",
  ];
  return [
    "X-Unsent: 1",
    "To: ",
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    ...parts,
  ].join("\r\n");
}
