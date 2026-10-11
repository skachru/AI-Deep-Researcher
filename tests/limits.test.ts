import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.doUnmock("@/lib/db");
});

describe("multi-rule admission", () => {
  it("a visitor over their own limit can't use up the site-wide allowance", async () => {
    vi.doMock("@/lib/db", () => ({ db: async () => null }));
    const { consumeAll } = await import("@/lib/rateLimit");
    const rules = (user: string) => [
      { key: `t1:user:${user}`, limit: 1, windowSeconds: 3600 },
      { key: "t1:global", limit: 3, windowSeconds: 3600 },
    ];
    expect(await consumeAll(rules("a"))).toBe(true); // global 1/3
    expect(await consumeAll(rules("a"))).toBe(false); // denied by user rule: global not charged
    expect(await consumeAll(rules("a"))).toBe(false);
    expect(await consumeAll(rules("a"))).toBe(false);
    expect(await consumeAll(rules("b"))).toBe(true); // global 2/3
    expect(await consumeAll(rules("c"))).toBe(true); // global 3/3
    expect(await consumeAll(rules("d"))).toBe(false); // global exhausted by real admissions only
  });

  it("gives back earlier charges when a later rule denies", async () => {
    vi.doMock("@/lib/db", () => ({ db: async () => null }));
    const { consumeAll } = await import("@/lib/rateLimit");
    const rules = [
      { key: "t2:user", limit: 5, windowSeconds: 3600 },
      { key: "t2:global", limit: 0, windowSeconds: 3600 },
    ];
    for (let i = 0; i < 10; i++) expect(await consumeAll(rules)).toBe(false);
    expect(await consumeAll([rules[0]])).toBe(true); // user bucket was refunded each time
  });
});

describe("database limits", () => {
  it("decides from the database count even if cleanup fails", async () => {
    const sql = (strings: TemplateStringsArray) => {
      const q = strings.join("?");
      if (q.startsWith("INSERT")) return Promise.resolve([{ count: 999 }]);
      if (q.startsWith("DELETE")) return Promise.reject(new Error("cleanup failed"));
      return Promise.resolve([]);
    };
    vi.doMock("@/lib/db", () => ({ db: async () => sql }));
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { consumeLimit } = await import("@/lib/rateLimit");
    expect(await consumeLimit({ key: "t3", limit: 1, windowSeconds: 3600 })).toBe(false);
  });

  it("falls back to memory only when the admission query itself fails", async () => {
    const sql = () => Promise.reject(new Error("db down"));
    vi.doMock("@/lib/db", () => ({ db: async () => sql }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { consumeLimit } = await import("@/lib/rateLimit");
    const rule = { key: "t4", limit: 1, windowSeconds: 3600 };
    expect(await consumeLimit(rule)).toBe(true);
    expect(await consumeLimit(rule)).toBe(false);
  });
});
