import type { RiposteOpportunity } from '../../shared/types.js';

// Opportunities are short-lived; reaction expenditure is a persisted condition.
const offers = new Map<string, RiposteOpportunity & { sessionId: string }>();
export function listRipostes(sessionId: string): RiposteOpportunity[] {
  for (const [id, offer] of offers) if (offer.expiresAt <= Date.now()) offers.delete(id);
  return [...offers.values()].filter(o => o.sessionId === sessionId);
}
export function offerRiposte(sessionId: string, offer: RiposteOpportunity): void {
  listRipostes(sessionId);
  for (const [id, old] of offers) if (old.owner === offer.owner) offers.delete(id);
  offers.set(offer.id, {...offer, sessionId});
}
export function removeRiposte(id: string): void { offers.delete(id); }
export function clearRipostes(sessionId: string): void {
  for (const [id, offer] of offers) if (offer.sessionId === sessionId) offers.delete(id);
}
export const RIPOSTE_SPENT = 'Reaction spent (Riposte)';
