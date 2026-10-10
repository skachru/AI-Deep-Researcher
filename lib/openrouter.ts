/** OpenRouter endpoint and attribution headers (shared, dependency-free). */
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export function openRouterHeaders(): Record<string, string> {
  return { "HTTP-Referer": process.env.APP_URL ?? "https://github.com/skachru/AI-Deep-Researcher", "X-Title": "Lumen" };
}
