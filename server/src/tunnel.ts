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
 * One quick-tunnel attempt: spawn `cloudflared tunnel --url …`, resolve with the
 * trycloudflare URL it prints, or '' if it errors / exits / doesn't print one
 * within `timeoutMs`. A FAILED attempt's process is killed so retries don't leave
 * orphan tunnels (which is exactly how you end up with a live URL pointing at a
 * dead origin — a 404 that looks like "the tunnel didn't go through").
 */
function attemptQuickTunnel(timeoutMs: number): Promise<string> {
  return new Promise((resolve) => {
    const proc = spawn('cloudflared', [
      'tunnel',
      '--url',
      `http://localhost:${config.port}`,
    ]);
    let done = false;
    const urlRe = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
    const timer = setTimeout(() => settle(''), timeoutMs);
    function settle(url: string) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (!url) {
        try {
          proc.kill();
        } catch {
          /* already gone */
        }
      }
      resolve(url);
    }
    const onData = (buf: Buffer) => {
      const match = buf.toString().match(urlRe);
      if (match) settle(match[0]);
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData); // cloudflared logs the URL to stderr
    proc.on('error', () => settle(''));
    proc.on('close', () => settle('')); // exited before printing a URL
  });
}

/**
 * Start a Cloudflare Tunnel pointing at the local server and resolve the public
 * URL. Falls back to localhost (with an install hint) when cloudflared is
 * missing or a PUBLIC_URL override is configured. Tunnel-agnostic: swapping in
 * ngrok/Tailscale only means setting PUBLIC_URL or editing this file.
 */
export async function startTunnel(): Promise<string> {
  // Case A: an external tunnel is managed elsewhere (PUBLIC_URL set, nothing to
  // run here) — just trust the configured URL and don't spawn anything.
  if (config.publicUrl && !config.cfTunnelName && !config.cfTunnelToken) {
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

  // Case B1: a remotely-managed named tunnel (created in the Zero Trust
  // dashboard) — cloudflared runs with a token and the dashboard maps your
  // hostname → http://localhost:PORT. The public URL is your PUBLIC_URL. This is
  // the recommended way to put the app on your OWN DOMAIN with a stable link.
  if (config.cfTunnelToken) {
    const proc = spawn('cloudflared', ['tunnel', 'run', '--token', config.cfTunnelToken]);
    proc.on('error', () =>
      console.warn('  Failed to start the token tunnel; falling back to localhost.'),
    );
    currentPublicUrl = config.publicUrl || publicUrl();
    if (!config.publicUrl) {
      console.warn(
        '  CF_TUNNEL_TOKEN is set but PUBLIC_URL is empty — set PUBLIC_URL to the\n' +
          '  public hostname you configured in the Cloudflare dashboard so the shared\n' +
          '  links are correct.',
      );
    } else {
      console.log(`  Cloudflare tunnel (token) started → ${currentPublicUrl}`);
    }
    return currentPublicUrl;
  }

  // Case B2: a locally-configured named tunnel (cloudflared reads its own
  // config.yml ingress); the public URL comes from PUBLIC_URL.
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
    } else {
      console.log(`  Cloudflare tunnel (${config.cfTunnelName}) started → ${currentPublicUrl}`);
    }
    return currentPublicUrl;
  }

  // Case C: zero-config quick tunnel. trycloudflare quick tunnels are rate-
  // limited and don't always come up on the first try, so retry a few times
  // (each attempt gets its own process; failed ones are killed) before giving up.
  const TRIES = 3;
  for (let attempt = 1; attempt <= TRIES; attempt++) {
    const url = await attemptQuickTunnel(30_000);
    if (url) {
      currentPublicUrl = url;
      console.log(`  Cloudflare quick tunnel up → ${url}`);
      return url;
    }
    console.warn(
      `  Cloudflare quick tunnel attempt ${attempt}/${TRIES} didn't come up` +
        (attempt < TRIES ? ' — retrying…' : '.'),
    );
  }
  console.warn(
    '  Quick tunnel failed — remote players can\'t reach this URL. It is rate-\n' +
      '  limited by Cloudflare; retry start, update cloudflared, or set up a named\n' +
      '  tunnel on your own domain (CF_TUNNEL_TOKEN + PUBLIC_URL — see README).\n' +
      '  Falling back to localhost.',
  );
  return publicUrl();
}
