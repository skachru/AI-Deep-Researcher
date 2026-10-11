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

export interface ShareMessage {
  subject: string;
  /** Message text without the link. */
  text: string;
  /** Public report link, or the app's address when the report has no link. */
  url: string;
}

export function buildShareMessage(query: string, markdown: string, url: string, isReportLink: boolean): ShareMessage {
  const bullets = shareBullets(markdown);
  const lines = [`"${query}"`];
  if (bullets.length) lines.push("", "Key findings:", ...bullets.map((b) => `• ${b}`));
  lines.push("", isReportLink ? "Full cited report from Lumen:" : "Researched with Lumen:");
  return { subject: `Research report: ${query.slice(0, 90)}`, text: lines.join("\n"), url };
}

export type ShareTarget = "gmail" | "outlook" | "whatsapp" | "telegram" | "linkedin" | "x" | "email";

/** Share-intent URL for each app. Pure. */
export function shareHref(target: ShareTarget, m: ShareMessage): string {
  const e = encodeURIComponent;
  const full = `${m.text}\n${m.url}`;
  switch (target) {
    case "gmail":
      return `https://mail.google.com/mail/?view=cm&fs=1&su=${e(m.subject)}&body=${e(full)}`;
    case "outlook":
      return `https://outlook.live.com/mail/0/deeplink/compose?subject=${e(m.subject)}&body=${e(full)}`;
    case "whatsapp":
      return `https://wa.me/?text=${e(full)}`;
    case "telegram":
      return `https://t.me/share/url?url=${e(m.url)}&text=${e(m.text)}`;
    case "linkedin":
      return `https://www.linkedin.com/sharing/share-offsite/?url=${e(m.url)}`;
    case "x":
      return `https://twitter.com/intent/tweet?text=${e(`Research: ${m.subject.replace(/^Research report: /, "")}`)}&url=${e(m.url)}`;
    case "email":
      return `mailto:?subject=${e(m.subject)}&body=${e(full)}`;
  }
}
