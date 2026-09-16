// Actual browser frames and real damage events, in a disposable preview copy.
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
const refined = process.argv.includes('--refined');
const requestedTag = process.argv.find((argument) => argument.startsWith('--tag='))?.slice(6);
const tag = requestedTag ?? (refined ? 'refined' : '');
if (tag && !/^[a-z0-9][a-z0-9-]{0,47}$/.test(tag)) throw new Error('Recording tag must contain only lowercase letters, digits and hyphens (48 characters maximum)');
const requestedUiScale = process.argv.find((argument) => argument.startsWith('--ui-scale='))?.slice(11);
// The reaction review must prove visibility at the application's normal size,
// not only in the enlarged post-processed crop. Older comparison takes retain
// their 115% framing unless explicitly overridden.
const uiScalePercent = Number(requestedUiScale ?? (tag.startsWith('visible-reactions') ? 85 : 115));
if (!Number.isInteger(uiScalePercent) || uiScalePercent < 70 || uiScalePercent > 115 || uiScalePercent % 5 !== 0) throw new Error('UI scale must be a multiple of 5 from 70 to 115');
const evidence = path.join(root, 'preview-evidence', `orb-motion${tag ? `-${tag}` : ''}-2026-09-16`);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dnd-orb-video-'));
const framesDir = path.join(scratch, 'frames');
const port = 4282;
const base = `http://127.0.0.1:${port}`;
const secret = 'isolated-orb-recording';
const ffmpeg = process.env.ORB_FFMPEG || 'ffmpeg';
const ffprobe = process.env.ORB_FFPROBE || 'ffprobe';
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
  // subsequent take its own --tag=refined-pass2 rather than overwriting it.
  for (const file of ['recording-receipt.json', 'orb-effects-full-screen.mp4', 'orb-effects-close-up.mp4']) {
    if (fs.existsSync(path.join(evidence, file))) throw new Error(`Recording already exists: ${path.join(evidence, file)}. Choose a new --tag=...`);
  }
  fs.mkdirSync(evidence, { recursive: true });
  fs.mkdirSync(framesDir);
  const sourcePath = path.join(root, '.preview-review', 'game.db');
  const source = new Database(sourcePath, { readonly: true });
  const session = source.prepare('SELECT id, code FROM sessions ORDER BY last_played_at DESC LIMIT 1').get();
  const original = source.prepare('SELECT id,name,cur_hp,max_hp,temp_hp FROM characters WHERE session_id=? AND name=?').get(session.id, 'Vanec');
  if (!original) throw new Error('Expected preview sorcerer Vanec was not found');
  await source.backup(path.join(scratch, 'game.db'));
  source.close();
  fs.cpSync(path.join(root, '.preview-review', 'uploads'), path.join(scratch, 'uploads'), { recursive: true });
  fixture = new Database(path.join(scratch, 'game.db'));
  fixture.exec('UPDATE characters SET claimed_by=NULL');
  // Establish a clear demonstration starting point only in the new copy.
  fixture.prepare('UPDATE characters SET cur_hp=32,max_hp=47,temp_hp=12 WHERE id=?').run(original.id);
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
  const orb = page.locator('.main-orb .liquid-orb');
  await expect(orb).toHaveAttribute('data-liquid-renderer', 'webgl');
  await expect(orb).toHaveAttribute('data-liquid-motion', 'animated');
  expect(await page.evaluate(() => document.hidden)).toBe(false);
  await expect(page.locator('.orb-temp-bonus')).toHaveText('+12');
  const geometry = await page.locator('.player-hud').evaluate((hud) => {
    const box = (el) => el.getBoundingClientRect().toJSON();
    return { globe: box(hud.querySelector('.main-orb')), hud: box(hud.querySelector('.hud-bottom')), identity: box(hud.querySelector('.hud-identity-line')) };
  });
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
  const readState = () => fixture.prepare('SELECT cur_hp,max_hp,temp_hp FROM characters WHERE id=?').get(original.id);
  const mark = async (label, expected, action = null) => {
    const state = readState();
    expect(state).toEqual(expected);
    await expect(page.locator('.orb-readout > strong')).toHaveText(String(expected.cur_hp));
    const priorState = events.at(-1)?.state;
    const expectedShieldReaction = action?.amount > 0 && priorState?.temp_hp > 0
      ? (expected.temp_hp > 0 ? 'hit' : 'breaking') : null;
    if (expectedShieldReaction) {
      await expect(page.locator('.orb-temp-shield')).toHaveAttribute('data-shield-effect', expectedShieldReaction);
      await expect(page.locator('.orb-ward-impact')).toHaveCount(1);
    }
    // Capture attributes, not pixels, while a hit/break is still alive. This
    // normally follows the ~100ms database poll and never pauses screencasting.
    const response = {
      at: elapsed(),
      expectedShieldReaction,
      ...await page.locator('.health-reliquary').evaluate((health) => ({
        liquidEffect: health.querySelector('.liquid-orb')?.dataset.liquidEffect ?? null,
        shieldEffect: health.querySelector('.orb-temp-shield')?.dataset.shieldEffect ?? null,
        shieldImpactCount: health.querySelectorAll('.orb-ward-impact').length,
        temporaryHpReadout: health.querySelector('.orb-temp-bonus')?.textContent ?? null,
      })),
    };
    await expect(page.locator('.orb-temp-shield')).toHaveCount(expected.temp_hp > 0 ? 1 : 0);
    await expect(page.locator('.orb-temp-bonus')).toHaveCount(expected.temp_hp > 0 ? 1 : 0);
    if (expected.temp_hp) await expect(page.locator('.orb-temp-bonus')).toHaveText(`+${expected.temp_hp}`);
    const entry = { at: elapsed(), label, action, response, state, shield: expected.temp_hp > 0, effect: await orb.getAttribute('data-liquid-effect') };
    events.push(entry);
    console.log(JSON.stringify(entry));
  };
  await mark('Liquid + magical barrier', { cur_hp: 32, max_hp: 47, temp_hp: 12 });
  await page.waitForTimeout(7000);
  for (const [amount, cur_hp, temp_hp, label, hold] of [
    [5, 32, 7, '5 damage - barrier absorbs it', 6000],
    [7, 32, 0, '7 damage - barrier exhausted', 6000],
    [12, 20, 0, '12 damage - health falls', 6000],
    [10, 10, 0, '10 damage - low health', 6000],
    [-12, 22, 0, 'Heal 12 - liquid rises', 6000],
    [-25, 47, 0, 'Heal 25 - full health', 7000],
  ]) {
    const sentAt = elapsed();
    dm.emit('damage:apply', { kind: 'pc', refId: original.id, amount });
    await expect.poll(readState).toEqual({ cur_hp, max_hp: 47, temp_hp });
    await mark(label, { cur_hp, max_hp: 47, temp_hp }, { event: 'damage:apply', amount, sentAt });
    const expectedEffect = amount < 0 ? 'healing' : cur_hp < events[events.length - 2].state.cur_hp ? 'damage' : 'idle';
    await expect(orb).toHaveAttribute('data-liquid-effect', expectedEffect);
    // Never take still screenshots during capture: they stall Chromium's
    // screencast compositor and would hide part of the 1.8-second HP impulse.
    await page.waitForTimeout(hold);
  }
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
  const full = path.join(evidence, 'orb-effects-full-screen.mp4');
  await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', manifest, '-an', '-vf', 'fps=30', '-r', '30', '-fps_mode', 'cfr', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', full]);
  const scale = frameInfo.width / 1366;
  const crop = { x: 0, y: Math.max(0, Math.floor((geometry.identity.y - 24) * scale / 2) * 2), width: Math.ceil((geometry.hud.width + 20) * scale / 2) * 2 };
  crop.height = frameInfo.height - crop.y;
  const font = 'C\\:/Windows/Fonts/segoeui.ttf';
  const draw = (text, y, size, enable = '') => `drawtext=fontfile='${font}':text='${text}':x=24:y=${y}:fontsize=${size}:fontcolor=0xe9dfce${enable}`;
  const subtitles = events.map((event, i) => {
    const start = i === 0 ? 0 : event.action.sentAt;
    const end = i + 1 < events.length ? events[i + 1].action.sentAt : stoppedAt + 1;
    return draw(event.label, 704, 24, `:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'`);
  });
  const closeup = path.join(evidence, 'orb-effects-close-up.mp4');
  const filter = [`crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`, 'scale=1200:650:force_original_aspect_ratio=decrease:flags=lanczos', 'pad=1200:800:(ow-iw)/2:12:color=0x10151c', draw('ORB EFFECTS - ISOLATED PREVIEW RECORDING', 752, 16), ...subtitles].join(',');
  await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', full, '-an', '-vf', filter, '-r', '30', '-fps_mode', 'cfr', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', closeup]);
  const probe = JSON.parse(await run(ffprobe, ['-v', 'error', '-show_entries', 'stream=codec_name,width,height,avg_frame_rate,nb_frames:format=duration,size', '-of', 'json', closeup]));
  const gaps = durations.slice(0, -1);
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const percentile = (fraction) => sortedGaps[Math.min(sortedGaps.length - 1, Math.floor((sortedGaps.length - 1) * fraction))];
  // Extract from the finished MP4 only. No page.screenshot calls are permitted
  // while recording, because they interrupt the compositor's frame delivery.
  const afterAction = (name, eventIndex, offset) => ({
    name, eventIndex, actionOffsetSeconds: offset,
    // `event.at` can be ~650ms late while awaiting shield-break removal. The
    // actual socket-send timestamp is the stable origin for transient frames.
    at: events[eventIndex].action.sentAt + offset,
  });
  const reviewSamples = [{ name: 'idle', at: 3, eventIndex: 0 }];
  for (const [eventIndex, name] of [[1, 'temp-hit'], [2, 'temp-break']]) {
    for (const [offset, phase] of [[.1, 'early'], [.25, 'impact'], [.5, 'late']]) {
      reviewSamples.push(afterAction(`${name}-${phase}`, eventIndex, offset));
    }
  }
  for (const [eventIndex, name] of [[3, 'damage'], [4, 'low-health'], [5, 'healing'], [6, 'full-health']]) {
    for (const [offset, phase] of [[.1, 'early'], [.25, 'impact'], [.5, 'rolling'], [.8, 'mid-effect']]) {
      reviewSamples.push(afterAction(`${name}-${phase}`, eventIndex, offset));
    }
  }
  reviewSamples.push(
    afterAction('temp-seven', 1, 1.5),
    afterAction('shield-depleted', 2, 1.5),
    afterAction('damage-settled', 3, 2.5),
    afterAction('low-health-settled', 4, 2.5),
    afterAction('healing-settled', 5, 2.5),
    afterAction('full-health-settled', 6, 3),
  );
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
      stateTimingNote: 'State is the authoritative result of the action. Very early frames may precede a browser paint; transient shield visuals can outlive zero temporary HP.',
    });
  }
  const poster = path.join(evidence, 'video-poster.png');
  await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-ss', '3', '-i', closeup, '-frames:v', '1', '-update', '1', '-n', poster]);
  let sourceAfter;
  const afterConnection = new Database(sourcePath, { readonly: true });
  try {
    sourceAfter = afterConnection.prepare('SELECT id,name,cur_hp,max_hp,temp_hp FROM characters WHERE id=?').get(original.id) ?? null;
  } finally {
    afterConnection.close();
  }
  const sourceComparison = {
    connectionMode: 'readonly', fields: ['id', 'name', 'cur_hp', 'max_hp', 'temp_hp'],
    before: original, after: sourceAfter, unchanged: JSON.stringify(original) === JSON.stringify(sourceAfter),
    note: 'This compares the original preview character before and after recording. Concurrent user changes may differ; the recorder writes only to its disposable database.',
  };
  const receipt = {
    status: 'complete', variant: tag || 'original', character: 'Vanec',
    source: 'actual Chromium frames; read-only preview DB copied before any changes',
    appCodeChanged: false,
    appCodeChangedScope: 'The recording harness does not edit application code. The captured build may contain separately implemented refinements; clientBuildSha256 identifies that build.',
    clientBuildSha256, originalPreviewHp: original, sourceComparison, dataRoot: scratch,
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
