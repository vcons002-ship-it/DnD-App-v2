import { expect, type Page } from './test';
import type { Socket } from 'socket.io-client';
import type { RollEntry, StateSnapshot } from '../../shared/types';
import type { LiveDiceFrame } from '../../shared/liveDiceTypes';

// A result does not exist until authoritative physics and the face reveal finish.
// Wait for a specific new persisted roll, never an arbitrary sleep or an old row.
export const LIVE_COMBAT_TIMEOUT = 60_000;
export async function waitForCombatRoll(
  snapshot: () => Promise<StateSnapshot>,
  previous: Set<string>,
  matches: (entry: RollEntry) => boolean,
): Promise<RollEntry> {
  let result: RollEntry | undefined;
  await expect.poll(async () => {
    result = (await snapshot()).rollLog.findLast(entry => !previous.has(entry.id) && matches(entry));
    return !!result;
  }, { timeout: LIVE_COMBAT_TIMEOUT }).toBe(true);
  return result!;
}

export function observeCombatDice(socket: Socket) {
  const frames: LiveDiceFrame[] = [];
  socket.on('dice:frame', (frame: LiveDiceFrame) => frames.push(frame));
  return frames;
}

export function completedDice(frames: LiveDiceFrame[]): LiveDiceFrame[] {
  const stages = new Map<string, LiveDiceFrame>();
  for (const frame of frames) if (frame.done) stages.set(frame.id, frame);
  return [...stages.values()];
}

export async function dismissCommittedRoll(page: Page, rollId: string) {
  // `rollId` is committed on the server. Wait for its presentation to finish
  // (the live tray is gone), then clear whatever result card is still up so a
  // late overlay cannot intercept the next click. A live roll's card carries
  // the live-roll id, not the log id, so the card is not matched by id; the
  // overlay's history marker is checked only to know the card already went.
  const cards = page.locator('.roll-reveal');
  const finished = () => page.getByTestId('roll-reveal-history').getAttribute('data-finished-rolls')
    .then(json => (JSON.parse(json ?? '[]') as string[]).includes(rollId)).catch(() => false);
  await expect(page.locator('[data-live-dice="true"]')).toHaveCount(0, { timeout: LIVE_COMBAT_TIMEOUT });
  await expect.poll(async () => (await cards.count()) > 0 || await finished(), { timeout: 10_000 }).toBe(true).catch(() => undefined);
  if (await cards.count()) {
    // The card may finish its hold and fade between the check and the click.
    await cards.first().click({ position: { x: 10, y: 10 }, timeout: 5000 }).catch(() => undefined);
    await expect(cards).toHaveCount(0);
  }
}
