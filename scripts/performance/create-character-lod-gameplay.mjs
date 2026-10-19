import fs from 'node:fs';
import assert from 'node:assert/strict';
const output=process.env.LOD_BENCH_RESULTS||'tmp/character-lod-benchmark';fs.mkdirSync(output,{recursive:true});assert(process.env.LOD_BENCH_SECRET,'Set LOD_BENCH_SECRET for an isolated preview server');
import {io} from 'socket.io-client';
const base=process.env.LOD_BENCH_SERVER||'http://127.0.0.1:4374',secret=process.env.LOD_BENCH_SECRET,headers={'x-dm-passphrase':secret,'Content-Type':'application/json'};
const {code}=await(await fetch(base+'/api/sessions',{method:'POST',headers,body:JSON.stringify({name:'Model detail performance test'})})).json();
const admin=io(base,{transports:['websocket'],forceNew:true});
const snap=async()=>{const r=await admin.timeout(10000).emitWithAck('join',{sessionCode:code,role:'dm',dmPassphrase:secret});if(!r.ok)throw Error(JSON.stringify(r));return r.snapshot;};
try{
 const s=await snap(),catalog=(await(await fetch(base+'/api/spells/all')).json()).results;
 const chars={};
 const form=new FormData();form.append('name','Courtyard - dense mist');form.append('image',new Blob([fs.readFileSync('assets/environment-preview/courtyard.png')],{type:'image/png'}),'courtyard.png');
 const map=await(await fetch(base+`/api/sessions/${code}/maps`,{method:'POST',headers:{'x-dm-passphrase':secret},body:form})).json();
 admin.emit('map:setActive',{mapId:map.id});admin.emit('map:setGrid',{mapId:map.id,gridSizePx:50,feetPerSquare:5,widthFt:140,locked:false});
 for(const layer of ['map','tokens']){admin.emit('fog:setLayer',{mapId:map.id,layer,enabled:false});admin.emit('fog:setVision',{mapId:map.id,layer,enabled:true});}
 for(const [i,name]of ['Druk','Varis','Vanec'].entries()){
  const c=s.characters.find(c=>c.name===name);chars[name]=c.id;
  admin.emit('character:update',{characterId:c.id,className:name==='Druk'?'Fighter':name==='Varis'?'Ranger':'Sorcerer',race:name==='Druk'?'Half-Orc':name==='Varis'?'Half-Elf':'Tiefling',level:9,maxHp:100,curHp:100,armorClass:17,stats:{STR:18,DEX:18,CON:16,INT:12,WIS:16,CHA:20},weapons:[{name:'Staff',kind:'melee',damage:'1d6',damageType:'bludgeoning',attackBonus:8}],sheetAbilities:name==='Vanec'?catalog.filter(a=>['Fireball','Thunderwave','Lightning Bolt','Burning Hands','Ice Storm','Cone of Cold'].includes(a.name)).map(a=>({...a,id:a.name.toLowerCase().replaceAll(' ','-'),source:'srd'})):[],spellSlots:{L1:{max:10,used:0},L3:{max:10,used:0},L4:{max:10,used:0},L5:{max:10,used:0}}});
  admin.emit('token:spawn',{mapId:map.id,kind:'pc',refId:c.id,x:500+i*120,y:750});
 }
 for(const [i,model]of ['goblin','skeleton','wolf'].entries()){
  admin.emit('monster:create',{name:['Goblin','Skeleton','Wolf'][i],modelType:model,maxHp:500,armorClass:12,disposition:'enemy',stats:{STR:12,DEX:12,CON:12},weapons:[{name:'Attack',kind:'melee',damage:'1d6',damageType:'slashing',attackBonus:4}]});
  const t=(await snap()).monsterTemplates.find(t=>t.modelType===model);
  for(let j=0;j<9;j++)admin.emit('token:spawn',{mapId:map.id,kind:'monster',refId:t.id,x:380+(j%9)*85,y:360+i*110});
 }
 for(let i=0;i<23;i++){
  const x=80+(i%8)*155,y=i<8?90:i<16?900:180+(i-16)*100;
  admin.emit('map:editWalls',{mapId:map.id,add:{id:'wall-'+i,kind:'rectangle',ax:x,ay:y,bx:x+70,by:y+12}});
 }
 const lights=Array.from({length:6},(_,i)=>({id:'placed-'+i,x:250+(i%3)*420,y:230+Math.floor(i/3)*460,radiusFt:25,heightFt:9,color:i%2?'#98b7ee':'#ffcf8a',intensity:1,flicker:true,visibleTorch:true}));
 admin.emit('map:setEnvironment',{mapId:map.id,settings:{enabled:true,lighting:'dungeon',lightLevel:.65,heavyDarkness:true,mist:true,mistOpacity:.65,mistHeightFt:8,mistInteraction:true,mistShadows:true,shadows:true,mapShadows:false,weather:'rain',weatherIntensity:.35,particles:'embers',particleIntensity:.3,windStrength:.4,lights}});
 admin.emit('session:setHideDmRolls',{hide:false});admin.emit('session:setManualDamage',{manual:true});
 let ready=await snap();for(const t of ready.tokens.filter(t=>t.kind==='pc'))admin.emit('token:setLantern',{tokenId:t.id,enabled:true});ready=await snap();
 const actor=ready.tokens.find(t=>t.refId===chars.Vanec);
 const fixture={code,mapId:map.id,chars,actor,tokenCount:ready.tokens.length,wallCount:ready.map.walls.length,playerUrl:base+'/join?code='+code,dmUrl:base+'/dm?code='+code,base,secret};
 fs.writeFileSync(output+'/full-app-fixture.json',JSON.stringify(fixture,null,2));console.log(JSON.stringify({code,tokens:fixture.tokenCount,walls:fixture.wallCount}));
}finally{admin.disconnect();}
