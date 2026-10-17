import type {AssetJob} from '../../../shared/assetProduction.js';

/** Base diameter is 1 unit, displayed 4 ft wide for a default Medium PC.
 * 1.45 units + the .055 base gives a ~6 ft standing silhouette. This keeps
 * generated heroes below the deliberately tall Druk/Vanec sculpts. */
export function productionTargetHeight(job:Pick<AssetJob,'sourceCharacterId'|'subjectFamily'>):number {
  if(!job.sourceCharacterId)return 1.6;
  return /\b(gnome|halfling)\b/i.test(job.subjectFamily??'') ? .95 : 1.45;
}

/** Reference clarity matters more than cinematic illustration for reconstruction. */
export function referenceArtPrompt(job:AssetJob):string {
  const subject=(job.subjectFamily??job.family).replaceAll('-',' ');
  const anatomy=job.sourceCharacterId
    ? 'Follow the hero’s species, class, appearance and equipment.'
    : /^(owlbear|brown bear)$/.test(subject)
    ? `A four-legged ${subject} with animal anatomy; no clothing or weapons.`
    : 'Use natural anatomy for this creature. Only humanoid weapon users carry equipment.';
  return `Four-view orthographic reference sheet of one ${subject} fantasy character or creature for 3D reconstruction. Realistic sculpted anatomy, natural proportions and face, clearly defined solid forms and believable skin, cloth, leather and metal. Restrained surface detail, crisp focus. No cartoon, chibi, cel shading or oversized head. ${anatomy} Use this data as visual reference: ${JSON.stringify(job.artBrief??'')}. Honor the Held weapon field; stow other weapons. A simple ready stance with limbs and weapon clearly distinguishable. Exactly four equal square panels in a 2 by 2 layout: top left front, top right back, bottom left left side, bottom right right side. Same subject, scale, proportions, clothing, equipment and pose in every view. Full body including feet and weapon, centered with white margin. Soft even neutral studio lighting, minimal shadows, no dramatic highlights. Plain white background. No base, scenery, text, panel borders or magical effects.`;
}
