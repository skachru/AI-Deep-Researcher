// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShareMenu } from "@/components/report/share-menu";

vi.mock("@/lib/client/useMe", () => ({ useMe: () => null }));

const report = (q: string) => ({ searchId: null, query: q, markdown: `# ${q}\n## Summary\n- ${q}`, sources: [] });

afterEach(() => vi.restoreAllMocks());

describe("ShareMenu attachments", () => {
  it("never attaches an older report's files after an out-of-order response", async () => {
    // Report A's exports answer late; report B's answer at once.
    const pending: (() => void)[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { format: string; report: { query: string } };
      const blob = () => new Response(`${body.report.query}.${body.format}`);
      if (body.report.query.startsWith("Report A")) return new Promise((r) => pending.push(() => r(blob())));
      return blob();
    });
    const saved: string[] = [];
    globalThis.URL.createObjectURL = () => "blob:x";
    globalThis.URL.revokeObjectURL = () => undefined;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      if (this.download) saved.push(this.download);
    });

    const view = render(<ShareMenu report={report("Report A question")} />);
    fireEvent.click(screen.getByRole("button", { name: "Share report" }));
    view.rerender(<ShareMenu report={report("Report B question")} />);
    await waitFor(() => expect(screen.getByRole("link", { name: "Gmail" })).toBeTruthy());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
      pending.forEach((resolve) => resolve()); // A's late answers arrive now
      await new Promise((r) => setTimeout(r, 50));
    });

    fireEvent.click(screen.getByRole("link", { name: "Gmail" }));
    await act(async () => new Promise((r) => setTimeout(r, 900)));
    expect(saved).toEqual(["report-b-question.pdf", "report-b-question.html"]);
  });
});
