import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

/** Verifies the exact OpenRouter requests the agents send (network mocked). */
describe("OpenRouter model client", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sends structured-output requests to OpenRouter with provider routing", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    process.env.OPENROUTER_MODEL = "qwen/qwen3.8-flash";
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        id: "gen-1",
        object: "chat.completion",
        created: 0,
        model: "qwen/qwen3.8-flash",
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: '{"answer":"yes"}' } }],
        usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 },
      }),
    );
    const { createModel, usageFrom } = await import("@/lib/llm");
    const model = createModel({ maxTokens: 100 }).withStructuredOutput(z.object({ answer: z.string() }), {
      method: "jsonSchema",
      strict: true,
      includeRaw: true,
    });
    const { parsed, raw } = await model.invoke("Is it?");
    expect(parsed).toEqual({ answer: "yes" });
    expect(usageFrom(raw)).toEqual({ inputTokens: 12, outputTokens: 5 });

    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe("https://openrouter.ai/api/v1/chat/completions");
    const body = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>;
    expect(body.model).toBe("qwen/qwen3.8-flash");
    expect(body.provider).toEqual({ require_parameters: true });
    expect((body.response_format as { type: string }).type).toBe("json_schema");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer sk-or-test");
    expect(headers.get("x-title")).toBe("Lumen");
  });
});
