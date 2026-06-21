import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(serverRoot, '..');

// Load env from the current dir AND the repo root, because the server often runs
// with cwd = server/ (npm workspaces) while .env lives at the repo root. Neither
// overrides real environment variables.
dotenv.config();
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(serverRoot, '.env') });

export const config = {
  port: Number(process.env.PORT ?? 4000),
  /** Explicit public URL override (named tunnel or custom provider). */
  publicUrl: process.env.PUBLIC_URL?.replace(/\/$/, '') || '',
  cfTunnelName: process.env.CF_TUNNEL_NAME || '',
  dmPassphrase: process.env.DM_PASSPHRASE || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  /** Explicit Gemini model override; blank = auto-discover a fast model. */
  geminiModel: process.env.GEMINI_MODEL || '',
  /** Local Ollama HTTP server base URL (the rules assistant tries this first). */
  ollamaUrl: (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, ''),
  /** Default Ollama model (must be pulled locally; the chat can pick another). */
  ollamaModel: process.env.OLLAMA_MODEL || 'llama3.1',
  /** Ollama context window (tokens). The default is small and would truncate the
   *  grounding context (→ hallucination); 8k comfortably fits the rules excerpts. */
  ollamaNumCtx: Number(process.env.OLLAMA_NUM_CTX) || 8192,
  /** Local ComfyUI HTTP server base URL for in-app image generation (token art,
   *  maps, decals). Unreachable → the feature stays hidden. */
  comfyUrl: (process.env.COMFY_URL || 'http://127.0.0.1:8188').replace(/\/$/, ''),
  /** Checkpoint (model) ComfyUI loads; blank = auto-pick the first installed one.
   *  Only used by the BUILT-IN SD txt2img graph (ignored when comfyWorkflow set). */
  comfyModel: process.env.COMFY_MODEL || '',
  /** Optional custom ComfyUI workflow in **API format** (the graph posted to
   *  `/prompt`), with `%prompt%`/`%negative%`/`%width%`/`%height%`/`%seed%`
   *  placeholders. Set this to run ANY architecture the built-in SD graph can't —
   *  Flux, SD3, or other T5/Mistral "text-diffusion" models that need their own
   *  loader nodes. Blank = use the built-in CheckpointLoaderSimple graph. */
  comfyWorkflow: process.env.COMFY_WORKFLOW || '',
  /** Framing wrapped around a map-generation prompt so base models (which aren't
   *  trained on battle maps) render a top-down VTT map rather than a scene.
   *  `{prompt}` marks where the DM's description goes (else it's appended). Blank
   *  = the built-in default. Add a battle-map LoRA's trigger word here too. */
  comfyMapStyle: process.env.COMFY_MAP_STYLE || '',
  /** Optional battle-map LoRA filename, auto-spliced into the graph for map
   *  generation only. Skipped gracefully if not installed. Put its trigger word
   *  (if any) in `comfyMapStyle`. */
  comfyMapLora: process.env.COMFY_MAP_LORA || '',
  /** Optional trigger word for the map LoRA, auto-prepended to every map prompt
   *  (so the DM sets it once instead of typing it each time). Many LoRAs need
   *  none — leave blank then. */
  comfyMapLoraTrigger: process.env.COMFY_MAP_LORA_TRIGGER || '',
  /** Default AI backend for generation features: 'gemini' (best quality, local
   *  fallback) or 'local' (Ollama only — no cloud calls). The chat picks its own
   *  per-question backend; 'local' here is a global lockdown that wins. */
  aiMode: (process.env.AI_MODE === 'local' ? 'local' : 'gemini') as 'gemini' | 'local',
  /** Absolute paths to local storage (created on boot). */
  dataDir: path.join(serverRoot, 'data'),
  uploadsDir: path.join(serverRoot, 'uploads'),
  dbPath: path.join(serverRoot, 'data', 'game.db'),
  /** Runtime settings overrides (API key / model) editable from the UI. */
  settingsPath: path.join(serverRoot, 'data', 'settings.json'),
  /** Uploaded rulebook PDF, parsed into searchable chunks (rules assistant). */
  rulebookPath: path.join(serverRoot, 'data', 'rulebook.json'),
  /** Where the built client lives (served in production). */
  clientDist: path.resolve(serverRoot, '..', 'client', 'dist'),
};
