import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildArxivUrl, parseArxivFeed, searchArxiv } from "@/lib/tools/arxiv";
import { blendCredibility, heuristicCredibility } from "@/lib/tools/credibility";
import { fetchWithRetry } from "@/lib/tools/http";
import { capSources, chunkText, dedupeSources, normaliseUrl } from "@/lib/tools/rank";
import type { RawSource } from "@/lib/tools/types";
import { parseWebSearchMessage } from "@/lib/tools/webSearch";
import { parseWikiExtract, parseWikiSearch, parseWikiSummary, searchWikipedia } from "@/lib/tools/wikipedia";

const fixture = readFileSync(path.join(__dirname, "fixtures/arxiv.xml"), "utf8");

const raw = (over: Partial<RawSource>): RawSource => ({
  title: "t",
  url: "https://example.com/a",
  type: "web",
  publishedDate: null,
  snippet: "",
  content: "",
  retrievedBy: "test",
  ...over,
});

afterEach(() => vi.restoreAllMocks());

describe("arXiv parser", () => {
  it("parses entries, collapses whitespace and upgrades to https", () => {
    const out = parseArxivFeed(fixture);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      title: "The Impact of AI on Developer Productivity: Evidence from GitHub Copilot",
      url: "https://arxiv.org/abs/2302.06590v1",
      type: "paper",
      publishedDate: "2023-02-13",
    });
    expect(out[0].content.startsWith("Generative AI tools")).toBe(true);
  });

  it("handles a feed with no entries", () => {
    expect(parseArxivFeed("<feed></feed>")).toEqual([]);
  });

  it("builds an AND query from sanitised keywords", () => {
    expect(buildArxivUrl("AI coding: productivity!", 3)).toContain(
      "search_query=all:AI+AND+all:coding+AND+all:productivity",
    );
  });

  it("fetches through the network layer (mocked)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(fixture, { status: 200 }));
    const out = await searchArxiv("copilot productivity");
    expect(out).toHaveLength(2);
  });
});

describe("Wikipedia parsers", () => {
  const summary = {
    title: "Nuclear power",
    extract: "Nuclear power is the use of nuclear reactions to produce electricity.",
    timestamp: "2025-09-01T10:00:00Z",
    content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Nuclear_power" } },
  };

  it("parses search hits and summary", () => {
    expect(parseWikiSearch({ pages: [{ key: "Nuclear_power", title: "Nuclear power" }, { bad: 1 }] })).toEqual([
      { key: "Nuclear_power", title: "Nuclear power" },
    ]);
    const s = parseWikiSummary(summary, "Full article text");
    expect(s).toMatchObject({ type: "wiki", publishedDate: "2025-09-01", content: "Full article text" });
  });

  it("falls back to the summary extract when the full text is missing", () => {
    expect(parseWikiSummary(summary, "")?.content).toBe(summary.extract);
    expect(parseWikiSummary({ title: "x" }, "")).toBeNull();
  });

  it("parses the extracts API", () => {
    expect(parseWikiExtract({ query: { pages: { "1": { extract: " body " } } } })).toBe("body");
    expect(parseWikiExtract({})).toBe("");
  });

  it("searches end to end with mocked fetch", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/search/page"))
        return Response.json({ pages: [{ key: "Nuclear_power", title: "Nuclear power" }] });
      if (url.includes("/page/summary/")) return Response.json(summary);
      return Response.json({ query: { pages: { "1": { extract: "Long text" } } } });
    });
    const out = await searchWikipedia("nuclear power");
    expect(out).toHaveLength(1);
    expect(out[0].content).toBe("Long text");
  });
});

describe("OpenRouter web search parser", () => {
  const text = "Developers completed tasks 55% faster in a controlled study. Experienced developers were slower.";
  const message = {
    role: "assistant",
    content: text,
    annotations: [
      {
        type: "url_citation",
        url_citation: {
          url: "https://github.blog/study",
          title: "Copilot study",
          content: "In the experiment, developers using Copilot finished 55% faster.",
          start_index: 0,
          end_index: 58,
        },
      },
      // Flattened shape some clients produce
      { type: "url_citation", url: "https://metr.org/rct", title: "METR RCT", start_index: 61, end_index: 95 },
      { type: "url_citation", url_citation: { url: "javascript:alert(1)", title: "bad" } },
      { type: "something_else" },
    ],
  };

  it("builds sources from url_citation annotations with excerpts and cited sentences", () => {
    const out = parseWebSearchMessage(message, "web");
    expect(out.map((s) => s.url)).toEqual(["https://github.blog/study", "https://metr.org/rct"]);
    expect(out[0]).toMatchObject({ title: "Copilot study", type: "web", publishedDate: null });
    expect(out[0].content).toContain("finished 55% faster");
    expect(out[0].content).toContain("Developers completed tasks 55% faster in a controlled study.");
    expect(out[1].content).toBe("Experienced developers were slower.");
  });

  it("tags news mode and tolerates empty or malformed messages", () => {
    expect(parseWebSearchMessage(message, "news").every((s) => s.type === "news")).toBe(true);
    expect(parseWebSearchMessage(undefined, "web")).toEqual([]);
    expect(parseWebSearchMessage({ content: "no citations" }, "web")).toEqual([]);
  });

  it("calls OpenRouter with the web search server tool (mocked network)", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        Response.json({ choices: [{ message }], usage: { prompt_tokens: 100, completion_tokens: 20 } }),
      );
    const { webSearch } = await import("@/lib/tools/webSearch");
    const res = await webSearch({ questions: ["Does Copilot help?"], mode: "web", maxResults: 5 });
    expect(res.sources).toHaveLength(2);
    expect(res.usage).toEqual({ inputTokens: 100, outputTokens: 20 });
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe("https://openrouter.ai/api/v1/chat/completions");
    const body = JSON.parse(String(init?.body)) as { tools: { type: string; parameters: { max_results: number } }[] };
    expect(body.tools[0]).toMatchObject({ type: "openrouter:web_search", parameters: { max_results: 5 } });
  });
});

describe("chunking, dedupe and capping", () => {
  it("chunks long text with overlap and keeps short text whole", () => {
    expect(chunkText("short")).toEqual(["short"]);
    expect(chunkText("")).toEqual([]);
    const long = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
    const chunks = chunkText(long, 200, 40);
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.every((c) => c.length <= 200)).toBe(true);
  });

  it("dedupes by normalised URL and title, including against existing sources", () => {
    expect(normaliseUrl("https://www.Example.com/a/?utm_source=x#top")).toBe("example.com/a");
    const out = dedupeSources(
      [
        raw({ url: "https://example.com/a" }),
        raw({ url: "https://www.example.com/a/", title: "other" }),
        raw({ url: "https://b.com", title: "B" }),
      ],
      [{ url: "https://b.com/", title: "Different" }],
    );
    expect(out.map((s) => s.url)).toEqual(["https://example.com/a"]);
  });

  it("caps with a balanced mix across source types", () => {
    const many = [
      ...Array.from({ length: 10 }, (_, i) => raw({ url: `https://w${i}.com`, type: "web" })),
      raw({ url: "https://arxiv.org/1", type: "paper" }),
      raw({ url: "https://en.wikipedia.org/x", type: "wiki" }),
    ];
    const out = capSources(many, 4);
    expect(out.map((s) => s.type).sort()).toEqual(["paper", "web", "web", "wiki"]);
  });
});

describe("credibility", () => {
  const now = new Date("2026-10-10");
  it("rewards papers, trusted domains and recency", () => {
    const paper = heuristicCredibility(
      { type: "paper", url: "https://arxiv.org/abs/1", publishedDate: "2026-01-01" },
      now,
    );
    const blog = heuristicCredibility({ type: "web", url: "https://random.blog/x", publishedDate: "2010-01-01" }, now);
    expect(paper).toBeGreaterThan(blog);
    expect(paper).toBeLessThanOrEqual(100);
  });

  it("blends model judgement and corroboration within 0–100", () => {
    expect(blendCredibility(50, undefined, 0)).toBe(50);
    expect(blendCredibility(50, 90, 0)).toBe(74);
    expect(blendCredibility(95, 200, 10)).toBe(100);
  });
});

describe("fetchWithRetry", () => {
  it("retries 429/5xx with backoff and then succeeds", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const res = await fetchWithRetry("https://example.com", { baseDelayMs: 1 });
    expect(await res.text()).toBe("ok");
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("does not retry 4xx client errors", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 404 }));
    await expect(fetchWithRetry("https://example.com", { baseDelayMs: 1 })).rejects.toThrow("HTTP 404");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
