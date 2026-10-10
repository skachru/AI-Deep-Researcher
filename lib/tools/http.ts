/**
 * fetch with a per-call timeout and exponential backoff on 429/5xx and
 * network errors. Used by the free sources (arXiv, Wikipedia).
 */
export interface FetchRetryOptions {
  timeoutMs?: number;
  retries?: number;
  baseDelayMs?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export const USER_AGENT = "LumenDeepResearcher/0.1 (hackathon demo; https://github.com/skachru/AI-Deep-Researcher)";

export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

class NonRetryableError extends Error {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchWithRetry(url: string, options: FetchRetryOptions = {}): Promise<Response> {
  const { timeoutMs = 10_000, retries = 2, baseDelayMs = 500, signal, headers } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      const res = await fetch(url, {
        signal: combined,
        headers: { "User-Agent": USER_AGENT, ...headers },
      });
      if (res.ok) return res;
      if (!isRetryableStatus(res.status) || attempt === retries) {
        throw new NonRetryableError(`HTTP ${res.status} from ${new URL(url).host}`);
      }
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (signal?.aborted || err instanceof NonRetryableError) throw err;
      lastError = err;
      if (attempt === retries) break;
    }
    await sleep(baseDelayMs * 2 ** attempt);
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Resolves to `fallback` instead of throwing; returns the error for reporting. */
export async function settle<T>(promise: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await promise };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
