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

const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

/**
 * The 2–3 line description that opens a share message: the question, the
 * headline findings, and a pointer to the attached files. Pure.
 */
export function shareDescription(query: string, markdown: string, appUrl: string): string {
  let gist = shareBullets(markdown, 2).map(sentence).join(" ");
  if (gist.length > 320) gist = `${gist.slice(0, 317).replace(/\s+\S*$/, "")}…`;
  return [
    `Research report: ${query}`,
    ...(gist ? [gist] : []),
    `Full cited report attached (PDF + interactive HTML). Researched with Lumen: ${appUrl}`,
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
