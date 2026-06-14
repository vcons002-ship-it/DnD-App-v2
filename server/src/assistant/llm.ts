import { config } from '../config.js';
import { callGeminiText, geminiEnabled } from '../creatures/gemini.js';

/**
 * Text generation for the rules assistant. Tries the local Ollama HTTP server
 * first (private, offline, no key), then falls back to the Gemini API if a key
 * is configured. Fail-safe: returns null if neither backend produces text, so
 * the caller can post a graceful "assistant unavailable" notice.
 */

/** POST a chat completion to a local Ollama server. Null on any failure. */
async function callOllama(system: string, user: string): Promise<string | null> {
  if (!config.ollamaUrl || !config.ollamaModel) return null;
  try {
    const res = await fetch(`${config.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.ollamaModel,
        stream: false,
        options: { temperature: 0.2 },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      // Local models can be slow on first load; give them room but not forever.
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      console.warn(`  [ollama] HTTP ${res.status} from ${config.ollamaModel}`);
      return null;
    }
    const data = (await res.json()) as { message?: { content?: string } };
    const text = data.message?.content?.trim();
    return text || null;
  } catch (err) {
    // Connection refused (Ollama not running) lands here — that's expected.
    console.warn('  [ollama] request failed:', (err as Error).message);
    return null;
  }
}

/** Generate prose from a system + user prompt: Ollama, then Gemini, else null. */
export async function generateText(system: string, user: string): Promise<string | null> {
  const local = await callOllama(system, user);
  if (local) return local;
  if (geminiEnabled()) {
    // Gemini's v1beta generateContent has no separate system role here, so fold
    // the instructions into the prompt.
    return callGeminiText(`${system}\n\n${user}`);
  }
  return null;
}

/** Whether SOME backend could answer (Ollama is always attempted; Gemini if keyed). */
export function assistantConfigured(): boolean {
  return !!(config.ollamaUrl && config.ollamaModel) || geminiEnabled();
}
