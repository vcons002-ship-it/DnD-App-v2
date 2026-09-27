const fs=require('fs'),path=require('path'),sharp=require('C:/Users/vcons/codex-work/dnd-undead-fiends/node_modules/sharp');
const root=__dirname;
const source='C:/Users/vcons/.codex/generated_images/01a0bc77-1b83-7a53-9c53-86e904a628b4/exec-adc6b1e3-56b5-4dbf-a911-35894cc49275.png';
(async()=>{
 fs.copyFileSync(source,path.join(root,'sheet.png'));
 const meta=await sharp(source).metadata(),half=Math.floor(meta.width/2),size=half-8;
 const layout={front:[0,0],back:[1,0],left:[0,1],right:[1,1]};
 for(const [view,[x,y]]of Object.entries(layout))await sharp(source).extract({left:x*half+4,top:y*half+4,width:size,height:size}).png().toFile(path.join(root,view+'.png'));
 fs.writeFileSync(path.join(root,'views.json'),JSON.stringify({source,sourceDimensions:[meta.width,meta.height],viewDimensions:[size,size],layout,anatomicalSide:'left',front:'palm',back:'dorsal',upscaled:false,correction:'Re-generated the back view to match the anatomical left hand; initial inconsistent sheet was not used.'},null,2));
})();

