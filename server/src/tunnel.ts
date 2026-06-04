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
  if (config.publicUrl) {
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

  const args = config.cfTunnelName
    ? ['tunnel', 'run', config.cfTunnelName]
    : ['tunnel', '--url', `http://localhost:${config.port}`];

  return new Promise((resolve) => {
    const proc = spawn('cloudflared', args);
    let resolved = false;
    const urlRe = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

    const onData = (buf: Buffer) => {
      const text = buf.toString();
      const match = text.match(urlRe);
      if (match && !resolved) {
        resolved = true;
        currentPublicUrl = match[0];
        resolve(currentPublicUrl);
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData); // cloudflared logs the URL to stderr

    proc.on('error', () => {
      if (!resolved) {
        resolved = true;
        resolve(publicUrl());
      }
    });

    // For named tunnels the URL is pre-configured; resolve quickly.
    if (config.cfTunnelName && config.publicUrl) {
      resolved = true;
      resolve(config.publicUrl);
    }

    // Safety: never hang startup waiting on the tunnel.
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(publicUrl());
      }
    }, 15000);
  });
}
