import { afterEach, describe, expect, it, vi } from "vitest";

const runSetupChecks = vi.fn(async () => []);
const runSpeedTest = vi.fn(async () => []);

function mockPage(opts: { isAdmin: boolean; adminLookup: () => Promise<boolean> }) {
  vi.doMock("next/headers", () => ({ headers: async () => new Headers({ host: "example.com" }) }));
  vi.doMock("@/lib/auth/session", () => ({
    adminEmails: () => ["admin@example.com"],
    getViewer: async () => ({ anonId: "a", email: null, isAdmin: opts.isAdmin }),
  }));
  vi.doMock("@/lib/db/users", () => ({ hasAdminSignedIn: opts.adminLookup }));
  vi.doMock("@/lib/rateLimit", () => ({ consumeLimit: async () => true }));
  vi.doMock("@/lib/setup/checks", () => ({ runSetupChecks, runSpeedTest }));
  vi.doMock("@/components/site-header", () => ({ SiteHeader: () => null }));
}

const text = (node: unknown): string =>
  JSON.stringify(node, (_k, v: unknown) => (typeof v === "function" ? undefined : v));

afterEach(() => {
  vi.resetModules();
  runSetupChecks.mockClear();
  runSpeedTest.mockClear();
  delete process.env.SETUP_LOCKED;
});

describe("setup page authorisation", () => {
  it("fails closed when the admin lookup errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockPage({ isAdmin: false, adminLookup: () => Promise.reject(new Error("db down")) });
    const { default: SetupPage } = await import("@/app/setup/page");
    const out = await SetupPage({ searchParams: Promise.resolve({ test: "1" }) });
    expect(text(out)).toContain("temporarily unavailable");
    expect(runSetupChecks).not.toHaveBeenCalled();
    expect(runSpeedTest).not.toHaveBeenCalled();
  });

  it("stays locked with SETUP_LOCKED even without any admin record", async () => {
    process.env.SETUP_LOCKED = "true";
    mockPage({ isAdmin: false, adminLookup: async () => false });
    const { default: SetupPage } = await import("@/app/setup/page");
    const out = await SetupPage({ searchParams: Promise.resolve({}) });
    expect(text(out)).toContain("Setup is complete");
    expect(runSetupChecks).not.toHaveBeenCalled();
  });

  it("is open while bootstrapping and always open to admins", async () => {
    mockPage({ isAdmin: false, adminLookup: async () => false });
    const { default: SetupPage } = await import("@/app/setup/page");
    await SetupPage({ searchParams: Promise.resolve({}) });
    expect(runSetupChecks).toHaveBeenCalledTimes(1);
  });
});
