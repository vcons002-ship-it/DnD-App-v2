import { useStore } from '../state/socket';

/**
 * `fetch` wrapper that attaches the DM secret so DM-gated REST routes authenticate.
 *
 * The DM secret is mandatory server-side, and the DM-only endpoints (creature
 * lookup, AI item/shop generation, library curation) enforce it via `requireDm`.
 * The browser can't rely on a cookie/session for REST, so we send the secret the
 * store already holds (`dmPassphrase`, set at DM join) as a header. A player has
 * no secret → the header is simply omitted, and player-facing routes ignore it —
 * so it is always safe to route a call through here.
 *
 * Use this for any DM-gated endpoint instead of raw `fetch`.
 */
export function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const pass = useStore.getState().dmPassphrase;
  const headers = new Headers(init.headers);
  if (pass) headers.set('x-dm-passphrase', pass);
  return fetch(input, { ...init, headers });
}
