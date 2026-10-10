import fs from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
const input=path.resolve(process.argv[2]),out=path.join(input,'review');
await fs.mkdir(out,{recursive:true});
const candidates=JSON.parse(await fs.readFile(path.join(input,'comparison.json'),'utf8'));
const manifest=JSON.parse(await fs.readFile('client/public/miniatures/manifest.json','utf8'));
const originals=[];
for(const m of manifest.models){
 const filename=path.basename(m.url);await fs.copyFile('client/public'+m.url,path.join(out,filename));
 const original={...m,filename};
 if(m.baseTextureUrl){original.baseTextureUrl=path.basename(m.baseTextureUrl);await fs.copyFile('client/public'+m.baseTextureUrl,path.join(out,original.baseTextureUrl));}
 originals.push(original);
}
for(const m of candidates){await fs.copyFile(path.join(input,m.filename),path.join(out,m.filename));if(m.baseTextureUrl)m.baseTextureUrl=path.basename(m.baseTextureUrl);}
await fs.writeFile(path.join(out,'viewer-data.json'),JSON.stringify({originals,candidates},null,2));
await build({entryPoints:['scripts/token-assets/character-reduction-viewer.js'],outfile:path.join(out,'viewer.js'),bundle:true,minify:true,format:'esm',target:'es2022'});
await fs.writeFile(path.join(out,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lighter character model comparison</title><style>*{box-sizing:border-box}body{margin:0;background:#11171e;color:#eee6d7;font:16px/1.5 system-ui}main{max-width:1250px;margin:auto;padding:18px}h1{font:500 30px Georgia;color:#e5c88e}select,button{font:inherit;padding:9px;background:#252c36;color:#fff;border:1px solid #7a6b4e;border-radius:5px}nav{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.views{display:grid;grid-template-columns:1fr 1fr;gap:12px}.viewport{height: min(65vh,650px);min-height:300px;touch-action:none}.viewport canvas{display:block;width:100%;height:100%}.info{font-weight:600;color:#e5c88e;min-height:48px}.note{color:#b4bdc8;font-size:14px}a{color:#e5c88e}@media(max-width:650px){main{padding:12px}.views{gap:6px}.viewport{height:48vh}h1{font-size:25px}.info{font-size:13px}}</style><main><h1>Lighter character models</h1><p>Compare the original and a lighter copy under identical lighting. The copies preserve all original texture files, materials, placement and animation channels.</p><nav><label>Character <select id="character"><option value="druk">Druk</option><option value="varis">Varis</option><option value="vanec">Vanec</option></select></label><label>Reduction <select id="profile"><option value="light">Lighter</option><option value="balanced">Conservative</option></select></label></nav><nav><button data-angle="front">Front</button><button data-angle="tilt">45°</button><button data-angle="overhead">Overhead</button><button data-angle="back">Back</button><button data-angle="face">Face close-up</button></nav><div class="views"><section><div id="left-info" class="info">Original</div><div class="viewport"></div></section><section><div id="right-info" class="info">Lighter copy</div><div class="viewport"></div></section></div><p id="status">Loading…</p><p class="note">Review copies only; the live game still uses the originals. Geometry reduction is lossy even though the textures are unchanged. This viewer uses simple studio lighting and no battlefield effects. Both full and lighter models are downloaded for comparison.</p></main><script type="module" src="viewer.js"></script></html>`);
console.log(out);
