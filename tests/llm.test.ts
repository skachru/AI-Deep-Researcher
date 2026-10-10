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

describe("reasoning control", () => {
  it("turns thinking off where allowed, keeps it minimal where mandatory, and leaves other models alone", async () => {
    const { parseModelInfo, reasoningParam } = await import("@/lib/modelInfo");
    const optional = parseModelInfo({ id: "a/r", supported_parameters: ["reasoning", "tools", "response_format"] });
    const mandatory = parseModelInfo({
      id: "a/m",
      supported_parameters: ["reasoning"],
      reasoning: { mandatory: true },
    });
    const plain = parseModelInfo({ id: "a/p", supported_parameters: ["tools", "response_format"] });
    expect(reasoningParam(optional)).toEqual({ effort: "none", exclude: true });
    expect(reasoningParam(mandatory)).toEqual({ effort: "low", exclude: true });
    expect(reasoningParam(plain)).toBeUndefined();
    expect(reasoningParam(null)).toBeUndefined();
    expect(reasoningParam(optional, "medium")).toEqual({ effort: "medium", exclude: true });
    expect(parseModelInfo({ nope: 1 })).toBeNull();
  });
});

describe("errorMessage", () => {
  it("never throws, whatever is thrown", async () => {
    const { errorMessage } = await import("@/lib/graph/run");
    expect(errorMessage(null)).toBe("null");
    expect(errorMessage(undefined)).toBe("undefined");
    expect(errorMessage("x")).toBe("x");
    expect(errorMessage(new AggregateError([new Error("inner")], "outer"))).toBe("inner");
    expect(errorMessage({ errors: [new Error("nested")] })).toBe("nested");
  });
});
