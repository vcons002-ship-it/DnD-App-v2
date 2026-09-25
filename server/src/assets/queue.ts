import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { MONSTER_MODEL_TYPES } from '../../../shared/monsterAppearance.js';
import { creatureArtBrief, productionFamily, type AssetCreature, type AssetJob, type ProducedMiniature } from '../../../shared/assetProduction.js';

type State = { paused: boolean; jobs: AssetJob[]; models: ProducedMiniature[] };
type Producer = (job: AssetJob, progress: (stage: string) => void) => Promise<ProducedMiniature>;

/** Durable, deduplicated queue. No timers or GPU jobs run until explicitly started. */
export class AssetQueue {
  private state: State;
  private active = false;
  private started = false;
  constructor(private file: string, private produce: Producer, private notice: (message: string) => void = () => {}) {
    this.state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { paused: false, jobs: [], models: [] };
    for (const job of this.state.jobs) if (job.state === 'running') {
      // Do not submit a second expensive GPU job after an uncertain interruption.
      job.state = 'failed'; job.stage = 'Interrupted'; job.error = 'Server restarted during production. Check the 3D worker, then retry.';
      this.state.paused = true;
    }
  }
  private save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(`${this.file}.tmp`, JSON.stringify(this.state, null, 2));
    fs.renameSync(`${this.file}.tmp`, this.file);
  }
  private announce(message: string) { try { this.notice(message); } catch { /* notices cannot break persistence */ } }
  start() { this.started = true; this.save(); void this.drain(); }
  snapshot(): State { return structuredClone(this.state); }
  enqueue(creature: AssetCreature, options?: { newModel: boolean; notes?: string }): AssetJob | undefined {
    if (creature.objectKind) return;
    const previousSubject = this.state.jobs.find(j => j.family === creature.modelType)?.subjectFamily;
    const subjectFamily = productionFamily(options?.newModel ? { ...creature, modelType: previousSubject ?? (creature.modelType === 'none' ? '' : creature.modelType) } : creature);
    if (!subjectFamily) return;
    if (options?.newModel && !creature.id) return;
    const pending = options?.newModel && this.state.jobs.find(j => j.sourceMonsterId === creature.id && ['queued', 'running'].includes(j.state));
    if (pending) return { ...pending };
    const family = options?.newModel ? `${subjectFamily.slice(0, 30)}-custom-${randomUUID().slice(0, 8)}` : subjectFamily;
    if (!options?.newModel && (MONSTER_MODEL_TYPES.includes(family as typeof MONSTER_MODEL_TYPES[number]) || this.state.models.some(m => m.id === family))) return;
    const existing = this.state.jobs.find(j => j.family === family);
    if (existing) return { ...existing };
    // Bound accidental bulk imports without evicting useful completed records.
    if (this.state.jobs.filter(j => j.state !== 'ready').length >= 100) return;
    const job: AssetJob = { id: randomUUID(), family, subjectFamily, artBrief: creatureArtBrief(creature, options?.notes), sourceMonsterId: options?.newModel ? creature.id : undefined, state: 'queued', stage: 'Waiting', attempts: 0, updatedAt: new Date().toISOString() };
    this.state.jobs.push(job); this.save(); this.announce(`3D ${family}: queued. The 2D token remains available.`);
    void this.drain(); return { ...job };
  }
  pause(paused: boolean) { this.state.paused = paused; this.save(); if (!paused) void this.drain(); }
  retry(id: string): boolean {
    const job = this.state.jobs.find(j => j.id === id);
    if (!job || job.state !== 'failed') return false;
    job.state = 'queued'; job.stage = 'Waiting'; delete job.error;
    this.save(); void this.drain(); return true;
  }
  private async drain() {
    if (!this.started || this.active || this.state.paused) return;
    this.active = true;
    try {
      while (!this.state.paused) {
        const job = this.state.jobs.find(j => j.state === 'queued');
        if (!job) break;
        job.state = 'running'; job.attempts++; job.updatedAt = new Date().toISOString(); this.save();
        try {
          const model = await this.produce({ ...job }, stage => {
            job.stage = stage; job.updatedAt = new Date().toISOString(); this.save();
            this.announce(`3D ${job.family}: ${stage}.`);
          });
          if (model.id !== job.family || !model.url.startsWith('/uploads/miniatures/') || !(model.bytes > 0) || !(model.triangles > 0)) throw Error('Model publication validation failed.');
          this.state.models = [...this.state.models.filter(m => m.id !== model.id), model];
          job.state = 'ready'; job.stage = 'Ready'; delete job.error;
          this.announce(`3D ${job.family}: ready. Matching tokens will load the model automatically.`);
        } catch (error) {
          job.state = 'failed'; job.stage = 'Needs attention';
          // Producers emit only deliberately safe messages (logs retain raw tool output).
          job.error = error instanceof ProductionError ? error.message : 'Production failed. Check the worker log, then retry from token info.';
          if (error instanceof ProductionError && error.pauseQueue) this.state.paused = true;
          this.announce(`3D ${job.family}: ${job.error} The 2D token is unchanged.`);
        }
        job.updatedAt = new Date().toISOString(); this.save();
      }
    } finally { this.active = false; }
  }
}
export class ProductionError extends Error {
  constructor(message: string, readonly pauseQueue = false) { super(message); }
}
