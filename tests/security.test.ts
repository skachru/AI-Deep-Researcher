import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { consumeInMemory } from "@/lib/rateLimit";

describe("safeRedirectPath", () => {
  it("keeps same-origin paths", () => {
    expect(safeRedirectPath("/admin")).toBe("/admin");
    expect(safeRedirectPath("/history?x=1#top")).toBe("/history?x=1#top");
  });

  it("rejects anything that could leave the site", () => {
    for (const bad of [
      "//evil.com",
      "/\\evil.com",
      "/\\/evil.com",
      "https://evil.com",
      "evil.com",
      "/\tevil",
      "",
      null,
      undefined,
      "/%0d%0a",
    ]) {
      const out = safeRedirectPath(bad as string);
      expect(out.startsWith("/") && !out.startsWith("//") && !out.includes("evil.com")).toBe(true);
    }
    expect(safeRedirectPath("/\\evil.com")).toBe("/history");
    expect(safeRedirectPath("//evil.com", "/")).toBe("/");
  });
});

describe("in-memory rate limit fallback", () => {
  it("allows up to the limit per window, then blocks, and resets next window", () => {
    const rule = { key: `t:${Math.random()}`, limit: 2, windowSeconds: 60 };
    const t0 = 1_000_000_000_000;
    expect(consumeInMemory(rule, t0)).toBe(true);
    expect(consumeInMemory(rule, t0 + 1)).toBe(true);
    expect(consumeInMemory(rule, t0 + 2)).toBe(false);
    expect(consumeInMemory(rule, t0 + 60_000)).toBe(true);
  });
});
