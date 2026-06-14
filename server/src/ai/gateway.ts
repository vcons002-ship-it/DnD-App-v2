import { ollamaChat, ollamaReachable, ollamaConfigured, refreshOllama } from './ollama.js';
import { callGemini, callGeminiText, geminiEnabled } from '../creatures/gemini.js';

export { refreshOllama, ollamaReachable, ollamaConfigured } from './ollama.js';

/**
 * App-wide AI gateway: a single chokepoint that prefers a LOCAL Ollama model and
 * falls back to the Gemini API. Every AI feature routes through here — the rules
 * assistant (generateText) and creature/character/item/spell generation
 * (generateJson) — so adding a backend or flipping the order is a one-file change
 * and "runs locally" is uniform across the app. Fail-safe: returns null when no
 * backend produces output, and callers degrade gracefully.
 */

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

/** Prose generation (rules assistant): Ollama, then Gemini, else null. */
export async function generateText(system: string, user: string): Promise<string | null> {
  const local = await ollamaChat(system, user);
  if (local) return local;
  // Gemini's v1beta generateContent has no system role here, so fold it in.
  if (geminiEnabled()) return callGeminiText(`${system}\n\n${user}`);
  return null;
}

/**
 * Structured-JSON generation (creatures, characters, items, spells). A drop-in
 * for the old `callGemini(prompt)`: returns a JSON string (cleaned of fences) or
 * null. Tries local Ollama (JSON mode) first, then Gemini's JSON mode.
 */
export async function generateJson(prompt: string): Promise<string | null> {
  const local = await ollamaChat(JSON_SYSTEM, prompt, { json: true });
  if (local) return extractJson(local);
  if (geminiEnabled()) {
    const text = await callGemini(prompt);
    return text ? extractJson(text) : null;
  }
  return null;
}

/** Is SOME AI backend usable right now (local reachable OR a Gemini key)? Used
 *  to gate AI affordances in the UI. */
export function aiAvailable(): boolean {
  return ollamaReachable() || geminiEnabled();
}

/** Is a local LLM configured at all (for surfacing local-only capabilities)? */
export function localLlmConfigured(): boolean {
  return ollamaConfigured();
}
