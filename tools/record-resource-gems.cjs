// Actual browser frames and resource:set reactions in a disposable preview copy.
// No application source changes and no writes/claims on ports 4000 or 4276.
const { chromium, expect } = require('@playwright/test');
const { io } = require('socket.io-client');
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const requestedTag = process.argv.find((argument) => argument.startsWith('--tag='))?.slice(6);
const tag = requestedTag || 'faceted';
if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(tag)) throw new Error('Recording tag must contain only lowercase letters, digits and hyphens (48 characters maximum)');
const withCustom = process.argv.includes('--with-custom');
const withSpellLevels = process.argv.includes('--spell-levels');
const uiScalePercent = 85;
const evidence = path.join(root, 'preview-evidence', 'resource-gems-' + tag + '-2026-09-16');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dnd-gem-video-'));
const framesDir = path.join(scratch, 'frames');
const port = 4282;
const base = `http://127.0.0.1:${port}`;
const secret = 'isolated-resource-gem-recording';
const ffmpeg = process.env.GEM_FFMPEG || 'ffmpeg';
const ffprobe = process.env.GEM_FFPROBE || 'ffprobe';
let server, browser, dm, fixture;
const errors = [];
const frames = [];
const pending = new Set();
const events = [];
let recording = false;

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (data) => stdout += data);
    child.stderr.on('data', (data) => stderr += data);
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(`${command} exited ${code}: ${stderr.slice(-5000)}`)));
  });
}
function concatFile(file) { return `file '${file.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`; }

(async () => {
  // A new comparison must never replace the prior demonstration. Give a
  // subsequent take its own --tag=faceted-pass2 rather than overwriting it.
  for (const file of ['recording-receipt.json', 'resource-gems-full-screen.mp4', 'resource-gems-close-up.mp4']) {
    if (fs.existsSync(path.join(evidence, file))) throw new Error(`Recording already exists: ${path.join(evidence, file)}. Choose a new --tag=...`);
  }
  fs.mkdirSync(evidence, { recursive: true });
  fs.mkdirSync(framesDir);
  const sourcePath = path.join(root, '.preview-review', 'game.db');
  const source = new Database(sourcePath, { readonly: true });
  const session = source.prepare('SELECT id, code FROM sessions ORDER BY last_played_at DESC LIMIT 1').get();
  const original = source.prepare('SELECT id,name,cur_hp,max_hp,temp_hp,spell_slots,resources FROM characters WHERE session_id=? AND name=?').get(session.id, 'Vanec');
  if (!original) throw new Error('Expected preview sorcerer Vanec was not found');
  await source.backup(path.join(scratch, 'game.db'));
  source.close();
  fs.cpSync(path.join(root, '.preview-review', 'uploads'), path.join(scratch, 'uploads'), { recursive: true });
  fixture = new Database(path.join(scratch, 'game.db'));
  fixture.exec('UPDATE characters SET claimed_by=NULL');
  const originalCounters = { spellSlots: JSON.parse(original.spell_slots), resources: JSON.parse(original.resources) };
  const spellKey = 'L1', classKey = 'Sorcery Points';
  const spell = originalCounters.spellSlots[spellKey], classPool = originalCounters.resources[classKey];
  if (!withSpellLevels && (!spell || !classPool || spell.max - spell.used < 1 || classPool.max - classPool.used < 3)) {
    throw new Error('Expected at least one available L1 slot and three Sorcery Points in the preview copy; no source or counter seeding was performed');
  }
  const romanLevels = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
  const existingSpellTiers = Object.entries(originalCounters.spellSlots)
    .filter(([key, counter]) => /^L[1-9]$/.test(key) && counter.max > 0)
    .sort(([left], [right]) => Number(left.slice(1)) - Number(right.slice(1)));
  const previewRestores = existingSpellTiers.filter(([, counter]) => counter.used > 0);
  if (withSpellLevels && !previewRestores.length) throw new Error('Spell-level demonstration expects at least one existing spent slot; no new slots are added');
  const readCounters = () => {
    const row = fixture.prepare('SELECT spell_slots,resources FROM characters WHERE id=?').get(original.id);
    return { spellSlots: JSON.parse(row.spell_slots), resources: JSON.parse(row.resources) };
  };
  server = spawn(process.execPath, ['--import', 'tsx', 'server/src/index.ts'], {
    cwd: root, windowsHide: true, stdio: 'ignore',
    env: { ...process.env, DATA_ROOT: scratch, DB_PATH: path.join(scratch, 'game.db'), PORT: String(port), DND_HOST: '127.0.0.1', DND_PREVIEW: '1', PUBLIC_URL: base, DM_PASSPHRASE: secret, GEMINI_API_KEY: '', OLLAMA_URL: 'http://127.0.0.1:1', COMFY_URL: 'http://127.0.0.1:1' },
  });
  server.on('error', (error) => errors.push(error.message));
  await expect.poll(async () => { try { return (await fetch(`${base}/api/health`)).ok; } catch { return false; } }, { timeout: 20000 }).toBe(true);
  dm = io(base, { transports: ['websocket'], forceNew: true });
  const joined = await dm.timeout(5000).emitWithAck('join', { sessionCode: session.code, role: 'dm', dmPassphrase: secret });
  expect(joined.ok).toBe(true);
  browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 2, reducedMotion: 'no-preference' });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/join?code=${session.code}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('.claim-row').filter({ hasText: 'Vanec' }).click();
  await expect(page.locator('.hud-identity')).toContainText('Vanec');
  await expect.poll(() => page.locator('.orb-holder').evaluate((el) => el.complete && el.naturalWidth > 0)).toBe(true);
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('button', { name: 'Interface settings', exact: true }).click();
  await page.getByLabel('Concentric arcs', { exact: true }).check();
  await page.locator('#player-ui-scale').fill(String(uiScalePercent));
  await page.getByRole('button', { name: 'Close interface settings', exact: true }).click();
  await page.getByTitle('Zoom in', { exact: true }).click({ clickCount: 4 });
  await page.mouse.move(850, 360);
  const gems = page.locator('.resource-jewel.resource-gem');
  await expect(gems.first()).toBeVisible();
  await expect(gems.first()).toHaveAttribute('data-gem-motion', 'animated');
  await expect(gems.first()).toHaveAttribute('data-gem-paused', 'false');
  expect(await page.evaluate(() => document.hidden)).toBe(false);
  const row = (key) => page.getByRole('group', { name: new RegExp('^' + key + ':') });
  await expect(row(spellKey).locator('.resource-gem')).toHaveCount(spell.max);
  await expect(row(classKey).locator('.resource-gem')).toHaveCount(classPool.max);
  const readGemGeometry = () => page.locator('.core-resource-rows').evaluate((root) => (
    [...root.querySelectorAll('.resource-gem')].map((gem, index) => {
      const rect = gem.getBoundingClientRect();
      return { index, kind: gem.dataset.gemKind, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    })
  ));
  const stableGemGeometry = await readGemGeometry();
  let drawerBounds = null;
  // Custom trackers now fill free rack positions. Only demonstrate a drawer
  // when it actually contains overflow, never an empty custom-only window.
  const showOverflow = withCustom && await page.locator('.resource-custom-trigger').count() > 0;
  if (showOverflow) {
    await page.locator('.resource-custom-trigger').click();
    await expect(page.getByRole('region', { name: 'Additional resource trackers', exact: true })).toBeInViewport();
    drawerBounds = await page.locator('.custom-resource-drawer').boundingBox();
    await page.getByRole('button', { name: 'Close additional resources', exact: true }).click();
  }
  // Include the real hover description in the crop without enlarging the UI.
  // This pre-capture measurement avoids a clipped tooltip in the close-up.
  await page.getByRole('button', { name: /^Level 1:.*Adjust maximum and remaining$/ }).hover();
  const hoverTooltip = page.getByRole('tooltip').filter({ hasText: 'Level 1' });
  await expect(hoverTooltip).toBeVisible();
  const tooltipBounds = await hoverTooltip.boundingBox();
  await page.mouse.move(850, 360);
  const geometry = await page.locator('.player-hud').evaluate((hud) => {
    const box = (el) => el.getBoundingClientRect().toJSON();
    return { globe: box(hud.querySelector('.main-orb')), hud: box(hud.querySelector('.hud-bottom')), identity: box(hud.querySelector('.hud-identity-line')) };
  });
  geometry.gems = stableGemGeometry;
  geometry.customDrawer = drawerBounds;
  geometry.hoverTooltip = tooltipBounds;
  geometry.gemPresentation = await gems.evaluateAll((elements) => elements.map((gem) => {
    const art = gem.querySelector('.resource-gem-art');
    const hit = gem.getBoundingClientRect(), artBox = art?.getBoundingClientRect();
    return {
      label: gem.getAttribute('aria-label'), kind: gem.dataset.gemKind, spellLevel: gem.dataset.gemSpellLevel ?? null,
      active: gem.classList.contains('lit'), extra: gem.classList.contains('extra'),
      artTag: art?.tagName.toLowerCase(), artPointerEvents: art ? getComputedStyle(art).pointerEvents : null,
      artBox: artBox?.toJSON(), hitBox: hit.toJSON(),
    };
  }));
  expect(geometry.gemPresentation.every((gem) => gem.artTag === 'svg')).toBe(true);
  // Read existing contexts once before capture. This describes the recording
  // environment; it is not a stress test or a gameplay performance benchmark.
  const rendering = await page.locator('.player-hud').evaluate((hud) => {
    const canvases = [...hud.querySelectorAll('.liquid-orb canvas')].map((canvas) => {
      const bounds = canvas.getBoundingClientRect();
      const gl = canvas.getContext('webgl');
      const debug = gl?.getExtension('WEBGL_debug_renderer_info');
      return {
        bitmapWidth: canvas.width, bitmapHeight: canvas.height,
        cssWidth: bounds.width, cssHeight: bounds.height,
        rendererMode: canvas.parentElement.dataset.liquidRenderer,
        webgl: gl ? {
          renderer: gl.getParameter(gl.RENDERER), vendor: gl.getParameter(gl.VENDOR),
          unmaskedRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
          unmaskedVendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null,
          version: gl.getParameter(gl.VERSION), shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
          maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
          maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
          contextAttributes: gl.getContextAttributes(),
        } : null,
      };
    });
    return {
      description: 'One read-only pre-capture context snapshot on this PC; not a benchmark or a sustained GPU load measurement.',
      userAgent: navigator.userAgent, devicePixelRatio,
      documentHidden: document.hidden, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      largestObservedCanvasSide: Math.max(0, ...canvases.flatMap((canvas) => [canvas.bitmapWidth, canvas.bitmapHeight])),
      canvases,
    };
  });
  rendering.browserVersion = await browser.version();
  const clientBuildSha256 = createHash('sha256').update(fs.readFileSync(path.join(root, 'client', 'dist', 'index.html'))).digest('hex');

  const cdp = await page.context().newCDPSession(page);
  cdp.on('Page.screencastFrame', (frame) => {
    cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {});
    if (!recording) return;
    const file = path.join(framesDir, `frame-${String(frames.length).padStart(6, '0')}.jpg`);
    frames.push({ file, timestamp: frame.metadata.timestamp });
    const job = fs.promises.writeFile(file, Buffer.from(frame.data, 'base64')).catch((error) => errors.push(error.message));
    pending.add(job);
    job.finally(() => pending.delete(job));
  });
  recording = true;
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: 2732, maxHeight: 1536, everyNthFrame: 1 });
  await expect.poll(() => frames.length).toBeGreaterThan(2);
  const elapsed = () => (Date.now() / 1000) - frames[0].timestamp;
  const snapshot = async () => ({
    at: elapsed(),
    gems: await gems.evaluateAll((elements) => elements.map((gem) => {
      const reaction = gem.querySelector('.resource-gem-reaction');
      const state = {
        label: gem.getAttribute('aria-label'), kind: gem.dataset.gemKind, spellLevel: gem.dataset.gemSpellLevel ?? null,
        active: gem.classList.contains('lit'), extra: gem.classList.contains('extra'),
        effect: gem.dataset.gemEffect, paused: gem.dataset.gemPaused, motion: gem.dataset.gemMotion,
        reactionCount: gem.querySelectorAll('.resource-gem-reaction').length,
        idleFacetFilter: getComputedStyle(gem.querySelector('.gem-lit-body')).filter,
        idleRadiance: getComputedStyle(gem.querySelector('.gem-level-radiance')).opacity,
      };
      if (!reaction) return state;
      // One bounded, read-only mid-effect snapshot. SVG screen CTMs include
      // HUD scale and the current mote animation scale, unlike authored units.
      const inspect = (element) => {
        const style = getComputedStyle(element);
        const matrix = element.getScreenCTM?.();
        const scale = matrix ? Math.hypot(matrix.a, matrix.b) : null;
        const radius = element.r?.baseVal?.value ?? null;
        return {
          className: element.getAttribute('class'), bounds: element.getBoundingClientRect().toJSON(),
          opacity: style.opacity, strokeWidth: style.strokeWidth,
          strokeDasharray: style.strokeDasharray, strokeDashoffset: style.strokeDashoffset,
          transform: style.transform, overflowX: style.overflowX, overflowY: style.overflowY,
          svgUnitToCssPixels: scale,
          strokeCssPixels: scale === null ? null : Number.parseFloat(style.strokeWidth) * scale,
          moteDiameterCssPixels: radius === null || scale === null ? null : radius * 2 * scale,
        };
      };
      const ancestors = [];
      for (let ancestor = gem; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        ancestors.push({
          tagName: ancestor.tagName, className: ancestor.getAttribute('class'),
          display: style.display, overflowX: style.overflowX, overflowY: style.overflowY,
          clipPath: style.clipPath, maskImage: style.maskImage,
        });
      }
      return { ...state, reactionPresentation: {
        svg: inspect(reaction),
        threads: [...reaction.querySelectorAll('.gem-energy-thread')].map(inspect),
        motes: [...reaction.querySelectorAll('.gem-energy-mote')].map(inspect),
        ancestors,
      } };
    })),
  });
  events.push({ at: elapsed(), label: withSpellLevels ? 'Vanec - existing resource rows, no extra slots added' : 'Faceted resource gems - normal gameplay size', kind: 'idle', state: readCounters(), response: await snapshot() });
  await page.waitForTimeout(3000);
  const hoverAt = elapsed();
  await page.getByRole('button', { name: /^Level 1:.*Adjust maximum and remaining$/ }).hover();
  await expect(page.getByRole('tooltip').filter({ hasText: 'Level 1' })).toBeVisible();
  events.push({ at: elapsed(), label: 'Hover the engraved numeral for its resource description', kind: 'hover', action: { event: 'ui:hover', sentAt: hoverAt }, state: readCounters() });
  await page.waitForTimeout(1250);
  await page.mouse.move(850, 360);
  await page.waitForTimeout(1250);
  let expectedCounters = structuredClone(originalCounters);
  const resourceActions = withSpellLevels ? [
    ...previewRestores.map(([key]) => ['spellSlots', key, 0, `Preview only - illuminate existing level ${romanLevels[Number(key.slice(1)) - 1]} slots`]),
    ...previewRestores.map(([key, counter]) => ['spellSlots', key, counter.used, `Return level ${romanLevels[Number(key.slice(1)) - 1]} to its saved remaining uses`]),
  ] : [
    ['spellSlots', spellKey, spell.used + 1, 'Spend one level-one spell slot'],
    ['spellSlots', spellKey, spell.used, 'Restore the spell slot'],
    ['resources', classKey, classPool.used + 3, 'Spend three Sorcery Points'],
    ['resources', classKey, classPool.used, 'Restore three Sorcery Points'],
  ];
  for (let actionIndex = 0; actionIndex < resourceActions.length; actionIndex++) {
    const [group, key, used, label] = resourceActions[actionIndex];
    const previous = expectedCounters[group][key].used;
    const effect = used > previous ? 'spend' : 'restore';
    const affectedGems = Math.abs(used - previous);
    const sentAt = elapsed();
    dm.emit('resource:set', { characterId: original.id, group, key, used });
    expectedCounters = structuredClone(expectedCounters);
    expectedCounters[group][key].used = used;
    await expect.poll(readCounters).toEqual(expectedCounters);
    await expect(row(key).locator('.resource-gem.lit')).toHaveCount(expectedCounters[group][key].max - used);
    await expect(row(key).locator('.resource-gem[data-gem-effect="' + effect + '"]')).toHaveCount(affectedGems);
    await expect(row(key).locator('.resource-gem-reaction')).toHaveCount(affectedGems);
    await page.waitForTimeout(Math.max(0, (sentAt + .3 - elapsed()) * 1000));
    const response = await snapshot();
    expect(await readGemGeometry(), 'Resource reaction changed hitbox/arc positions').toEqual(stableGemGeometry);
    const event = {
      at: elapsed(), kind: 'resource', label,
      action: { event: 'resource:set', group, key, used, sentAt },
      effect, affectedGems, state: readCounters(), response,
    };
    events.push(event);
    console.log(JSON.stringify({ label, action: event.action, effect, affectedGems, state: event.state }));
    // No screenshots during screencasting: only post-encoded frame extraction.
    await page.waitForTimeout(5000);
    await expect(gems.filter({ has: page.locator('.resource-gem-reaction') })).toHaveCount(0);
    if (withSpellLevels && actionIndex === previewRestores.length - 1) {
      events.push({ at: elapsed(), kind: 'comparison',
        label: `Compare existing levels ${existingSpellTiers.map(([key]) => romanLevels[Number(key.slice(1)) - 1]).join(', ')} - same sockets, stronger inner light`,
        state: readCounters(), response: await snapshot() });
      await page.waitForTimeout(5000);
    }
  }
  expect(readCounters()).toEqual(originalCounters);
  if (showOverflow) {
    const sentAt = elapsed();
    await page.locator('.resource-custom-trigger').click();
    await expect(page.getByRole('region', { name: 'Additional resource trackers', exact: true })).toBeVisible();
    events.push({ at: elapsed(), kind: 'drawer', label: 'Overflow trackers retain the same resource controls', action: { event: 'ui:custom-open', sentAt }, state: readCounters() });
    await page.waitForTimeout(3000);
    await page.getByRole('button', { name: 'Close additional resources', exact: true }).click();
    events.push({ at: elapsed(), kind: 'drawer', label: 'All demonstrated counters restored', action: { event: 'ui:custom-close', sentAt: elapsed() }, state: readCounters() });
    await page.waitForTimeout(2000);
  } else {
    events.push({ at: elapsed(), kind: 'settled', label: withCustom ? 'Custom trackers remain visible in the rack; all demonstrated counters restored' : 'All demonstrated counters restored', action: { event: 'ui:restored', sentAt: elapsed() }, state: readCounters() });
    await page.waitForTimeout(4000);
  }
  const fixtureCountersAfter = readCounters();
  const stoppedAt = elapsed();
  recording = false;
  await cdp.send('Page.stopScreencast');
  await Promise.all(pending);
  expect(errors).toEqual([]);
  expect(frames.length).toBeGreaterThan(500);
  await browser.close(); browser = null;
  dm.disconnect(); dm = null;
  fixture.close(); fixture = null;
  server.kill(); server = null;

  const durations = frames.map((frame, index) => index + 1 < frames.length ? Math.max(.001, frames[index + 1].timestamp - frame.timestamp) : 1 / 30);
  const timeline = frames.map((frame, i) => `${concatFile(frame.file)}\nduration ${durations[i].toFixed(6)}`).join('\n') + '\n' + concatFile(frames[frames.length - 1].file) + '\n';
  const manifest = path.join(scratch, 'frames.ffconcat');
  fs.writeFileSync(manifest, timeline);
  const frameInfo = JSON.parse(await run(ffprobe, ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'json', frames[0].file])).streams[0];
  // One continuous actual-time capture; no animation/time manipulation.
  const full = path.join(evidence, 'resource-gems-full-screen.mp4');
  await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', manifest, '-an', '-vf', 'fps=30', '-r', '30', '-fps_mode', 'cfr', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', full]);
  const scale = frameInfo.width / 1366;
  const cropTop = Math.min(geometry.identity.y, geometry.customDrawer?.y ?? geometry.identity.y);
  const cropRight = Math.max(geometry.hud.width, geometry.customDrawer ? geometry.customDrawer.x + geometry.customDrawer.width : 0, geometry.hoverTooltip ? geometry.hoverTooltip.x + geometry.hoverTooltip.width : 0);
  const crop = { x: 0, y: Math.max(0, Math.floor((cropTop - 24) * scale / 2) * 2), width: Math.ceil((cropRight + 20) * scale / 2) * 2 };
  crop.height = frameInfo.height - crop.y;
  const font = 'C\\:/Windows/Fonts/segoeui.ttf';
  const draw = (text, y, size, enable = '') => `drawtext=fontfile='${font}':text='${text}':x=24:y=${y}:fontsize=${size}:fontcolor=0xe9dfce${enable}`;
  const subtitles = events.map((event, i) => {
    const start = i === 0 ? 0 : (event.action?.sentAt ?? event.at);
    const end = i + 1 < events.length ? (events[i + 1].action?.sentAt ?? events[i + 1].at) : stoppedAt + 1;
    return draw(event.label, 704, 24, `:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'`);
  });
  const closeup = path.join(evidence, 'resource-gems-close-up.mp4');
  const filter = [`crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`, 'scale=1200:650:force_original_aspect_ratio=decrease:flags=lanczos', 'pad=1200:800:(ow-iw)/2:12:color=0x10151c', draw('RESOURCE GEMS - ISOLATED PREVIEW RECORDING', 752, 16), ...subtitles].join(',');
  await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', full, '-an', '-vf', filter, '-r', '30', '-fps_mode', 'cfr', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', closeup]);
  const probe = JSON.parse(await run(ffprobe, ['-v', 'error', '-show_entries', 'stream=codec_name,width,height,avg_frame_rate,nb_frames:format=duration,size', '-of', 'json', closeup]));
  const gaps = durations.slice(0, -1);
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const percentile = (fraction) => sortedGaps[Math.min(sortedGaps.length - 1, Math.floor((sortedGaps.length - 1) * fraction))];
  // Extract from the finished MP4 only. No page.screenshot calls are permitted
  // while recording, because they interrupt the compositor's frame delivery.
  const reviewSamples = [{ name: 'idle', at: 1.5, eventIndex: 0 }];
  for (let eventIndex = 1; eventIndex < events.length; eventIndex++) {
    const event = events[eventIndex];
    if (event.kind === 'resource') {
      const prefix = (event.action.group === 'spellSlots' ? 'spell' + (withSpellLevels ? '-' + event.action.key : '') : 'sorcery') + '-' + event.effect;
      for (const [offset, phase] of [[.1, 'early'], [.3, 'burst'], [.65, 'late'], [1.6, 'settled']]) {
        reviewSamples.push({ name: prefix + '-' + phase, at: event.action.sentAt + offset, eventIndex, actionOffsetSeconds: offset });
      }
    } else {
      reviewSamples.push({ name: event.kind + '-' + eventIndex, at: event.at + .5, eventIndex });
    }
  }
  reviewSamples.sort((left, right) => left.at - right.at);
  const reviewFrames = [];
  for (const sample of reviewSamples) {
    const file = path.join(evidence, `review-${sample.name}.png`);
    const fullScreenFile = path.join(evidence, `review-full-screen-${sample.name}.png`);
    await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-ss', sample.at.toFixed(3), '-i', closeup, '-frames:v', '1', '-update', '1', '-n', file]);
    await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-ss', sample.at.toFixed(3), '-i', full, '-frames:v', '1', '-update', '1', '-n', fullScreenFile]);
    reviewFrames.push({
      ...sample, file, fullScreenFile,
      expectedState: events[sample.eventIndex].state, label: events[sample.eventIndex].label,
      stateTimingNote: 'State is the authoritative aggregate counter result. Very early frames may precede a browser paint; gem reactions are cosmetic observers and never change resources.',
    });
  }
  const poster = path.join(evidence, 'video-poster.png');
  await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-ss', '1.5', '-i', closeup, '-frames:v', '1', '-update', '1', '-n', poster]);
  let sourceAfter;
  const afterConnection = new Database(sourcePath, { readonly: true });
  try {
    sourceAfter = afterConnection.prepare('SELECT id,name,cur_hp,max_hp,temp_hp,spell_slots,resources FROM characters WHERE id=?').get(original.id) ?? null;
  } finally {
    afterConnection.close();
  }
  const sourceComparison = {
    connectionMode: 'readonly', fields: ['id', 'name', 'cur_hp', 'max_hp', 'temp_hp', 'spell_slots', 'resources'],
    before: original, after: sourceAfter, unchanged: JSON.stringify(original) === JSON.stringify(sourceAfter),
    note: 'This compares the original preview character before and after recording. Concurrent user changes may differ; the recorder writes only to its disposable database.',
  };
  const receipt = {
    status: 'complete', variant: tag, character: 'Vanec',
    source: 'actual Chromium frames; read-only preview DB copied before any changes',
    appCodeChanged: false,
    appCodeChangedScope: 'The recording harness does not edit application code. The captured build may contain separately implemented refinements; clientBuildSha256 identifies that build.',
    clientBuildSha256, originalPreviewCharacter: original, sourceComparison, dataRoot: scratch,
    counterComparison: { before: originalCounters, after: fixtureCountersAfter, restored: JSON.stringify(originalCounters) === JSON.stringify(fixtureCountersAfter), seeded: false },
    demonstration: { existingSpellLevels: existingSpellTiers.map(([key]) => key), spellLevelComparison: withSpellLevels, addedRows: false, changedMaxima: false, note: 'Spell-level comparison lights existing spent slots only in a disposable copy, then restores their saved used values.' },
    recording: {
      frameInfo, frames: frames.length, actualDuration: stoppedAt, meanCaptureFps: frames.length / stoppedAt,
      longestCaptureGap: Math.max(...gaps), outputFps: 30, interpolatedMotion: false, audio: false,
      captureCadence: { medianGapSeconds: percentile(.5), p95GapSeconds: percentile(.95), p99GapSeconds: percentile(.99), note: 'CDP frame arrival cadence includes capture and IO overhead; it is not liquid-shader FPS or a gameplay/GPU benchmark.' },
    },
    framing: {
      uiScalePercent, normalUiScalePercent: 85, normalHudScale: uiScalePercent === 85,
      reviewNote: 'Judge visibility using the native-size full-screen video and review-full-screen PNGs. The separately labeled close-up is enlarged for detail, not evidence of normal-size legibility.',
      sampleTiming: 'Early samples use action.sentAt rather than the time after settled DOM assertions.',
    },
    rendering, geometry, crop, events, errors, artifacts: { full, closeup, poster, reviewFrames }, probe,
  };
  fs.writeFileSync(path.join(evidence, 'recording-receipt.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ status: receipt.status, artifacts: receipt.artifacts, recording: receipt.recording, probe }, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  recording = false;
  await Promise.all(pending);
  if (browser) await browser.close();
  if (dm) dm.disconnect();
  if (fixture) fixture.close();
  if (server) server.kill();
});
