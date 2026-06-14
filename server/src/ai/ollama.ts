import { config } from '../config.js';

/**
 * Low-level client for a local Ollama HTTP server — the local-LLM backend shared
 * by every AI feature (the rules assistant AND creature/character/item/spell
 * generation, via ai/gateway.ts). Pure: imports only config, so there are no
 * import cycles. Fail-safe: every call returns null/false on any error.
 */

/** Cached reachability from the last probe — drives the UI "AI available" flag
 *  without a per-request network round-trip. Refreshed on boot + settings save. */
let reachable = false;

export function ollamaReachable(): boolean {
  return reachable;
}

/** Whether a local Ollama URL + model are configured (defaults are always set). */
export function ollamaConfigured(): boolean {
  return !!(config.ollamaUrl && config.ollamaModel);
}

/** Probe the server (GET /api/tags) and cache whether it's up. */
export async function refreshOllama(): Promise<boolean> {
  if (!ollamaConfigured()) {
    reachable = false;
    return false;
  }
  try {
    const res = await fetch(`${config.ollamaUrl}/api/tags`, {
      signal: AbortSignal.timeout(2500),
    });
    reachable = res.ok;
  } catch {
    reachable = false;
  }
  return reachable;
}

/**
 * One chat completion. `json:true` asks Ollama to emit strict JSON (and nudges
 * the model via the system prompt). Returns the assistant text, or null on any
 * failure (connection refused when Ollama isn't running lands here).
 */
export async function ollamaChat(
  system: string,
  user: string,
  opts: { json?: boolean } = {},
): Promise<string | null> {
  if (!ollamaConfigured()) return null;
  try {
    const res = await fetch(`${config.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.ollamaModel,
        stream: false,
        ...(opts.json ? { format: 'json' } : {}),
        options: { temperature: opts.json ? 0 : 0.2 },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      // Local models can be slow to load on first use; give them room.
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      console.warn(`  [ollama] HTTP ${res.status} from ${config.ollamaModel}`);
      reachable = false;
      return null;
    }
    reachable = true; // a successful call confirms it's up
    const data = (await res.json()) as { message?: { content?: string } };
    const text = data.message?.content?.trim();
    return text || null;
  } catch (err) {
    console.warn('  [ollama] request failed:', (err as Error).message);
    reachable = false;
    return null;
  }
}
