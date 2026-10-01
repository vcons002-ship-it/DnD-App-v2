import { test, expect, type Browser, type Page } from '@playwright/test';
import sharp from 'sharp';
import { DM_SECRET } from './playwright.config';

async function player(browser: Browser, code: string, name: string) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  const outgoing: string[] = [];
  page.on('websocket', socket => socket.on('framesent', frame => outgoing.push(String(frame.payload))));
  await page.goto(`/join?code=${code}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('.claim-row').filter({ hasText: name }).click();
  await expect(page.getByTestId('player-hud')).toBeVisible();
  return { context, page, outgoing };
}

async function openChat(page: Page) {
  await page.getByRole('button', { name: 'Open chat and roll log', exact: true }).click();
  await expect(page.getByLabel('Chat recipient')).toBeVisible();
}

async function send(page: Page, text: string) {
  const input = page.locator('.chat-input input');
  await input.fill(text);
  await input.press('Enter');
  await expect(input).toHaveValue('');
}

function message(page: Page, text: string) {
  return page.locator('.dice-panel .chat-msg').filter({ hasText: text });
}

test('private chat, player whispers, and party image messages keep the correct audience and usable UI', async ({ browser, request }, testInfo) => {
  test.setTimeout(120_000);
  const clue = {
    name: 'private-clue.png', mimeType: 'image/png',
    buffer: await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320"><rect width="640" height="320" fill="#ede1bc"/><rect x="20" y="20" width="600" height="280" rx="8" fill="none" stroke="#806d40" stroke-width="3"/><text x="48" y="104" font-size="34" fill="#453820">SEALED DRAWER</text><text x="48" y="169" font-size="24" fill="#453820">A brass key is taped</text><text x="48" y="207" font-size="24" fill="#453820">under the shelf.</text></svg>')).png().toBuffer(),
  };
  const created = await request.post('/api/sessions', {
    headers: { 'x-dm-passphrase': DM_SECRET }, data: { name: 'Private chat UI regression' },
  });
  expect(created.ok()).toBeTruthy();
  const { code } = await created.json();
  const druk = await player(browser, code, 'Druk');
  const varis = await player(browser, code, 'Varis');
  const vanec = await player(browser, code, 'Vanec');
  const dmContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const dm = await dmContext.newPage();
  const contexts = [druk.context, varis.context, vanec.context, dmContext];
  const pageErrors: string[] = [];
  for (const page of [druk.page, varis.page, vanec.page, dm]) page.on('pageerror', error => pageErrors.push(error.message));
  const typingFrames: string[] = [];
  const receivedFrames: string[] = [];
  druk.page.on('websocket', socket => {
    socket.on('framesent', frame => typingFrames.push(String(frame.payload)));
    socket.on('framereceived', frame => receivedFrames.push(String(frame.payload)));
  });
  // Subscribe on the existing connection too by reloading before the checks.
  await druk.page.reload();
  await expect(druk.page.getByTestId('player-hud')).toBeVisible();
  try {
    await dm.goto(`/dm?code=${code}`);
    await dm.locator('input[type=password]').fill(DM_SECRET);
    await dm.getByRole('button', { name: 'Rejoin as DM', exact: true }).click();
    await dm.getByRole('button', { name: 'Chat & dice', exact: true }).click();
    await openChat(varis.page);
    await openChat(vanec.page);
    await expect(dm.getByLabel('Chat recipient').locator('option')).toHaveCount(4);
    expect((await dm.getByLabel('Chat recipient').locator('option').allTextContents()).sort()).toEqual(['Druk', 'Everyone', 'Vanec', 'Varis']);
    await dm.getByLabel('Chat recipient').selectOption({ label: 'Druk' });
    const uploadResponse = dm.waitForResponse(response => response.url().endsWith('/api/chat-images') && response.request().method() === 'POST');
    await dm.locator('.chat-recipient-row input[type=file]').setInputFiles(clue);
    const uploaded = await uploadResponse;
    expect(uploaded.ok(), await uploaded.text()).toBeTruthy();
    await expect(dm.locator('.chat-attachment-draft img')).toBeVisible();
    await send(dm, 'The locked drawer contains this private clue.');
    await expect(message(druk.page, 'The locked drawer contains this private clue.')).toHaveCount(1);
    await expect(message(varis.page, 'The locked drawer contains this private clue.')).toHaveCount(0);
    await expect(message(vanec.page, 'The locked drawer contains this private clue.')).toHaveCount(0);
    await expect(druk.page.getByRole('button', { name: 'Open chat and roll log', exact: true })).toHaveAttribute('aria-expanded', 'false');
    await expect(druk.page.locator('.chat-image-viewer[open]')).toHaveCount(0);
    await openChat(druk.page);
    const received = message(druk.page, 'The locked drawer contains this private clue.');
    await expect(received.locator('.chat-private-label')).toContainText('Private');
    await expect(received.locator('img')).toHaveAttribute('src', /^blob:/);
    await received.locator('.chat-image-thumb').click();
    const viewer = druk.page.getByRole('dialog', { name: 'Private image: private-clue.png' });
    await expect(viewer).toBeVisible();
    await viewer.getByRole('button', { name: 'Full size', exact: true }).click();
    await expect(viewer.locator('.chat-image-viewer-body')).toHaveClass(/full-size/);
    await viewer.screenshot({ path: testInfo.outputPath('private-clue-viewer.png') });
    await druk.page.keyboard.press('Escape');
    await expect(viewer).not.toBeVisible();
    await received.getByRole('button', { name: 'Reply', exact: true }).click();
    await expect(druk.page.getByLabel('Chat recipient')).toHaveValue('dm');
    await send(druk.page, 'I will keep the drawer clue quiet.');
    await expect(message(dm, 'I will keep the drawer clue quiet.')).toHaveCount(1);
    await expect(message(varis.page, 'I will keep the drawer clue quiet.')).toHaveCount(0);

    // Player-to-player Reply chooses the peer rather than the DM.
    await druk.page.getByLabel('Chat recipient').selectOption({ label: 'Varis' });
    await druk.page.locator('.chat-recipient-row input[type=file]').setInputFiles(clue);
    await expect(druk.page.locator('.chat-attachment-draft img')).toBeVisible();
    await send(druk.page, 'Varis, cover the eastern passage.');
    const direct = message(varis.page, 'Varis, cover the eastern passage.');
    await expect(direct).toHaveCount(1);
    await expect(direct.locator('.chat-private-label')).toContainText('Druk');
    await expect(direct.locator('.chat-private-label')).toContainText('Varis');
    await expect(direct.locator('img')).toHaveAttribute('src', /^blob:/);
    await expect(message(dm, 'Varis, cover the eastern passage.')).toHaveCount(0);
    await expect(message(vanec.page, 'Varis, cover the eastern passage.')).toHaveCount(0);
    await direct.getByRole('button', { name: 'Reply', exact: true }).click();
    await expect(varis.page.getByLabel('Chat recipient').locator('option:checked')).toHaveText('Druk');
    await send(varis.page, 'The eastern passage is covered.');
    await expect(message(druk.page, 'The eastern passage is covered.')).toHaveCount(1);
    await expect(message(dm, 'The eastern passage is covered.')).toHaveCount(0);
    await send(varis.page, 'I will remain beside the eastern arch.');
    await expect(message(druk.page, 'I will remain beside the eastern arch.')).toHaveCount(1);
    const boundReplies = varis.outgoing.filter(frame => frame.includes('chat:send')).map(frame => {
      const payload = JSON.parse(frame.slice(frame.indexOf('[')))[1];
      return payload.replyToMessageId;
    });
    expect(boundReplies).toHaveLength(2);
    expect(typeof boundReplies[0]).toBe('string');
    expect(boundReplies[1]).toBe(boundReplies[0]);

    // Party is explicitly players only, including image bytes fetched in headers.
    const imageRequests: { url: string; authenticated: boolean }[] = [];
    varis.page.on('request', request => {
      if (request.url().includes('/api/chat-images/')) imageRequests.push({ url: request.url(), authenticated: !!request.headers().authorization });
    });
    await druk.page.getByLabel('Chat recipient').selectOption('party');
    await druk.page.locator('.chat-recipient-row input[type=file]').setInputFiles(clue);
    await expect(druk.page.locator('.chat-attachment-draft img')).toBeVisible();
    await druk.page.getByRole('button', { name: 'Remove attached image', exact: true }).click();
    await expect(druk.page.locator('.chat-attachment-draft')).toHaveCount(0);
    await druk.page.locator('.chat-recipient-row input[type=file]').setInputFiles(clue);
    await expect(druk.page.locator('.chat-attachment-draft img')).toBeVisible();
    await send(druk.page, 'Party, compare this clue before our next move.');
    const partyMessage = message(varis.page, 'Party, compare this clue before our next move.');
    await expect(partyMessage).toHaveCount(1);
    await expect(partyMessage.locator('.chat-private-label')).toHaveText('Party · players only');
    await expect(partyMessage.locator('img')).toHaveAttribute('src', /^blob:/);
    await expect(message(vanec.page, 'Party, compare this clue before our next move.')).toHaveCount(1);
    await expect(message(dm, 'Party, compare this clue before our next move.')).toHaveCount(0);
    expect(imageRequests.length).toBeGreaterThan(0);
    expect(imageRequests.every(request => request.authenticated && new URL(request.url).search === '')).toBe(true);
    expect(typingFrames.filter(frame => frame.includes('chat:typing') && frame.includes('"typing":true'))).toHaveLength(0);
    expect(receivedFrames.filter(frame => frame.includes('chat:say'))).toHaveLength(0);
    await expect(message(druk.page, 'Party, compare this clue before our next move.').locator('img')).toBeVisible();
    await message(druk.page, 'Party, compare this clue before our next move.').locator('img').evaluate(async image => {
      await (image as HTMLImageElement).decode();
    });
    await message(druk.page, 'Party, compare this clue before our next move.').evaluate(entry => {
      const log = entry.closest('.roll-log') as HTMLElement;
      log.scrollTop += entry.getBoundingClientRect().top - log.getBoundingClientRect().top;
    });
    await druk.page.locator('.player-chat').screenshot({ path: testInfo.outputPath('party-chat.png') });

    // A rejected command keeps both the text and attached image in its channel.
    await druk.page.locator('.chat-recipient-row input[type=file]').setInputFiles(clue);
    await expect(druk.page.locator('.chat-attachment-draft img')).toBeVisible();
    const draft = druk.page.locator('.chat-input input');
    await draft.fill('/roll 2d6+3');
    await draft.press('Enter');
    await expect(draft).toBeEnabled();
    await expect(draft).toHaveValue('/roll 2d6+3');
    await expect(druk.page.getByLabel('Chat recipient')).toHaveValue('party');
    await expect(druk.page.locator('.toast')).toBeVisible();
    await expect(druk.page.locator('.roll-reveal')).toHaveCount(0);
    await expect(druk.page.locator('.chat-attachment-draft img')).toBeVisible();

    await druk.page.getByLabel('Chat recipient').selectOption('');
    await expect(druk.page.locator('.chat-attachment-draft')).toHaveCount(0);
    await expect(druk.page.getByRole('button', { name: 'Attach image', exact: true })).toHaveCount(0);
    await send(druk.page, 'The whole group can hear this announcement.');
    for (const page of [dm, varis.page, vanec.page]) await expect(message(page, 'The whole group can hear this announcement.')).toHaveCount(1);
    expect(typingFrames.some(frame => frame.includes('chat:typing') && frame.includes('"typing":true'))).toBe(true);
    await varis.page.getByLabel('Chat recipient').selectOption('');
    await send(varis.page, 'The eastern passage looks safe to everyone.');
    await expect(message(dm, 'The eastern passage looks safe to everyone.')).toHaveCount(1);
    const lastVarisSend = varis.outgoing.filter(frame => frame.includes('chat:send')).at(-1)!;
    expect(JSON.parse(lastVarisSend.slice(lastVarisSend.indexOf('[')))[1].replyToMessageId).toBeUndefined();

    // Public /roll keeps its draft pending until the real server physics settles.
    await draft.fill('/roll 1d20');
    await draft.press('Enter');
    const liveDice = druk.page.locator('[data-live-dice="true"]');
    await expect(liveDice).toBeVisible({ timeout: 15_000 });
    await expect(liveDice.locator('.dice-tray-canvas')).toBeVisible();
    await expect(liveDice.locator('.tray-die-result')).toHaveCount(1);
    await expect(liveDice.locator('.dice-tray-status')).toHaveCount(0);
    await expect(draft).toHaveValue('/roll 1d20');
    await expect(draft).toBeDisabled();
    for (const page of [dm, varis.page, vanec.page]) await expect(page.locator('[data-live-dice="true"]')).toBeVisible();
    await expect(draft).toHaveValue('', { timeout: 60_000 });
    await expect(draft).toBeEnabled();
    for (const page of [druk.page, dm, varis.page, vanec.page]) {
      await expect(page.locator('.dice-panel .roll-entry')).toHaveCount(1);
      await expect(page.locator('.dice-panel .roll-entry')).toContainText('1d20');
    }
    expect(receivedFrames.some(frame => frame.includes('dice:frame'))).toBe(true);
    expect(pageErrors).toEqual([]);
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});
