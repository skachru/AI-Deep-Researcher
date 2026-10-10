/**
 * Returns a same-origin path for post-sign-in redirects, or the fallback.
 * Rejects anything a browser could resolve to another origin: "//host",
 * "/\\host" (browsers treat "\\" as "/"), absolute URLs, control characters.
 * Pure.
 */
export function safeRedirectPath(next: string | null | undefined, fallback = "/history"): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 500) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(next)) return fallback;
  try {
    const base = "https://lumen.invalid";
    const url = new URL(next, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
