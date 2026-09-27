#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from '@playwright/test';

// This runner serves only the isolated, prebuilt environment lab. It never starts
// the app server or connects to a campaign, database, or multiplayer room.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const defaultOutput = 'C:/Users/vcons/OneDrive/Desktop/Claude Work Folder/DnD-token-models/environment-courtyard-20260927/verification';
const options = { output: defaultOutput, dist: path.join(repoRoot, 'client/environment-dist'), port: 4197, mp4: true, finalizeExisting: false, trimExtra: 0 };
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--help') {
    console.log('Usage: node scripts/environment-preview/verify.mjs [output-directory] [--output directory] [--dist directory] [--port 4197] [--no-mp4] [--finalize-existing] [--trim-extra seconds]');
    process.exit(0);
  } else if (arg === '--no-mp4') options.mp4 = false;
  else if (arg === '--finalize-existing') options.finalizeExisting = true;
  else if (arg === '--trim-extra') { assert(args[i + 1], 'Missing extra trim seconds'); options.trimExtra = Number(args[++i]); }
  else if (['--output', '--dist', '--port'].includes(arg)) {
    assert(args[i + 1], `Missing value for ${arg}`);
    options[arg.slice(2)] = args[++i];
  } else if (!arg.startsWith('-') && i === 0) options.output = arg;
  else throw new Error(`Unknown argument: ${arg}`);
}
options.output = path.resolve(options.output);
options.dist = path.resolve(options.dist);
options.port = Number(options.port);
assert(Number.isInteger(options.port) && options.port > 0 && options.port < 65536, 'Invalid port');
assert(Number.isFinite(options.trimExtra) && options.trimExtra >= 0, 'Invalid extra trim duration');
assert(existsSync(path.join(options.dist, 'environment-test.html')), `Build the environment lab first: ${options.dist}/environment-test.html is missing`);
await mkdir(options.output, { recursive: true });

const origin = `http://127.0.0.1:${options.port}`;
const pageUrl = `${origin}/environment-test.html`;
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.map': 'application/json',
};
const receipt = {
  schemaVersion: 1, startedAt: new Date().toISOString(), status: 'running',
  buildRoot: options.dist, outputDirectory: options.output,
  target: { url: pageUrl, desktopViewport: { width: 1600, height: 1000 }, phoneViewport: { width: 390, height: 844 }, deviceScaleFactor: 1, expectedModels: 7 },
  checks: [], phases: [], controls: [],
  diagnostics: { pageErrors: [], consoleErrors: [], shaderWarnings: [], failedLocalRequests: [], httpErrors: [] },
  resources: { models: [], ground: [], serverTransfers: [], pendingBeforeClose: [] },
  teardownAbortedRequests: [],
  rawRequestFailures: [], completedAssetTransportWarnings: [],
  performance: {
    source: 'MiniatureLayer data-render-fps; measured renderer frame cadence when supplied by the lab',
    limitation: 'These samples describe this automated desktop Chrome session. They are not phone hardware measurements or GPU benchmark results. requestAnimationFrame is used only to settle screenshots, never to calculate FPS.',
    samples: [],
  },
};
const server = http.createServer(async (request, response) => {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405); response.end(); return;
    }
    const url = new URL(request.url, origin);
    if (url.pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    const decoded = decodeURIComponent(url.pathname);
    const filePath = path.resolve(options.dist, `.${decoded === '/' ? '/environment-test.html' : decoded}`);
    const relative = path.relative(options.dist, filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) { response.writeHead(403); response.end(); return; }
    const info = await stat(filePath);
    if (!info.isFile()) { response.writeHead(404); response.end(); return; }
    if (/\.(glb|png)$/i.test(filePath)) {
      const transfer = { pathname: url.pathname, contentLength: info.size, startedAt: new Date().toISOString() };
      receipt.resources.serverTransfers.push(transfer);
      response.once('finish', () => { transfer.finishedAt = new Date().toISOString(); transfer.fullyWritten = true; });
      response.once('close', () => { transfer.closedAt = new Date().toISOString(); transfer.transportClosedBeforeFinish = !response.writableFinished; });
    }
    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': info.size, 'Cache-Control': 'no-store',
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(filePath).on('error', () => response.destroy()).pipe(response);
  } catch (error) {
    if (!response.headersSent) response.writeHead(error.code === 'ENOENT' ? 404 : 500);
    response.end();
  }
});

let browser;
let desktopContext;
let phoneContext;
let desktopPage;
let rawVideo;
let recordingStartedAt;
let narrativeStartedAt;
let narrativeEndedAt;
const finishedGroundRequests = new Set();
const closingScopes = new Set();
const pendingRequests = new Map();

function check(name, details = {}) { receipt.checks.push({ name, passed: true, ...details }); }
function monitor(page, scope) {
  page.on('request', request => {
    if (request.url().startsWith(origin)) pendingRequests.set(request, { scope, url: request.url(), resourceType: request.resourceType(), startedAt: new Date().toISOString() });
  });
  page.on('pageerror', error => receipt.diagnostics.pageErrors.push({ scope, message: error.message }));
  page.on('console', message => {
    const entry = { scope, type: message.type(), message: message.text(), location: message.location() };
    if (message.type() === 'error') receipt.diagnostics.consoleErrors.push(entry);
    else if (/shader.*(?:error|failed)|(?:error|failed).*shader|WebGL.*(?:INVALID_|error)|VALIDATE_STATUS.*false/i.test(message.text())) receipt.diagnostics.shaderWarnings.push(entry);
  });
  page.on('requestfailed', request => {
    if (request.url().startsWith(origin)) {
      const entry = { ...pendingRequests.get(request), scope, url: request.url(), failure: request.failure()?.errorText, failedAt: new Date().toISOString(), duringTeardown: closingScopes.has(scope) };
      receipt.rawRequestFailures.push(entry);
      if (entry.duringTeardown && entry.failure === 'net::ERR_ABORTED') receipt.teardownAbortedRequests.push(entry);
      else receipt.diagnostics.failedLocalRequests.push(entry);
      pendingRequests.delete(request);
    }
  });
  page.on('response', response => {
    if (!response.url().startsWith(origin)) return;
    if (response.status() >= 400) receipt.diagnostics.httpErrors.push({ scope, url: response.url(), status: response.status() });
    const resource = { scope, url: response.url(), status: response.status(), contentType: response.headers()['content-type'] };
    if (/\.glb(?:\?|$)/i.test(response.url())) receipt.resources.models.push(resource);
    if (/courtyard\.png(?:\?|$)/i.test(response.url())) receipt.resources.ground.push(resource);
  });
  page.on('requestfinished', request => {
    if (request.url().startsWith(origin) && /courtyard\.png(?:\?|$)/i.test(request.url())) finishedGroundRequests.add(scope);
    pendingRequests.delete(request);
  });
}

async function closeContext(context, scope) {
  receipt.resources.pendingBeforeClose.push({ scope, at: new Date().toISOString(), requests: [...pendingRequests.values()].filter(request => request.scope === scope) });
  closingScopes.add(scope);
  await context.close();
}

async function twoFrames(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function ready(page, scope) {
  await page.waitForFunction(() => {
    const layer = document.querySelector('[data-testid="miniature-layer"]');
    return layer?.dataset.miniatureCount === '7' && layer?.dataset.miniatureStatus === 'ready';
  }, null, { timeout: 120_000 });
  await page.waitForFunction(() => {
    const stage = document.querySelector('[data-testid="environment-stage"]');
    const ground = document.querySelector('[data-ground-ready]');
    if (!stage) return false;
    if (ground && !['true', 'ready', '1'].includes(ground.dataset.groundReady)) return false;
    return [...document.images].every(img => img.complete && img.naturalWidth > 0);
  }, null, { timeout: 120_000 });
  assert(finishedGroundRequests.has(scope), `${scope}: courtyard.png must finish loading`);
  // Decode any CSS ground image, too: DOM image readiness does not cover CSS backgrounds.
  await page.getByTestId('environment-stage').evaluate(async stage => {
    const elements = [stage, ...stage.querySelectorAll('*')];
    const urls = new Set(elements.flatMap(element => [...getComputedStyle(element).backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(match => match[1])));
    await Promise.all([...urls].map(url => new Promise((resolve, reject) => {
      const img = new Image(); img.onload = resolve; img.onerror = () => reject(new Error(`Ground image could not decode: ${url}`)); img.src = url;
    })));
  });
  await twoFrames(page);
  const dataset = await page.getByTestId('miniature-layer').evaluate(element => ({ ...element.dataset }));
  assert.equal(dataset.miniatureCount, '7');
  assert.equal(dataset.miniatureStatus, 'ready');
  check(`${scope}: seven models and courtyard ground ready`, { dataset });
}

async function setCheckbox(page, name, checked) {
  const checkbox = page.getByRole('checkbox', { name, exact: true });
  await checkbox.setChecked(checked);
  assert.equal(await checkbox.isChecked(), checked, `${name} did not update`);
}

async function layerHas(page, name, value) {
  await page.waitForFunction(({ name, value }) => document.querySelector('[data-testid="miniature-layer"]')?.getAttribute(name) === value, { name, value });
}

async function snapshot(page, label, filename) {
  await twoFrames(page);
  const screenshot = path.join(options.output, filename);
  await page.screenshot({ path: screenshot });
  const stageScreenshot = path.join(options.output, filename.replace('.png', '-stage.png'));
  await page.getByTestId('environment-stage').screenshot({ path: stageScreenshot });
  const [dataset, stageDataset] = await Promise.all([
    page.getByTestId('miniature-layer').evaluate(element => ({ ...element.dataset })),
    page.getByTestId('environment-stage').evaluate(element => ({ ...element.dataset })),
  ]);
  const stageSha256 = createHash('sha256').update(await readFile(stageScreenshot)).digest('hex');
  const item = { label, at: new Date().toISOString(), screenshot, stageScreenshot, stageSha256, dataset, stageDataset };
  receipt.phases.push(item);
  if (dataset.renderFps !== undefined) receipt.performance.samples.push({ phase: label, value: dataset.renderFps, at: item.at });
  return item;
}

async function exerciseRange(page, name) {
  const slider = page.getByRole('slider', { name, exact: true });
  const before = await slider.inputValue();
  await slider.press('ArrowRight');
  let after = await slider.inputValue();
  let restoreKey = 'ArrowLeft';
  if (after === before) { await slider.press('ArrowLeft'); after = await slider.inputValue(); restoreKey = 'ArrowRight'; }
  assert.notEqual(after, before, `${name} does not respond to keyboard input`);
  await slider.press(restoreKey);
  assert.equal(Number(await slider.inputValue()), Number(before), `${name} did not restore its prior setting`);
  receipt.controls.push({ name, before, changed: after, restored: await slider.inputValue() });
}

async function setMistHeight(page, feet) {
  const slider=page.getByRole('slider',{name:'Mist height',exact:true});
  await slider.evaluate((input,value)=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,String(value));
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
  },feet);
  await page.waitForFunction(expected=>Math.abs(Number(document.querySelector('[data-testid="miniature-layer"]')?.dataset.mistHeight)-expected)<.001,feet*64/5);
  check('Mist height updates the rendered layer positions',{feet,mapPixels:feet*64/5});
}

async function exerciseShadowCalibration(page) {
  const direction = page.getByRole('slider', { name: 'Shadow direction', exact: true });
  const before = await direction.inputValue();
  await page.getByRole('button', { name: 'Match a painted shadow', exact: true }).click();
  const stage = await page.getByTestId('environment-stage').boundingBox();
  assert(stage && stage.width > 200 && stage.height > 200, 'Calibration requires a visible stage');
  const from = { x: stage.x + stage.width * 0.36, y: stage.y + stage.height * 0.62 };
  const to = { x: stage.x + stage.width * 0.63, y: stage.y + stage.height * 0.44 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 16 });
  await page.mouse.up();
  await page.waitForFunction(previous => {
    const slider = document.querySelector('input[aria-label="Shadow direction"]');
    return slider && Number.isFinite(Number(slider.value)) && Number(slider.value) !== Number(previous);
  }, before);
  const matched = await direction.inputValue();
  assert(Number.isFinite(Number(matched)), 'Calibration produced a non-finite shadow direction');
  assert.notEqual(Number(matched), Number(before), 'Calibration did not change the shadow direction');
  // Playwright fill() intentionally rejects input[type=range]. Use the native
  // value setter with normal input/change events so React receives the restore.
  await direction.evaluate((input, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, before);
  assert.equal(Number(await direction.inputValue()), Number(before), 'Calibration direction did not restore');
  await twoFrames(page);
  receipt.controls.push({ name: 'Match a painted shadow', before, changed: matched, restored: await direction.inputValue(), drag: { from, to } });
  check('Painted-shadow calibration drag changes a finite map direction and restores the prior setting');
}

function findExecutable(name) {
  try {
    const output = execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', [name], { encoding: 'utf8', windowsHide: true, timeout: 10_000 });
    return output.split(/\r?\n/).map(line => line.trim()).find(candidate => candidate && existsSync(candidate));
  } catch { return undefined; }
}

function reconcileCompletedAssetWarnings() {
  receipt.rawRequestFailures ??= [...receipt.diagnostics.failedLocalRequests, ...(receipt.teardownAbortedRequests ?? [])];
  receipt.completedAssetTransportWarnings ??= [];
  const tokenForAsset = url => {
    const filename = path.posix.basename(new URL(url).pathname);
    const party = /^(druk|varis|vanec)-[a-f0-9]+\.glb$/.exec(filename);
    if (party) return party[1];
    return { 'cultist-fanatic.glb': 'fanatic', 'goblin.glb': 'goblin-a', 'goblin-helmet.glb': 'goblin-b', 'wolf.glb': 'wolf' }[filename];
  };
  receipt.diagnostics.failedLocalRequests = receipt.diagnostics.failedLocalRequests.filter(entry => {
    const tokenId = tokenForAsset(entry.url);
    const renderer = entry.scope === 'desktop'
      ? receipt.phases.at(-1)?.dataset
      : receipt.checks.findLast(item => item.name === `${entry.scope}: seven models and courtyard ground ready`)?.dataset;
    const response = receipt.resources.models.find(item => item.scope === entry.scope && item.url === entry.url && item.status === 200);
    const transfer = receipt.resources.serverTransfers?.find(item => item.pathname === new URL(entry.url).pathname
      && item.fullyWritten === true && item.transportClosedBeforeFinish === false
      && Math.abs(Date.parse(item.startedAt) - Date.parse(entry.startedAt)) < 2000
      && Date.parse(item.finishedAt) <= Date.parse(entry.failedAt));
    const tokenLoaded = renderer?.miniatureCount === '7' && renderer?.miniatureStatus === 'ready' && renderer.miniatureIds?.split(',').includes(tokenId);
    if (entry.failure !== 'net::ERR_ABORTED' || !tokenId || !response || !transfer || !tokenLoaded) return true;
    receipt.completedAssetTransportWarnings.push({ ...entry,
      classification: 'Chrome reported an aborted transport after complete HTTP delivery; this exact asset subsequently parsed and appeared among the seven ready renderer tokens.',
      evidence: { tokenId, httpStatus: response.status, serverTransfer: transfer, finalRendererDataset: renderer },
    });
    return false;
  });
}

function verifyDiagnosticOutcome() {
  reconcileCompletedAssetWarnings();
  for (const [name, errors] of Object.entries(receipt.diagnostics)) assert.equal(errors.length, 0, `${name}: ${JSON.stringify(errors, null, 2)}`);
  check('All seven models loaded without JavaScript, console, shader, or HTTP errors; no unresolved asset transport failures', { completedAssetTransportWarningCount: receipt.completedAssetTransportWarnings.length });
}

async function finishVideo() {
  if (!rawVideo) return;
  const originalPath = await rawVideo.path();
  const source = path.join(options.output, 'courtyard-environment-source.webm');
  if (originalPath !== source) await rename(originalPath, source);
  receipt.video = { sourceWebm: source, viewport: receipt.target.desktopViewport };
  const ffmpeg = options.mp4 ? findExecutable('ffmpeg') : undefined;
  if (!ffmpeg) {
    receipt.video.conversion = options.mp4 ? 'ffmpeg unavailable; original WebM retained' : 'MP4 conversion disabled';
    return;
  }
  const capturedNarrativeDurationSeconds = narrativeEndedAt && narrativeStartedAt ? (narrativeEndedAt - narrativeStartedAt) / 1000 : undefined;
  const durationSeconds = capturedNarrativeDurationSeconds === undefined ? undefined : capturedNarrativeDurationSeconds - options.trimExtra;
  assert(durationSeconds === undefined || durationSeconds > 0, 'Extra trim consumes the entire narrative');
  const ffprobe = findExecutable('ffprobe');
  let sourceDurationSeconds;
  if (ffprobe) {
    const { stdout } = await promisify(execFile)(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', source], { windowsHide: true, timeout: 30_000 });
    sourceDurationSeconds = Number(JSON.parse(stdout).format?.duration);
  }
  // Chrome starts delivering frames after page/encoder startup. Align the end of
  // the recorded narrative with the actual video duration to avoid trimming those
  // startup seconds twice. The full source is retained for review in either case.
  const alignedToEnd = Number.isFinite(sourceDurationSeconds) && durationSeconds !== undefined;
  const trimStartSeconds = Math.max(0, alignedToEnd ? sourceDurationSeconds - durationSeconds : ((narrativeStartedAt ?? recordingStartedAt) - recordingStartedAt) / 1000);
  const mp4 = path.join(options.output, 'courtyard-environment-comparison.mp4');
  const conversionArgs = ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(trimStartSeconds), '-i', source];
  if (durationSeconds) conversionArgs.push('-t', String(durationSeconds));
  conversionArgs.push('-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4);
  try {
    await promisify(execFile)(ffmpeg, conversionArgs, { windowsHide: true, timeout: 300_000, maxBuffer: 8 * 1024 * 1024 });
    assert((await stat(mp4)).size > 0, 'Converted MP4 is empty');
    receipt.video = { ...receipt.video, mp4, codec: 'H.264', pixelFormat: 'yuv420p', fastStart: true, trimStartSeconds, durationSeconds, capturedNarrativeDurationSeconds, extraLeadingTrimSeconds: options.trimExtra, sourceDurationSeconds, trimMethod: alignedToEnd ? 'Actual source-video duration aligned with the final narrative interval; source WebM preserves the complete recording' : 'Approximate wall-clock alignment; source WebM preserves the complete recording', ffmpeg };
    if (ffprobe) {
      const { stdout } = await promisify(execFile)(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,pix_fmt:format=duration', '-of', 'json', mp4], { windowsHide: true, timeout: 30_000 });
      receipt.video.probe = JSON.parse(stdout);
      assert.equal(receipt.video.probe.streams[0]?.codec_name, 'h264');
      assert.equal(receipt.video.probe.streams[0]?.width, 1600);
      assert.equal(receipt.video.probe.streams[0]?.height, 1000);
    }
  } catch (error) {
    receipt.video.conversion = `MP4 conversion failed; original WebM retained: ${error.message}`;
    throw error;
  }
}

if (options.finalizeExisting) {
  const receiptPath = path.join(options.output, 'receipt.json');
  const previous = JSON.parse(await readFile(receiptPath, 'utf8'));
  assert(previous.status === 'passed' || previous.failure?.message.startsWith('failedLocalRequests:'), 'Existing capture has a failure other than the completed-asset transport observations');
  if (previous.status === 'failed') await copyFile(receiptPath, path.join(options.output, 'receipt.failed-original.json'));
  Object.assign(receipt, previous);
  receipt.originalFailure ??= previous.failure;
  verifyDiagnosticOutcome();
  rawVideo = { path: async () => previous.video.sourceWebm };
  recordingStartedAt = 0;
  narrativeStartedAt = 1;
  narrativeEndedAt = 1 + 1000 * (previous.video.capturedNarrativeDurationSeconds ?? previous.video.durationSeconds);
  await finishVideo();
  delete receipt.failure;
  receipt.status = 'passed';
  receipt.finalizedAt = new Date().toISOString();
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: receipt.status, receipt: receiptPath, completedAssetTransportWarnings: receipt.completedAssetTransportWarnings.length, video: receipt.video }, null, 2));
  process.exit(0);
}

let failure;
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, '127.0.0.1', resolve);
  });
  const chromeCandidates = [process.env.PW_CHROMIUM, process.env.CHROME_PATH,
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Google/Chrome/Application/chrome.exe'),
    process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Google/Chrome/Application/chrome.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
  ].filter(Boolean);
  const chromePath = chromeCandidates.find(candidate => existsSync(candidate));
  const recordingFfmpeg = findExecutable('ffmpeg');
  if (recordingFfmpeg) {
    // The machine's Playwright-managed encoder fails to spawn (EFTYPE). Override
    // this process's registry entry only; never replace a shared dependency file.
    const require = createRequire(import.meta.url);
    const { registry } = require('playwright-core/lib/server/registry/index');
    const encoder = registry.findExecutable('ffmpeg');
    assert(encoder, 'Playwright did not expose its recording encoder registry entry');
    const originalExecutable = encoder.executablePath();
    await promisify(execFile)(recordingFfmpeg, ['-version'], { windowsHide: true, timeout: 10_000 });
    encoder.executablePath = () => recordingFfmpeg;
    encoder.executablePathOrDie = () => recordingFfmpeg;
    receipt.videoEncoder = { executablePath: recordingFfmpeg, originalExecutable, overrideScope: 'Current verifier Node process only' };
  }
  browser = await chromium.launch({ headless: true, ...(chromePath ? { executablePath: chromePath } : { channel: 'chrome' }) });
  receipt.browser = { version: browser.version(), executablePath: chromePath ?? 'installed Chrome channel', headless: true };
  desktopContext = await browser.newContext({ viewport: receipt.target.desktopViewport, deviceScaleFactor: 1,
    recordVideo: { dir: path.join(options.output, '.playwright-video'), size: receipt.target.desktopViewport } });
  recordingStartedAt = Date.now();
  desktopPage = await desktopContext.newPage();
  rawVideo = desktopPage.video();
  monitor(desktopPage, 'desktop');
  await desktopPage.goto(pageUrl, { waitUntil: 'domcontentloaded' });
  await ready(desktopPage, 'desktop');
  for (const name of ['45° view', 'Overhead view', 'Rotate view', 'Reset view', 'Close-up']) {
    assert.equal(await desktopPage.getByRole('button', { name, exact: true }).count(), 1, `Missing or ambiguous control: ${name}`);
  }
  await setCheckbox(desktopPage, 'Show effects', true);
  await setCheckbox(desktopPage, 'Token shadows', true);
  await setCheckbox(desktopPage, 'Drifting mist', true);
  for (const name of ['Shadow direction', 'Shadow length', 'Mist strength', 'Mist height']) await exerciseRange(desktopPage, name);
  await setCheckbox(desktopPage,'Whole-map mist',false);
  await layerHas(desktopPage,'data-mist-coverage','patches');
  await setCheckbox(desktopPage,'Whole-map mist',true);
  await layerHas(desktopPage,'data-mist-coverage','map');
  await layerHas(desktopPage,'data-mist-layers','1');
  await layerHas(desktopPage,'data-mist-form','volume');
  const wispy=await desktopPage.getByRole('combobox',{name:'Atmosphere quality'}).count()>0;
  if(wispy){
    for(const [quality,scale,steps] of [['high','0.5','24'],['low','0.25','12']]){
      await desktopPage.getByRole('combobox',{name:'Atmosphere quality'}).selectOption(quality);
      await layerHas(desktopPage,'data-mist-quality',quality);
      await layerHas(desktopPage,'data-mist-scale',scale);
      await layerHas(desktopPage,'data-mist-steps',steps);
    }
    await desktopPage.getByRole('combobox',{name:'Atmosphere quality'}).selectOption('off');
    await layerHas(desktopPage,'data-mist-visible','false');
    await layerHas(desktopPage,'data-mist-shadows','false');
    await desktopPage.getByRole('combobox',{name:'Atmosphere quality'}).selectOption('auto');
    await layerHas(desktopPage,'data-mist-visible','true');
    await layerHas(desktopPage,'data-mist-obstacles','4');
    check('High/Low change mist buffer scale and sample count; Off also disables mist ground shadows');
  }
  await desktopPage.emulateMedia({reducedMotion:'reduce'});
  await setMistHeight(desktopPage,6);
  await setCheckbox(desktopPage,'Mist shadows',false);
  await layerHas(desktopPage,'data-mist-shadows','false');
  await twoFrames(desktopPage);
  const unshadedMist=await desktopPage.getByTestId('environment-stage').screenshot({path:path.join(options.output,'13-mist-shadows-off-stage.png')});
  await setCheckbox(desktopPage,'Mist shadows',true);
  await layerHas(desktopPage,'data-mist-shadows','true');
  await twoFrames(desktopPage);
  const shadedMist=await desktopPage.getByTestId('environment-stage').screenshot({path:path.join(options.output,'14-mist-shadows-on-stage.png')});
  assert.notEqual(createHash('sha256').update(unshadedMist).digest('hex'),createHash('sha256').update(shadedMist).digest('hex'),'Mist shading must change the frozen scene');
  check('Mist shadows toggle changes a frozen rendered scene independently of the mist volume');
  await setMistHeight(desktopPage,2);
  await desktopPage.emulateMedia({reducedMotion:'no-preference'});
  check('All four range controls respond and coverage switches the rendered mist');
  await exerciseShadowCalibration(desktopPage);
  await desktopPage.getByRole('button', { name: 'Close-up', exact: true }).click();
  await twoFrames(desktopPage);
  await desktopPage.getByRole('button', { name: 'Reset view', exact: true }).click();
  await desktopPage.getByRole('button', { name: '45° view', exact: true }).click();
  await setCheckbox(desktopPage, 'Token shadows', false);
  await setCheckbox(desktopPage, 'Drifting mist', false);
  await setCheckbox(desktopPage, 'Raised scenery', false);
  await setCheckbox(desktopPage, 'Show effects', false);
  await layerHas(desktopPage, 'data-environment', 'off');
  await layerHas(desktopPage, 'data-shadows', 'false');
  await ready(desktopPage, 'desktop');
  check('Effects disabled preserves the seven-token original view and ground');
  await desktopPage.getByRole('button', { name: '45° view', exact: true }).click();
  await desktopPage.waitForTimeout(750); // Let the lab's 650 ms camera transition finish before the clip begins.
  await desktopPage.mouse.move(1530, 950);
  narrativeStartedAt = Date.now();
  const original = await snapshot(desktopPage, 'Original courtyard at 45 degrees; effects disabled', '01-original-45.png');
  await desktopPage.waitForTimeout(2400); // Intentional viewing time in the comparison recording.

  await setCheckbox(desktopPage, 'Show effects', true);
  await setCheckbox(desktopPage, 'Token shadows', true);
  await layerHas(desktopPage, 'data-environment', 'on');
  await layerHas(desktopPage, 'data-shadows', 'true');
  await desktopPage.mouse.move(1530, 950);
  await desktopPage.waitForTimeout(2000);
  const shadows = await snapshot(desktopPage, 'Token shadows only at 45 degrees', '02-shadows-45.png');
  assert.notEqual(shadows.stageSha256, original.stageSha256, 'The rendered scene did not change after shadows were enabled');
  check('Shadow comparison changes scene pixels and exposes enabled renderer state');
  await desktopPage.waitForTimeout(2000);
  const moveDrukButton = desktopPage.getByRole('button', { name: 'Move Druk', exact: true });
  if (!wispy && await moveDrukButton.count()) {
    await moveDrukButton.click();
    await desktopPage.mouse.move(1530, 950);
    await desktopPage.waitForTimeout(4500);
    const moved = await snapshot(desktopPage, 'Druk moves with token shadows enabled', '02b-moving-druk-shadows.png');
    assert.notEqual(moved.stageSha256, shadows.stageSha256, 'The shadow-only scene did not change after Move Druk');
    check('Move Druk changes the shadow-only scene with all seven models retained');
    await desktopPage.waitForTimeout(1200);
  }

  await setCheckbox(desktopPage, 'Raised scenery', true);
  await setCheckbox(desktopPage, 'Drifting mist', true);
  await desktopPage.mouse.move(1530, 950);
  await desktopPage.waitForTimeout(2200);
  await snapshot(desktopPage, 'Shadows, raised scenery, and drifting mist at 45 degrees', '03-scenic-45.png');
  await desktopPage.waitForTimeout(1800);
  if(wispy){
    await moveDrukButton.click();
    await desktopPage.mouse.move(1530,950);
    await desktopPage.waitForTimeout(2100);
    const moving=await snapshot(desktopPage,'Druk parts the wisps and leaves a trailing wake','15-moving-wake.png');
    assert(Number(moving.dataset.mistWakes)>0&&Number(moving.dataset.mistWakes)<=48,'Movement must create bounded wakes');
    await desktopPage.waitForTimeout(2300);
    await snapshot(desktopPage,'The wake lingers briefly after Druk stops','16-lingering-wake.png');
    await desktopPage.waitForTimeout(6500);
    await layerHas(desktopPage,'data-mist-wakes','0');
    await snapshot(desktopPage,'The wake dissipates and the mist returns','17-refilled-wake.png');
    await setCheckbox(desktopPage,'React to movement & scenery',false);
    await layerHas(desktopPage,'data-mist-obstacles','0');
    await layerHas(desktopPage,'data-mist-interaction','false');
    await setCheckbox(desktopPage,'React to movement & scenery',true);
    await layerHas(desktopPage,'data-mist-obstacles','4');
    check('Moving token creates bounded wakes, which expire after movement; interaction toggle removes scenery deflection');
    for(const quality of ['high','low']){
      await desktopPage.getByRole('combobox',{name:'Atmosphere quality'}).selectOption(quality);
      await layerHas(desktopPage,'data-mist-quality',quality);
      await desktopPage.mouse.move(1530,950);
      await desktopPage.waitForTimeout(1700);
      await snapshot(desktopPage,`${quality} atmosphere quality with full-detail figures`,quality==='high'?'18-quality-high.png':'19-quality-low.png');
    }
    await desktopPage.getByRole('combobox',{name:'Atmosphere quality'}).selectOption('auto');
  }

  await desktopPage.getByRole('button',{name:'Reset view',exact:true}).click();
  await desktopPage.waitForTimeout(750);
  await setCheckbox(desktopPage,'Drifting mist',false);
  await layerHas(desktopPage,'data-mist-visible','false');
  await desktopPage.mouse.move(1530,950);
  await desktopPage.waitForTimeout(1400);
  await snapshot(desktopPage,'Whole map with mist switched off','08-whole-map-clear.png');
  await setMistHeight(desktopPage,2);
  await setCheckbox(desktopPage,'Drifting mist',true);
  await layerHas(desktopPage,'data-mist-visible','true');
  await desktopPage.mouse.move(1530,950);
  await desktopPage.waitForTimeout(2200);
  await snapshot(desktopPage,'Whole map with two-foot mist','09-whole-map-mist.png');
  await desktopPage.getByRole('button',{name:'Close-up',exact:true}).click();
  await desktopPage.waitForTimeout(750);
  for(const [feet,file] of [[.5,'10-mist-half-foot.png'],[6,'11-mist-six-feet.png'],[10,'12-mist-ten-feet.png']]){
    await setMistHeight(desktopPage,feet);
    await desktopPage.mouse.move(1530,950);
    await desktopPage.waitForTimeout(1900);
    await snapshot(desktopPage,`Mist reaching ${feet} feet above the ground`,file);
  }
  await setMistHeight(desktopPage,2);

  await desktopPage.getByRole('button', { name: 'Overhead view', exact: true }).click();
  await desktopPage.mouse.move(1530, 950);
  await desktopPage.waitForTimeout(1800);
  await snapshot(desktopPage, 'Enhanced overhead view', '04-scenic-overhead.png');
  await desktopPage.waitForTimeout(1800);

  await desktopPage.getByRole('button', { name: '45° view', exact: true }).click();
  await layerHas(desktopPage, 'data-tilt-degrees', '45');
  const directionBeforeOrbit = await desktopPage.getByRole('slider', { name: 'Shadow direction', exact: true }).inputValue();
  const rotateButton = desktopPage.getByRole('button', { name: 'Rotate view', exact: true });
  await rotateButton.click();
  await desktopPage.mouse.move(1530, 950);
  await desktopPage.waitForTimeout(3000);
  const rotationStart = await snapshot(desktopPage, 'Enhanced 45-degree view during smooth rotation', '05-scenic-rotation.png');
  await desktopPage.waitForTimeout(3500);
  const rotationEnd = await desktopPage.getByTestId('environment-stage').screenshot();
  assert.notEqual(createHash('sha256').update(rotationEnd).digest('hex'), rotationStart.stageSha256, 'The scene did not change during rotation');
  const finalRotation = await desktopPage.getByTestId('environment-stage').getAttribute('data-view-rotation');
  assert(Number.isFinite(Number(rotationStart.stageDataset.viewRotation)) && Number.isFinite(Number(finalRotation)), 'Camera rotation diagnostics are missing');
  assert(Math.abs(Number(finalRotation) - Number(rotationStart.stageDataset.viewRotation)) > 1, 'The camera did not rotate during the orbit sequence');
  check('Smooth orbit changes the measured camera rotation', { before: Number(rotationStart.stageDataset.viewRotation), after: Number(finalRotation) });
  const directionAfterOrbit = await desktopPage.getByRole('slider', { name: 'Shadow direction', exact: true }).inputValue();
  assert.equal(Number(directionAfterOrbit), Number(directionBeforeOrbit), 'Camera orbit changed the map-space shadow direction');
  check('Map-space shadow direction stays unchanged while the camera rotates', { before: Number(directionBeforeOrbit), after: Number(directionAfterOrbit) });
  const stopButton = desktopPage.getByRole('button', { name: /^(Rotate view|Stop rotation|Stop rotating|Stop view)$/ });
  assert.equal(await stopButton.count(), 1, 'Cannot uniquely identify the rotation toggle');
  await stopButton.click();
  await desktopPage.getByRole('button', { name: 'Reset view', exact: true }).click();
  await desktopPage.getByRole('button', { name: '45° view', exact: true }).click();
  await desktopPage.mouse.move(1530, 950);
  await desktopPage.waitForTimeout(1800);
  await snapshot(desktopPage, 'Final scenic view', '06-final-scenic.png');
  await desktopPage.waitForTimeout(1800);
  narrativeEndedAt = Date.now();
  check('Overhead, close-up, reset, and smooth rotation controls exercised');
  await closeContext(desktopContext, 'desktop');
  desktopContext = undefined;

  phoneContext = await browser.newContext({ viewport: receipt.target.phoneViewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const phonePage = await phoneContext.newPage();
  monitor(phonePage, 'phone-viewport');
  await phonePage.goto(pageUrl, { waitUntil: 'domcontentloaded' });
  await ready(phonePage, 'phone-viewport');
  const overflow = await phonePage.evaluate(() => ({
    viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth, horizontalScroll: scrollX,
  }));
  assert(overflow.documentWidth <= overflow.viewportWidth + 1 && overflow.bodyWidth <= overflow.viewportWidth + 1, `Phone viewport overflows horizontally: ${JSON.stringify(overflow)}`);
  await phonePage.screenshot({ path: path.join(options.output, '07-phone-390x844.png'), fullPage: true });
  receipt.phone = { viewport: receipt.target.phoneViewport, screenshot: path.join(options.output, '07-phone-390x844.png'), overflow, note: 'Responsive layout verification in desktop Chrome emulation, not physical phone performance.' };
  check('390x844 phone viewport loads all seven models without horizontal overflow', overflow);
  await closeContext(phoneContext, 'phone-viewport');
  phoneContext = undefined;
  verifyDiagnosticOutcome();
  receipt.status = 'passed';
} catch (error) {
  failure = error;
  receipt.status = 'failed';
  receipt.failure = { message: error.message, stack: error.stack };
  if (desktopPage && !desktopPage.isClosed()) {
    try { await desktopPage.screenshot({ path: path.join(options.output, 'failure.png') }); } catch { /* Keep the original failure. */ }
  }
} finally {
  for (const [context, scope] of [[desktopContext, 'desktop'], [phoneContext, 'phone-viewport']]) if (context) await closeContext(context, scope).catch(() => {});
  try { await finishVideo(); } catch (error) { failure ??= error; receipt.status = 'failed'; receipt.failure ??= { message: error.message }; }
  if (browser) await browser.close().catch(() => {});
  await new Promise(resolve => server.close(resolve));
  receipt.finishedAt = new Date().toISOString();
  const receiptPath = path.join(options.output, 'receipt.json');
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: receipt.status, receipt: receiptPath, screenshots: receipt.phases.map(phase => phase.screenshot), video: receipt.video, error: failure?.message }, null, 2));
}
if (failure) process.exitCode = 1;
