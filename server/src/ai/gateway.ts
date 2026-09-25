import { reportAi } from './status.js';
import { config } from '../config.js';
import { ollamaChat, ollamaReachable, ollamaConfigured, refreshOllama } from './ollama.js';
import { callGemini, callGeminiText, geminiEnabled } from '../creatures/gemini.js';

export { refreshOllama, ollamaReachable, ollamaConfigured, listOllamaModels } from './ollama.js';

/** Local mode prefers Ollama, with Gemini as the configured API backup. */
function effectivePrefer(prefer?: 'gemini' | 'local'): 'gemini' | 'local' {
  return config.aiMode === 'local' ? 'local' : prefer ?? config.aiMode;
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

/** Shared bounded fallback: each backend is used at most once per operation. */
async function generate(system: string, user: string, json: boolean, opts: GenOpts): Promise<string|null> {
  const local=()=>ollamaChat(system,user,{json,model:opts.ollamaModel,signal:opts.signal,timeoutMs:opts.timeoutMs,temperature:opts.temperature});
  const api=()=>json ? callGemini(user,{signal:opts.signal}) : callGeminiText(`${system}\n\n${user}`,opts.signal);
  const accept=(text:string|null) => {
    if(!text?.trim()) return null;
    if(!json) return text;
    try {const cleaned=extractJson(text);JSON.parse(cleaned);return cleaned;} catch{return null;}
  };
  const order=effectivePrefer(opts.prefer)==='local' ? ['local','api'] : ['api','local'];
  let failed=false;
  for(const backend of order) {
    if(opts.signal?.aborted) return null;
    if(backend==='api' && !geminiEnabled()) {
      if(failed) reportAi('Local model failed; API backup is unavailable. Configure a Gemini API key in Settings.');
      continue;
    }
    if(failed) reportAi(backend==='api' ? 'Local model failed or returned unusable output. Switching to Gemini API backup.' : 'Gemini API failed. Trying the local model.');
    let output:string|null=null;
    try {output=accept(await (backend==='local'?local():api()));} catch { /* try backup */ }
    if(opts.signal?.aborted) return null;
    if(output) {
      if(failed) reportAi(`${backend==='api'?'Gemini API backup':'Local backup'} completed the request.`);
      return output;
    }
    failed=true;
  }
  reportAi('Generation failed. No usable result was returned; you can try again.');
  return null;
}
export function generateText(system:string,user:string,opts:GenOpts={}):Promise<string|null> {
  return generate(system,user,false,opts);
}
export function generateJson(prompt:string,opts:GenOpts={}):Promise<string|null> {
  return generate(JSON_SYSTEM,prompt,true,opts);
}
export function aiAvailable(): boolean {
  return geminiEnabled() || ollamaReachable();
}

/** Is a local LLM configured at all (for surfacing local-only capabilities)? */
export function localLlmConfigured(): boolean {
  return ollamaConfigured();
}
