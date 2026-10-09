import dns from 'node:dns/promises';
import net from 'node:net';

/** Raster image MIME types we accept from a remote URL, each mapped to a FIXED
 *  extension. The remote server's Content-Type never reaches the filename, so a
 *  crafted `image/.html` or `image/\..\..\x` can't pick an extension or a path. */
const REMOTE_IMAGE_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/pjpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
  'image/avif': '.avif',
};

/** Fixed extension for an allowed raster MIME type, else null (svg/html/… refused). */
export function imageExtForMime(contentType: string | null): string | null {
  const type = (contentType ?? '').split(';')[0].trim().toLowerCase();
  return REMOTE_IMAGE_EXT[type] ?? null;
}

function isPrivateIpv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) || // link-local + cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    a >= 224 // multicast + reserved + broadcast
  );
}

/** Two hex groups ("7f00", "1") → dotted IPv4 ("127.0.0.1"). */
function hexGroupsToIpv4(hi: string, lo: string): string {
  const h = parseInt(hi, 16);
  const l = parseInt(lo, 16);
  return `${h >> 8}.${h & 255}.${l >> 8}.${l & 255}`;
}

/** True if `ip` is loopback / private / link-local (incl. the cloud metadata
 *  address 169.254.169.254) — anything an SSRF should never be allowed to reach.
 *  IPv6 forms that embed an IPv4 address (mapped, NAT64, 6to4) are judged by
 *  that embedded address. */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIpv4(ip);
  const v6 = ip.toLowerCase();
  if (v6 === '::1' || v6 === '::') return true;
  if (/^(fe[89ab]|fc|fd|ff)/.test(v6)) return true; // link-local, ULA, multicast
  if (v6.startsWith('2002:')) return true; // 6to4 — tunnels to an embedded IPv4
  const embedded =
    v6.match(/^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/) ??
    v6.match(/^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!embedded) return false;
  const v4 = embedded[2] !== undefined ? hexGroupsToIpv4(embedded[1], embedded[2]) : embedded[1];
  return isPrivateIpv4(v4);
}

/** Resolve a hostname and reject if it (or any A/AAAA record) is private —
 *  blocks SSRF to internal services / cloud metadata via the URL fetcher. */
export async function hostIsBlocked(hostname: string): Promise<boolean> {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (net.isIP(h)) return isPrivateIp(h);
  try {
    const addrs = await dns.lookup(h, { all: true });
    return addrs.some((a) => isPrivateIp(a.address));
  } catch {
    return true; // unresolvable → don't fetch
  }
}

export type RemoteImageResult =
  | { ok: true; buf: Buffer; ext: string }
  | { ok: false; status: number; error: string };

const MAX_REDIRECTS = 5;

/** Fetch an image from a user-supplied URL with the SSRF guard applied to EVERY
 *  hop (redirects are followed manually, never by fetch), an allowlisted MIME →
 *  fixed extension, and a size cap enforced while streaming rather than after
 *  buffering the whole body. */
export async function fetchRemoteImage(
  start: URL,
  maxBytes: number,
  opts: { blocked?: (hostname: string) => Promise<boolean> } = {},
): Promise<RemoteImageResult> {
  const blocked = opts.blocked ?? hostIsBlocked;
  const signal = AbortSignal.timeout(10_000);
  let url = start;
  for (let hop = 0; ; hop++) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { ok: false, status: 400, error: 'http(s) urls only' };
    }
    if (await blocked(url.hostname)) {
      return { ok: false, status: 400, error: 'that url is not allowed' };
    }
    const r = await fetch(url, {
      signal,
      redirect: 'manual',
      headers: {
        // Some image CDNs (googleusercontent included) refuse requests
        // without a browser-ish UA.
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        accept: 'image/avif,image/webp,image/png,image/*;q=0.8,*/*;q=0.5',
      },
    });
    if (r.status >= 300 && r.status < 400) {
      const location = r.headers.get('location');
      await r.body?.cancel();
      if (!location || hop >= MAX_REDIRECTS) {
        return { ok: false, status: 422, error: 'too many redirects' };
      }
      url = new URL(location, url);
      continue;
    }
    if (!r.ok) {
      await r.body?.cancel();
      console.warn(`[icons/from-url] ${url.hostname} returned ${r.status}`);
      const why =
        r.status === 401 || r.status === 403
          ? `source returned ${r.status} — the image likely requires a login`
          : `source returned ${r.status}`;
      return { ok: false, status: 422, error: why };
    }
    const contentType = r.headers.get('content-type');
    const ext = imageExtForMime(contentType);
    if (!ext) {
      await r.body?.cancel();
      const type = (contentType ?? '').split(';')[0].trim();
      return {
        ok: false,
        status: 422,
        error: `source sent ${type || 'no content-type'}, not a supported image`,
      };
    }
    if (Number(r.headers.get('content-length') ?? 0) > maxBytes) {
      await r.body?.cancel();
      return { ok: false, status: 413, error: 'image too large' };
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (r.body) {
      const reader = r.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          return { ok: false, status: 413, error: 'image too large' };
        }
        chunks.push(value);
      }
    }
    return { ok: true, buf: Buffer.concat(chunks), ext };
  }
}
