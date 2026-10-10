import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { USER_AGENT } from "@/lib/tools/http";

/** Finds a page's preview image (og:image / twitter:image). Pure. */
export function parseOgImage(html: string, pageUrl: string): string | null {
  const head = html.slice(0, 200_000);
  const patterns = [
    /<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["']/i,
  ];
  for (const re of patterns) {
    const m = head.match(re);
    if (!m) continue;
    try {
      const url = new URL(m[1].replace(/&amp;/g, "&"), pageUrl);
      if (url.protocol === "https:") return url.toString();
    } catch {
      // ignore malformed URLs
    }
  }
  return null;
}

/** True for addresses that are safe to fetch from the server (blocks SSRF to private networks). Pure. */
export function isPublicAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    return true;
  }
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::" || v.startsWith("fe80") || v.startsWith("fc") || v.startsWith("fd")) return false;
    if (v.startsWith("::ffff:")) return isPublicAddress(v.slice(7));
    return true;
  }
  return false;
}

async function assertPublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("unsupported protocol");
  if (url.port && url.port !== "80" && url.port !== "443") throw new Error("unsupported port");
  const addresses = await lookup(url.hostname, { all: true });
  if (addresses.length === 0 || !addresses.every((a) => isPublicAddress(a.address))) throw new Error("blocked host");
  return url;
}

/**
 * Fetches only the start of a public web page and returns its preview image.
 * Redirects are followed manually so every hop is re-checked.
 */
export async function fetchOgImage(raw: string): Promise<string | null> {
  let url = await assertPublicUrl(raw);
  for (let hop = 0; hop < 3; hop++) {
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      signal: AbortSignal.timeout(4000),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = await assertPublicUrl(new URL(res.headers.get("location") ?? "", url).toString());
      continue;
    }
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html") || !res.body) return null;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let html = "";
    while (html.length < 200_000) {
      const { value, done } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    await reader.cancel().catch(() => undefined);
    return parseOgImage(html, url.toString());
  }
  return null;
}
