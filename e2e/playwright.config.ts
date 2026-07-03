import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';

// A throwaway DB + fixed DM secret + no tunnel, so the smoke test never touches
// the real save and doesn't need to scrape the generated secret.
const PORT = 4099;
const DM_SECRET = 'e2e-secret';
const DB_PATH = path.join(os.tmpdir(), `dnd-e2e-${process.pid}.db`);
// Playwright runs the config from the repo root (via the `test:e2e` script).
const serverDir = path.resolve('server');

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Use the environment's preinstalled Chromium when present (no download).
    launchOptions: process.env.PW_CHROMIUM
      ? { executablePath: process.env.PW_CHROMIUM }
      : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Run the server (which serves the prebuilt client dist) against a temp DB.
  // The client is built by the `test:e2e` script before playwright starts.
  webServer: {
    command: 'node --import tsx src/index.ts',
    cwd: serverDir,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PORT: String(PORT),
      PUBLIC_URL: `http://localhost:${PORT}`, // skip cloudflared
      DM_PASSPHRASE: DM_SECRET,
      DB_PATH,
    },
  },
});

export { PORT, DM_SECRET };
