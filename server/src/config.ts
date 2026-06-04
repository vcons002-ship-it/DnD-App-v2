import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');

export const config = {
  port: Number(process.env.PORT ?? 4000),
  /** Explicit public URL override (named tunnel or custom provider). */
  publicUrl: process.env.PUBLIC_URL?.replace(/\/$/, '') || '',
  cfTunnelName: process.env.CF_TUNNEL_NAME || '',
  dmPassphrase: process.env.DM_PASSPHRASE || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  /** Absolute paths to local storage (created on boot). */
  dataDir: path.join(serverRoot, 'data'),
  uploadsDir: path.join(serverRoot, 'uploads'),
  dbPath: path.join(serverRoot, 'data', 'game.db'),
  /** Where the built client lives (served in production). */
  clientDist: path.resolve(serverRoot, '..', 'client', 'dist'),
};
