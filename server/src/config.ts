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
  /** Absolute paths to local storage (created on boot). */
  dataDir: path.join(serverRoot, 'data'),
  uploadsDir: path.join(serverRoot, 'uploads'),
  dbPath: path.join(serverRoot, 'data', 'game.db'),
  /** Runtime settings overrides (API key / model) editable from the UI. */
  settingsPath: path.join(serverRoot, 'data', 'settings.json'),
  /** Where the built client lives (served in production). */
  clientDist: path.resolve(serverRoot, '..', 'client', 'dist'),
};
