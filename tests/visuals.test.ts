import { describe, expect, it } from "vitest";
import { isPublicAddress, parseOgImage } from "@/lib/tools/ogImage";

describe("preview images", () => {
  it("reads og:image in either attribute order and resolves relative URLs", () => {
    expect(parseOgImage('<meta property="og:image" content="https://cdn.x.com/a.jpg">', "https://x.com/p")).toBe(
      "https://cdn.x.com/a.jpg",
    );
    expect(parseOgImage('<meta content="/img/b.png" name="twitter:image">', "https://x.com/p")).toBe(
      "https://x.com/img/b.png",
    );
    expect(parseOgImage('<meta property="og:image" content="http://insecure.com/a.jpg">', "https://x.com")).toBeNull();
    expect(parseOgImage("<title>none</title>", "https://x.com")).toBeNull();
  });

  it("blocks private, loopback and link-local addresses", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.20.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "::1",
      "fd00::1",
      "::ffff:10.0.0.1",
    ]) {
      expect(isPublicAddress(ip)).toBe(false);
    }
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("2606:4700::1111")).toBe(true);
  });
});

import { computeReliability, splitReferences, stripTitle } from "@/lib/report/reliability";

describe("reliability", () => {
  const src = (type: "web" | "paper" | "news" | "wiki", credibility: number) => ({ type, credibility });

  it("counts claim labels and summarises sources", () => {
    const md = "a {{Corroborated}} b {{Corroborated}} c {{Disputed}} d {{Single-source}}";
    const r = computeReliability(md, [src("paper", 80), src("web", 60), src("wiki", 70)]);
    expect(r.claims).toEqual({ corroborated: 2, singleSource: 1, disputed: 1, total: 4 });
    expect(r.sources.byType).toEqual({ web: 1, news: 0, paper: 1, wiki: 1 });
    expect(r.sources.avgCredibility).toBe(70);
    expect(r.sources.highCredibility).toBe(1);
    expect(r.strength).toBe("Moderate");
  });

  it("rates strong only with enough corroborated, credible sources", () => {
    const md = "{{Corroborated}} {{Corroborated}} {{Corroborated}} {{Single-source}}";
    const many = [80, 75, 70, 65, 90].map((c) => src("paper", c));
    expect(computeReliability(md, many).strength).toBe("Strong");
    expect(computeReliability("", []).strength).toBe("Limited");
  });

  it("splits references and strips the title", () => {
    const { body, references } = splitReferences("# T\n\n## Summary\nx\n\n## References\n\n1. a");
    expect(references.startsWith("## References")).toBe(true);
    expect(stripTitle(body)).toBe("## Summary\nx\n\n");
  });
});
