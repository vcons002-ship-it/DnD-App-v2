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
  /** Checkpoint (model) ComfyUI loads; blank = auto-pick the first installed one. */
  comfyModel: process.env.COMFY_MODEL || '',
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
