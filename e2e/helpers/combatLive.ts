import { expect, type Page } from '@playwright/test';
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
  // A DM snapshot can arrive before this player's rendered result. Skip only
  // after that same result is visible, so a late overlay cannot intercept input.
  await expect(page.locator('.roll-reveal')).toHaveAttribute('data-roll-id', rollId,
    { timeout: LIVE_COMBAT_TIMEOUT });
  await page.locator(`.roll-reveal[data-roll-id="${rollId}"]`).click({ position: { x: 10, y: 10 } });
  await expect(page.locator('.roll-reveal')).toHaveCount(0);
}
