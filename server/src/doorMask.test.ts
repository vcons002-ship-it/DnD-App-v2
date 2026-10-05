import {it,expect} from 'vitest';
import sharp from 'sharp';
import {doorsFromMask} from './doorMask.js';

const png=(content:string)=>sharp(Buffer.from(`<svg width="400" height="300"><rect width="400" height="300" fill="#222"/>${content}</svg>`)).png().toBuffer();
it('extracts door widths and angles without marking original cyan artwork',async()=>{
  const art='<circle cx="340" cy="240" r="10" fill="#00ffff"/>';
  const source=await png(art),mask=await png(`${art}<path d="M40 60H120 M180 40V110 M220 150L280 210" fill="none" stroke="#00ffff" stroke-width="6"/>`);
  const doors=await doorsFromMask(mask,source,400,300);
  expect(doors).toHaveLength(3);
  const byCenter=doors.sort((a,b)=>(a.ax+a.bx)-(b.ax+b.bx));
  expect(Math.abs(byCenter[0].bx-byCenter[0].ax)).toBeCloseTo(80,0);
  expect(byCenter[0].ay).toBeCloseTo(60,0);
  expect(Math.abs(byCenter[1].by-byCenter[1].ay)).toBeCloseTo(70,0);
  expect(byCenter[2].bx-byCenter[2].ax).toBeCloseTo(byCenter[2].by-byCenter[2].ay,0);
  expect((byCenter[2].ax+byCenter[2].bx)/2).toBeCloseTo(250,0);
});
it('allows maps without doors, rejects broad cyan areas and changed framing',async()=>{
  const source=await png('');
  expect(await doorsFromMask(source,source,400,300)).toEqual([]);
  await expect(doorsFromMask(await png('<rect x="30" y="40" width="180" height="160" fill="#00ffff"/>'),source,400,300)).rejects.toThrow('broad rooms');
  await expect(doorsFromMask(source,source,800,300)).rejects.toThrow('framing');
});
it('retains a full filled door face even when its height exceeds its width',async()=>{
 const source=await png(''),mask=await png('<rect x="160" y="100" width="40" height="65" fill="#00ffff"/>');
 const doors=await doorsFromMask(mask,source,400,300);expect(doors).toHaveLength(1);expect(doors[0].footprint).toHaveLength(4);
 expect(Math.min(...doors[0].footprint!.map(p=>p.x))).toBeCloseTo(160,0);expect(Math.max(...doors[0].footprint!.map(p=>p.y))).toBeCloseTo(165,0);
});
