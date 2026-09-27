import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire('C:/Users/vcons/codex-work/dnd-undead-fiends/package.json');
const {NodeIO}=require('@gltf-transform/core');
const io=new NodeIO(),hash=b=>createHash('sha256').update(b).digest('hex');
const original=await io.read(path.join(root,'original-runtime.glb'));
const hand=await io.read(path.join(root,'reduced/model.glb'));
const doc=await io.read(path.join(root,'fitted-02/assembled.glb'));
const bodyTexture=original.getRoot().listTextures()[0],handTexture=hand.getRoot().listTextures()[0];
const restored=[];
for(const material of doc.getRoot().listMaterials()){
 const texture=material.getBaseColorTexture();
 if(!texture)continue;
 const src=material.getName()==='Cultist_Fanatic_Left_Hand_Skin'?handTexture:bodyTexture;
 texture.setImage(src.getImage()).setMimeType(src.getMimeType());
 restored.push({material:material.getName(),sha256:hash(src.getImage())});
}
const output=path.join(root,'fitted-02/cultist-fanatic.glb');
await io.write(output,doc);
const check=await io.read(output);
let triangles=0;
for(const mesh of check.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
 if(p.getMode()!==4||!p.getIndices())throw Error('Indexed triangles required');
 for(const v of p.getAttribute('POSITION').getArray())if(!Number.isFinite(v))throw Error('Nonfinite coordinate');
 for(const i of p.getIndices().getArray())if(i>=p.getAttribute('POSITION').getCount())throw Error('Invalid vertex index');
 triangles+=p.getIndices().getCount()/3;
}
if(triangles>40764)throw Error('Triangle budget exceeded');
const bytes=await fs.readFile(output);
for(const t of check.getRoot().listTextures())if(![hash(bodyTexture.getImage()),hash(handTexture.getImage())].includes(hash(t.getImage())))throw Error('Texture modified');
const metadata={id:'cultist-fanatic',baseDiameter:1,baseCenter:[0,0,0],bytes:bytes.length,triangles,sha256:hash(bytes),policy:'monster-reduction-v1',sourceViewCount:4,handSourceViewCount:4,handTextureViewCount:4,texturePolicy:'named-multiview-texture-v1',texture:'Two 2048x2048 JPEG95 atlases',restoredTextures:restored};
await fs.writeFile(path.join(root,'fitted-02/model.json'),JSON.stringify(metadata,null,2)+'\n');
console.log(JSON.stringify(metadata,null,2));

