import { OPENROUTER_BASE_URL } from "@/lib/openrouter";

/**
 * Capabilities of the configured OpenRouter model, read from the public model
 * list and cached per server instance. Used to switch off (or minimise)
 * "thinking" on reasoning models, which otherwise makes every agent call slow.
 */
export interface ModelInfo {
  id: string;
  supportedParameters: string[];
  reasoningMandatory: boolean;
  pricing: { prompt?: string; completion?: string };
}

const TTL_MS = 60 * 60 * 1000;
let cache: { at: number; model: string; info: ModelInfo | null } | null = null;
let current: ModelInfo | null = null;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Pure: extracts what we need from one entry of GET /api/v1/models. */
export function parseModelInfo(entry: unknown): ModelInfo | null {
  if (!isRecord(entry) || typeof entry.id !== "string") return null;
  const params = Array.isArray(entry.supported_parameters)
    ? entry.supported_parameters.filter((p): p is string => typeof p === "string")
    : [];
  const reasoning = isRecord(entry.reasoning) ? entry.reasoning : undefined;
  const pricing = isRecord(entry.pricing) ? entry.pricing : {};
  return {
    id: entry.id,
    supportedParameters: params,
    reasoningMandatory: reasoning?.mandatory === true,
    pricing: {
      prompt: typeof pricing.prompt === "string" ? pricing.prompt : undefined,
      completion: typeof pricing.completion === "string" ? pricing.completion : undefined,
    },
  };
}

export async function loadModelInfo(model: string): Promise<ModelInfo | null> {
  if (cache && cache.model === model && Date.now() - cache.at < TTL_MS) return (current = cache.info);
  try {
    const res = await fetch(`${OPENROUTER_BASE_URL}/models`, { signal: AbortSignal.timeout(5000) });
    const json = (await res.json()) as { data?: unknown[] };
    const entry = json.data?.find((m) => isRecord(m) && m.id === model);
    const info = entry ? parseModelInfo(entry) : null;
    cache = { at: Date.now(), model, info };
    return (current = info);
  } catch {
    return current; // keep whatever we knew; never block research on this lookup
  }
}

export type ReasoningSetting = "auto" | "off" | "low" | "medium" | "high";

/**
 * Pure: the `reasoning` request parameter to send. "auto" (default) turns
 * thinking off where the model allows it and keeps it minimal where it is
 * mandatory; models without reasoning get no parameter at all (so
 * `require_parameters` routing is unaffected).
 */
export function reasoningParam(
  info: ModelInfo | null,
  setting: ReasoningSetting = "auto",
): { effort: string; exclude: boolean } | undefined {
  if (!info || !info.supportedParameters.includes("reasoning")) return undefined;
  if (setting === "auto" || setting === "off") {
    return info.reasoningMandatory ? { effort: "low", exclude: true } : { effort: "none", exclude: true };
  }
  return { effort: setting, exclude: true };
}

/** Synchronous accessor for the model factory (filled by loadModelInfo at run start). */
export function currentReasoningParam(): { effort: string; exclude: boolean } | undefined {
  const setting = (process.env.OPENROUTER_REASONING ?? "auto") as ReasoningSetting;
  return reasoningParam(current, setting);
}
