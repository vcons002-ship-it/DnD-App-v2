import {MeshoptSimplifier} from 'meshoptimizer/simplifier';

/** Shadow-only topology. Preserve thin/small parts and cap error at 0.75% of extent. */
export async function simplifyShadowIndices(indices:Uint32Array,positions:Float32Array,deforming=false){
  if(indices.length<3072)return indices;
  await MeshoptSimplifier.ready;
  if(!MeshoptSimplifier.supported)return indices;
  // Rigid shadows need no UV/normal seams. Deforming vertices keep their original
  // identity so differing bone weights or morph deltas cannot be welded together.
  const input=indices.slice();
  if(!deforming){const remap=MeshoptSimplifier.generatePositionRemap(positions,3);for(let i=0;i<input.length;i++)input[i]=remap[input[i]];}
  const target=Math.max(192,Math.min(24000,Math.floor(input.length*.08/3)*3));
  const [result]=MeshoptSimplifier.simplify(input,positions,3,target,.0075,['LockBorder']);
  return result.length>=3&&result.length<indices.length?result:indices;
}
