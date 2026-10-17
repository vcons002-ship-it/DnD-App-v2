import {db} from '../db.js';
import {getCharacter} from '../sessions.js';
import type {Character} from '../../../shared/types.js';
import type {AssetJob} from '../../../shared/assetProduction.js';
import type {AssetQueue} from './queue.js';
import {assetJobPending} from '../../../shared/assetProduction.js';

/** Only art changes; HP, equipment, ownership and combat state are untouched. */
export function wireCharacterAssets(queue:AssetQueue) {
  const apply=(job:AssetJob,icon?:string,modelType?:string)=>{
    if(!job.sourceCharacterId)return;
    const c=getCharacter(job.sourceCharacterId);if(!c)return;
    if(c.modelType&&c.modelType!==job.family&&c.modelType!==job.sourceModelType)return;
    if(icon){
      db.prepare('UPDATE characters SET icon=? WHERE id=?').run(icon,c.id);
      if(icon===job.tokenIcon)queue.markIconApplied(job.id);
    }
    if(modelType)db.prepare('UPDATE characters SET model_type=? WHERE id=?').run(modelType,c.id);
    queue.onCharacterChange(c.sessionId);
  };
  queue.onReferenceArt=(job,url)=>apply(job,url);
  queue.onModelReady=job=>apply(job,job.tokenIcon,job.family);
  // A restart between publishing and notifying must still attach completed art,
  // but never again once it was applied: the player may since have picked a
  // different icon. Older jobs carry no marker, so only fill an empty icon.
  for(const job of queue.snapshot().jobs){
    if(!job.sourceCharacterId)continue;
    if(job.tokenIcon&&!job.iconApplied&&job.state!=='awaiting_approval'&&!getCharacter(job.sourceCharacterId)?.icon)apply(job,job.tokenIcon);
    if(job.state==='ready')apply(job,undefined,job.family);
  }
}
/** Hero tokens call a paid image API (plus GPU time): each player may start
 *  this many per rolling 24 h. The DM is not limited. */
export const HERO_CRAFTS_PER_DAY=3;
export function craftHeroToken(queue:AssetQueue,hero:Character,appearance:string,initial=false,heldWeapon?:string,requester:{dm:boolean;playerId?:string|null}={dm:true}):AssetJob {
  if(typeof appearance!=='string'||!appearance.trim()||appearance.length>600)throw new Error('Describe your hero’s appearance in 1–600 characters.');
  if(heldWeapon!==undefined&&heldWeapon!=='Unarmed'&&!hero.weapons.some(w=>w.name===heldWeapon))throw new Error('Choose a weapon from your character sheet, or Unarmed.');
  const previous=queue.snapshot().jobs.filter(j=>j.sourceCharacterId===hero.id).at(-1);
  if(previous&&(initial||assetJobPending(previous)))return previous;
  const requestedBy=requester.dm?'dm':requester.playerId??undefined;
  if(!requester.dm){
    const since=Date.now()-24*60*60*1000;
    const recent=queue.snapshot().jobs.filter(j=>!!requestedBy&&j.requestedBy===requestedBy&&Date.parse(j.requestedAt??'')>since).length;
    if(!requestedBy||recent>=HERO_CRAFTS_PER_DAY)throw new Error(`Hero tokens can be crafted ${HERO_CRAFTS_PER_DAY} times a day per player. Ask the DM to craft another.`);
  }
  const job=queue.enqueueCharacter(hero,appearance.trim(),initial,heldWeapon,requestedBy);
  if(!job)throw new Error('The token-crafting queue is full. Your character is saved; try crafting from the character sheet later.');
  db.prepare('UPDATE characters SET appearance=? WHERE id=?').run(appearance.trim(),hero.id);
  // Keep an existing miniature during deliberate regeneration.
  if(!hero.modelType)db.prepare('UPDATE characters SET model_type=? WHERE id=?').run(job.family,hero.id);
  queue.onCharacterChange(hero.sessionId);
  return job;
}
