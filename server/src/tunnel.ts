import { spawn } from 'node:child_process';
import { config } from './config.js';

let currentPublicUrl = '';

/** The public base URL clients should use, or localhost until a tunnel is up. */
export function publicUrl(): string {
  if (config.publicUrl) return config.publicUrl;
  return currentPublicUrl || `http://localhost:${config.port}`;
}

function hasCloudflared(): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = spawn('cloudflared', ['--version']);
    probe.on('error', () => resolve(false));
    probe.on('close', (code) => resolve(code === 0));
  });
}

/**
 * Start a Cloudflare Tunnel pointing at the local server and resolve the public
 * URL. Falls back to localhost (with an install hint) when cloudflared is
 * missing or a PUBLIC_URL override is configured. Tunnel-agnostic: swapping in
 * ngrok/Tailscale only means setting PUBLIC_URL or editing this file.
 */
export async function startTunnel(): Promise<string> {
  // Case A: an external tunnel is managed elsewhere (PUBLIC_URL set, no name to
  // run here) — just trust the configured URL and don't spawn anything.
  if (config.publicUrl && !config.cfTunnelName) {
    currentPublicUrl = config.publicUrl;
    return currentPublicUrl;
  }

  if (!(await hasCloudflared())) {
    console.warn(
      '\n  cloudflared not found — remote access is disabled.\n' +
        '  Install it (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)\n' +
        '  or set PUBLIC_URL in .env to use another tunnel. Falling back to localhost.\n',
    );
    return publicUrl();
  }

  // Case B: a pre-created named tunnel for a stable hostname. cloudflared reads
  // its own config/ingress; the public URL comes from PUBLIC_URL.
  if (config.cfTunnelName) {
    const proc = spawn('cloudflared', ['tunnel', 'run', config.cfTunnelName]);
    proc.on('error', () =>
      console.warn('  Failed to start named tunnel; falling back to localhost.'),
    );
    currentPublicUrl = config.publicUrl || publicUrl();
    if (!config.publicUrl) {
      console.warn(
        '  CF_TUNNEL_NAME is set but PUBLIC_URL is empty — set PUBLIC_URL to your\n' +
          '  tunnel hostname so the shared links are correct.',
      );
    }
    return currentPublicUrl;
  }

  // Case C: zero-config quick tunnel — cloudflared prints a random
  // trycloudflare.com URL which we parse from its output.
  return new Promise((resolve) => {
    const proc = spawn('cloudflared', [
      'tunnel',
      '--url',
      `http://localhost:${config.port}`,
    ]);
    let resolved = false;
    const urlRe = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

    const finish = (url: string) => {
      if (resolved) return;
      resolved = true;
      currentPublicUrl = url.startsWith('http') ? url : '';
      resolve(publicUrl());
    };

    const onData = (buf: Buffer) => {
      const match = buf.toString().match(urlRe);
      if (match) finish(match[0]);
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData); // cloudflared logs the URL to stderr
    proc.on('error', () => finish(''));

    // Safety: never hang startup waiting on the tunnel.
    setTimeout(() => finish(''), 15000);
  });
}
