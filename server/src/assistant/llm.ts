/**
 * The rules assistant uses the app-wide AI gateway (ai/gateway.ts) like every
 * other AI feature: local Ollama first, Gemini fallback. Kept as a thin
 * re-export so the assistant's call sites stay stable.
 */
export { generateText } from '../ai/gateway.js';
export { aiAvailable as assistantConfigured } from '../ai/gateway.js';
