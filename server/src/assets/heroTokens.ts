import {db} from '../db.js';
import {getCharacter} from '../sessions.js';
import type {Character} from '../../../shared/types.js';
import type {AssetJob} from '../../../shared/assetProduction.js';
import type {AssetQueue} from './queue.js';

/** Only art changes; HP, equipment, ownership and combat state are untouched. */
export function wireCharacterAssets(queue:AssetQueue) {
  const apply=(job:AssetJob,icon?:string,modelType?:string)=>{
    if(!job.sourceCharacterId)return;
    const c=getCharacter(job.sourceCharacterId);if(!c)return;
    if(icon)db.prepare('UPDATE characters SET icon=? WHERE id=?').run(icon,c.id);
    if(modelType)db.prepare('UPDATE characters SET model_type=? WHERE id=?').run(modelType,c.id);
    queue.onCharacterChange(c.sessionId);
  };
  queue.onReferenceArt=(job,url)=>apply(job,url);
  queue.onModelReady=job=>apply(job,job.tokenIcon,job.family);
  // A restart between publishing and notifying must still attach completed art.
  for(const job of queue.snapshot().jobs){
    if(!job.sourceCharacterId)continue;
    if(job.tokenIcon)apply(job,job.tokenIcon);
    if(job.state==='ready')apply(job,undefined,job.family);
  }
}
export function craftHeroToken(queue:AssetQueue,hero:Character,appearance:string,initial=false):AssetJob {
  if(typeof appearance!=='string'||!appearance.trim()||appearance.length>600)throw new Error('Describe your hero’s appearance in 1–600 characters.');
  const previous=queue.snapshot().jobs.filter(j=>j.sourceCharacterId===hero.id).at(-1);
  if(previous&&(initial||['queued','running'].includes(previous.state)))return previous;
  const job=queue.enqueueCharacter(hero,appearance.trim(),initial);
  if(!job)throw new Error('The token-crafting queue is full. Your character is saved; try crafting from the character sheet later.');
  db.prepare('UPDATE characters SET appearance=? WHERE id=?').run(appearance.trim(),hero.id);
  // Keep an existing miniature during deliberate regeneration.
  if(!hero.modelType)db.prepare('UPDATE characters SET model_type=? WHERE id=?').run(job.family,hero.id);
  queue.onCharacterChange(hero.sessionId);
  return job;
}
