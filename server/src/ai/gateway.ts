import { config } from '../config.js';
import { ollamaChat, ollamaReachable, ollamaConfigured, refreshOllama } from './ollama.js';
import { callGemini, callGeminiText, geminiEnabled } from '../creatures/gemini.js';

export { refreshOllama, ollamaReachable, ollamaConfigured, listOllamaModels } from './ollama.js';

/**
 * App-wide AI gateway: the single chokepoint every AI feature routes through —
 * the rules assistant (generateText) and creature/character/item/spell
 * generation (generateJson). Backend selection:
 *   - default per `config.aiMode`: 'gemini' = Gemini first (best quality) with a
 *     local fallback; 'local' = Ollama only (a global lockdown, no cloud calls).
 *   - a per-call `prefer` (used by the chat's backend dropdown) overrides the
 *     default UNLESS the global mode is 'local', which always wins.
 * Fail-safe: returns null when no backend produces output; callers degrade.
 */

/** Resolve the effective backend for a call: global 'local' lockdown wins, else
 *  the caller's choice, else the configured default. */
function effectivePrefer(prefer?: 'gemini' | 'local'): 'gemini' | 'local' {
  if (config.aiMode === 'local') return 'local';
  return prefer ?? config.aiMode; // config.aiMode is 'gemini' here
}

export type GenOpts = {
  prefer?: 'gemini' | 'local';
  ollamaModel?: string;
  /** Cancel the in-flight call (the chat's Stop button). */
  signal?: AbortSignal;
  /** Override the local-model safety timeout (the assistant runs long). */
  timeoutMs?: number;
  /** Sampling temperature (the assistant runs low for grounded, factual answers). */
  temperature?: number;
};

const JSON_SYSTEM =
  'You are a precise data generator for a D&D 5e app. Respond with ONLY a single ' +
  'valid JSON value matching the requested shape — no markdown, no code fences, ' +
  'no commentary before or after.';

/** Strip code fences / surrounding prose so callers can JSON.parse any backend. */
export function extractJson(text: string): string {
  let t = text.trim();
  // Remove a ```json … ``` fence if the model added one despite instructions.
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  // Trim to the outermost JSON object/array if there's stray prose around it.
  const first = t.search(/[[{]/);
  const last = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (first > 0 && last > first) t = t.slice(first, last + 1);
  return t;
}

/** Prose generation (rules assistant). `prefer='local'` = Ollama only;
 *  `prefer='gemini'` (default) = Gemini first with a local fallback. */
export async function generateText(
  system: string,
  user: string,
  opts: GenOpts = {},
): Promise<string | null> {
  const prefer = effectivePrefer(opts.prefer);
  const chat = {
    model: opts.ollamaModel,
    signal: opts.signal,
    timeoutMs: opts.timeoutMs,
    temperature: opts.temperature,
  };
  if (prefer === 'local') {
    return ollamaChat(system, user, chat);
  }
  // Gemini-first (quality). Its v1beta API has no system role, so fold it in.
  if (geminiEnabled()) {
    const text = await callGeminiText(`${system}\n\n${user}`, opts.signal);
    if (text) return text;
  }
  if (opts.signal?.aborted) return null; // a Stop between backends ends it
  return ollamaChat(system, user, chat);
}

/**
 * Structured-JSON generation (creatures, characters, items, spells). A drop-in
 * for the old `callGemini(prompt)`: returns a JSON string (cleaned of fences) or
 * null. Same backend selection as generateText.
 */
export async function generateJson(prompt: string, opts: GenOpts = {}): Promise<string | null> {
  const prefer = effectivePrefer(opts.prefer);
  const chat = { json: true, model: opts.ollamaModel, signal: opts.signal, timeoutMs: opts.timeoutMs };
  if (prefer === 'local') {
    const l = await ollamaChat(JSON_SYSTEM, prompt, chat);
    return l ? extractJson(l) : null;
  }
  if (geminiEnabled()) {
    const g = await callGemini(prompt, { signal: opts.signal });
    if (g) return extractJson(g);
  }
  if (opts.signal?.aborted) return null;
  const l = await ollamaChat(JSON_SYSTEM, prompt, chat);
  return l ? extractJson(l) : null;
}

/** Is SOME AI backend usable right now? In 'local' mode that means Ollama is
 *  reachable; otherwise a Gemini key OR a reachable Ollama. Gates UI affordances. */
export function aiAvailable(): boolean {
  if (config.aiMode === 'local') return ollamaReachable();
  return geminiEnabled() || ollamaReachable();
}

/** Is a local LLM configured at all (for surfacing local-only capabilities)? */
export function localLlmConfigured(): boolean {
  return ollamaConfigured();
}
