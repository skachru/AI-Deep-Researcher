import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
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

/** Expands an IPv6 address to 8 hextets (handles "::" and an embedded IPv4 tail). Pure. */
function expandIPv6(ip: string): number[] | null {
  let v = ip
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .split("%")[0];
  const v4 = v.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const p = v4[1].split(".").map(Number);
    v = v.slice(0, -v4[1].length) + `${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`;
  }
  const [head, tail] = v.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined ? (tail ? tail.split(":") : []) : [];
  const missing = v.includes("::") ? 8 - h.length - t.length : 0;
  const parts = [...h, ...Array(Math.max(missing, 0)).fill("0"), ...t];
  if (parts.length !== 8 || parts.some((x) => !/^[0-9a-f]{1,4}$/.test(x))) return null;
  return parts.map((x) => parseInt(x, 16));
}

function isPublicIPv4(ip: string): boolean {
  const [a, b, c] = ip.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false; // this-net, private, loopback, multicast/reserved
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 169 && b === 254) return false; // link-local (incl. cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // IETF protocol assignments, TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return false; // TEST-NET-3
  return true;
}

const v4FromHextets = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

/** True for addresses that are safe to fetch from the server (blocks SSRF to private networks). Pure. */
export function isPublicAddress(ip: string): boolean {
  if (isIP(ip) === 4) return isPublicIPv4(ip);
  const h = expandIPv6(ip);
  if (!h) return false;
  if (h.every((x) => x === 0)) return false; // ::
  if (h.slice(0, 7).every((x) => x === 0) && h[7] === 1) return false; // ::1
  if ((h[0] & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((h[0] & 0xffc0) === 0xfe80 || (h[0] & 0xffc0) === 0xfec0) return false; // fe80::/10 link-local, fec0::/10 site-local
  if ((h[0] & 0xff00) === 0xff00) return false; // multicast
  if (h[0] === 0x2001 && h[1] === 0x0db8) return false; // documentation
  // Embedded IPv4: mapped/compatible (::ffff:a.b.c.d, ::a.b.c.d), NAT64 (64:ff9b::/96), 6to4 (2002::/16)
  if (h.slice(0, 5).every((x) => x === 0) && (h[5] === 0xffff || h[5] === 0))
    return isPublicIPv4(v4FromHextets(h[6], h[7]));
  if (h[0] === 0x64 && h[1] === 0xff9b && h.slice(2, 6).every((x) => x === 0))
    return isPublicIPv4(v4FromHextets(h[6], h[7]));
  if (h[0] === 0x2002) return isPublicIPv4(v4FromHextets(h[1], h[2]));
  return true;
}

/**
 * DNS lookup used *by the connection itself*: the address that is validated is
 * the address that is connected to, so DNS rebinding between a check and the
 * request is not possible.
 */
const safeLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    const list = addresses as LookupAddress[];
    if (list.length === 0 || !list.every((a) => isPublicAddress(a.address))) {
      return callback(new Error(`Blocked non-public address for ${hostname}`), "", 0);
    }
    if (options.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
    return callback(null, list[0].address, list[0].family);
  });
};

function checkUrl(raw: string | URL): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("unsupported protocol");
  if (url.port && url.port !== "80" && url.port !== "443") throw new Error("unsupported port");
  if (url.username || url.password) throw new Error("credentials in URL");
  // Literal IPs skip DNS (and so skip safeLookup) — validate them here.
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !isPublicAddress(host)) throw new Error("blocked address");
  return url;
}

interface PageResponse {
  status: number;
  location: string | null;
  contentType: string;
  body: string;
}

const MAX_BYTES = 200_000;

function getPage(url: URL): Promise<PageResponse> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(
      url,
      { method: "GET", lookup: safeLookup, headers: { "User-Agent": USER_AGENT, Accept: "text/html" }, timeout: 4000 },
      (res) => {
        const status = res.statusCode ?? 0;
        const contentType = String(res.headers["content-type"] ?? "");
        const location = typeof res.headers.location === "string" ? res.headers.location : null;
        if (status >= 300 || !contentType.includes("html")) {
          res.resume();
          return resolve({ status, location, contentType, body: "" });
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          body += chunk;
          if (body.length >= MAX_BYTES || /<\/head>/i.test(body)) res.destroy();
        });
        res.on("close", () => resolve({ status, location, contentType, body }));
        res.on("error", () => resolve({ status, location, contentType, body }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

/**
 * Fetches only the start of a public web page and returns its preview image.
 * Redirects are followed manually (max 3) and every hop is re-validated.
 */
export async function fetchOgImage(raw: string): Promise<string | null> {
  let url = checkUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    const page = await getPage(url);
    if (page.status >= 300 && page.status < 400 && page.location) {
      if (hop === 3) return null;
      url = checkUrl(new URL(page.location, url));
      continue;
    }
    if (page.status < 200 || page.status >= 300 || !page.body) return null;
    return parseOgImage(page.body, url.toString());
  }
  return null;
}
