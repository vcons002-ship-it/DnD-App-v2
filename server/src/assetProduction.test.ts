import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AssetQueue, ProductionError } from './assets/queue.js';
import { creatureArtBrief, productionFamily, type ProducedMiniature } from '../../shared/assetProduction.js';
import { setAssetProductionListener } from './assets/hooks.js';
import { createSession, createMonsterTemplate, updateMonster, instantiateMonster } from './sessions.js';

let directory: string;
const model = (id: string): ProducedMiniature => ({ id, url: `/uploads/miniatures/${id}.glb`, baseDiameter: 1, baseCenter: [0, 0, 0], bytes: 2000000, triangles: 20764, sha256: 'test' });
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dnd-queue-test-')); });
afterEach(() => { setAssetProductionListener(undefined); fs.rmSync(directory, { recursive: true, force: true }); });
const file = () => path.join(directory, 'queue.json');

it('creates independent equipment-aware models even for known families and preserves them across restart', async () => {
  const creature = { id: 'archer', name: 'Grim', modelType: 'goblin', weapons: [{ name: 'Crossbow', kind: 'ranged' as const }],
    actions: [{ name: 'Crossbow', description: 'Ranged weapon attack.' }], abilities: [{ name: 'Armor', description: 'Wears chainmail.' }] };
  const producer = vi.fn(async (job: { family: string }) => model(job.family));
  const queue = new AssetQueue(file(), producer); queue.pause(true);
  expect(queue.enqueue(creature)).toBeUndefined();
  const job = queue.enqueue(creature, { newModel: true, notes: 'Sword sheathed.' })!;
  expect(job.family).toMatch(/^goblin-custom-/);
  expect(job.subjectFamily).toBe('goblin');
  expect(job.artBrief).toContain('Crossbow (ranged)');
  expect(job.artBrief).toContain('Wears chainmail');
  expect(job.artBrief).toContain('Sword sheathed');
  expect(queue.enqueue(creature, { newModel: true })?.id).toBe(job.id);
  creature.weapons[0].name = 'Axe';
  const resumed = new AssetQueue(file(), producer);
  expect(resumed.snapshot().jobs[0].artBrief).toBe(job.artBrief);
  resumed.start(); resumed.pause(false);
  await vi.waitFor(() => expect(resumed.snapshot().jobs[0].state).toBe('ready'));
  const next = resumed.enqueue({ ...creature, modelType: job.family }, { newModel: true })!;
  expect(next.family).not.toBe(job.family);
  expect(next.subjectFamily).toBe('goblin');
  expect(resumed.snapshot().models[0].id).toBe(job.family);
  expect(creature.modelType).toBe('goblin');
});

it('allows deliberate generation for 2D creatures but excludes objects and avoids inventing armor', () => {
  const queue = new AssetQueue(file(), vi.fn());
  expect(queue.enqueue({ id: 'c', name: 'Cultist', modelType: 'none' }, { newModel: true })).toBeTruthy();
  expect(queue.enqueue({ id: 'o', name: 'Chest', objectKind: 'chest' }, { newModel: true })).toBeUndefined();
  expect(creatureArtBrief({ name: 'Wolf', actions: [{ name: 'Bite', description: 'Natural attack' }] })).toContain('do not infer worn armor from AC');
});

it('reuses known physical families and excludes objects, 2D-only tokens and cosmetic changes', () => {
  expect(productionFamily({ name: 'Fire Skeleton 17', visualTags: ['red'] })).toBe('skeleton');
  expect(productionFamily({ name: 'Elephant [fire] 3' })).toBe('elephant');
  expect(productionFamily({ name: 'Owlbear', modelType: 'none' })).toBe('');
  const producer = vi.fn(); const queue = new AssetQueue(file(), producer);
  for (const creature of [{ name: 'Custom Skeleton' }, { name: 'Owlbear', modelType: 'none' }, { name: 'Door', objectKind: 'door' as const }]) queue.enqueue(creature);
  queue.start(); expect(queue.snapshot().jobs).toHaveLength(0); expect(producer).not.toHaveBeenCalled();
});

it('deduplicates pending and ready jobs and runs only one producer at a time', async () => {
  let finish: (result: ProducedMiniature) => void = () => {};
  const producer = vi.fn((job: { family: string }) => new Promise<ProducedMiniature>(resolve => { finish = resolve; }));
  const queue = new AssetQueue(file(), producer);
  queue.enqueue({ name: 'Elephant 1' }); queue.enqueue({ name: 'Elephant 2', modelColor: 'blue' }); queue.enqueue({ name: 'Uncatalogued test beast' });
  queue.start(); expect(producer).toHaveBeenCalledTimes(1);
  expect(queue.snapshot().jobs).toHaveLength(2);
  finish(model('elephant'));
  await vi.waitFor(() => expect(producer).toHaveBeenCalledTimes(2));
  queue.enqueue({ name: 'Elephant 3' }); expect(queue.snapshot().jobs).toHaveLength(2);
  finish(model('uncatalogued-test-beast'));
  await vi.waitFor(() => expect(queue.snapshot().models).toHaveLength(2));
});

it('persists pending jobs and pause state across server restart', async () => {
  const producer = vi.fn(async (job: { family: string }) => model(job.family));
  const first = new AssetQueue(file(), producer); first.pause(true); first.enqueue({ name: 'Elephant' });
  const resumed = new AssetQueue(file(), producer); resumed.start(); expect(producer).not.toHaveBeenCalled();
  resumed.pause(false); await vi.waitFor(() => expect(resumed.snapshot().models).toHaveLength(1));
  expect(new AssetQueue(file(), producer).snapshot().models[0].id).toBe('elephant');
});

it('holds interrupted GPU jobs for an explicit retry instead of resubmitting on boot', () => {
  fs.writeFileSync(file(), JSON.stringify({ paused: false, jobs: [{ id: 'interrupted', family: 'elephant', state: 'running', attempts: 1 }], models: [] }));
  const producer = vi.fn(); const queue = new AssetQueue(file(), producer); queue.start();
  expect(queue.snapshot().jobs[0]).toMatchObject({ state: 'failed', stage: 'Interrupted' });
  expect(queue.snapshot().paused).toBe(true); expect(producer).not.toHaveBeenCalled();
});

it('keeps failed models out of the catalog and supports a deliberate retry', async () => {
  const producer = vi.fn().mockRejectedValueOnce(new ProductionError('Start Hunyuan and retry.')).mockResolvedValue(model('elephant'));
  const messages: string[] = []; const queue = new AssetQueue(file(), producer, text => messages.push(text));
  const job = queue.enqueue({ name: 'Elephant' })!; queue.start();
  await vi.waitFor(() => expect(queue.snapshot().jobs[0].state).toBe('failed'));
  expect(queue.snapshot().models).toEqual([]);
  queue.enqueue({ name: 'Elephant', modelColor: 'red' }); expect(producer).toHaveBeenCalledTimes(1);
  expect(queue.retry(job.id)).toBe(true);
  await vi.waitFor(() => expect(queue.snapshot().jobs[0].state).toBe('ready'));
  expect(messages.join(' ')).toContain('2D token'); expect(queue.retry(job.id)).toBe(false);
});

it('pauses on uncertain worker completion and does not start the next GPU job', async () => {
  const producer = vi.fn().mockRejectedValue(new ProductionError('Worker timed out', true));
  const queue = new AssetQueue(file(), producer); queue.enqueue({ name: 'Elephant' }); queue.enqueue({ name: 'Uncatalogued test beast' }); queue.start();
  await vi.waitFor(() => expect(queue.snapshot().paused).toBe(true));
  expect(producer).toHaveBeenCalledTimes(1); expect(queue.snapshot().jobs[1].state).toBe('queued');
});

it('never publishes an invalid model or leaks raw provider errors into notices', async () => {
  const producer = vi.fn().mockResolvedValue({ ...model('elephant'), url: 'https://bad.example/model.glb' });
  const queue = new AssetQueue(file(), producer); queue.enqueue({ name: 'Elephant' }); queue.start();
  await vi.waitFor(() => expect(queue.snapshot().jobs[0].state).toBe('failed'));
  expect(queue.snapshot().models).toEqual([]); expect(queue.snapshot().jobs[0].error).not.toContain('https:');
});

it('queues creature creation, spawning and AI appearance updates, without blocking saves', () => {
  const listener = vi.fn(); setAssetProductionListener(listener);
  const session = createSession('Production test');
  const creature = createMonsterTemplate(session.id, { name: 'Elephant', maxHp: 40 });
  expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ id: creature.id }));
  updateMonster(creature.id, { modelType: 'elephant', modelColor: 'blue' });
  expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ modelType: 'elephant', modelColor: 'blue' }));
  instantiateMonster(creature.id); expect(listener).toHaveBeenCalledTimes(3);
  updateMonster(creature.id, { curHp: 20 }); expect(listener).toHaveBeenCalledTimes(3);
  setAssetProductionListener(() => { throw Error('queue disk unavailable'); });
  expect(updateMonster(creature.id, { modelType: 'mammoth' })?.modelType).toBe('mammoth');
});
