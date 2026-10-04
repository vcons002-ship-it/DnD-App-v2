import {it,expect} from 'vitest';
import {doorInReach,doorInteractionArea} from '../../shared/doorInteraction.js';
import {translateWall} from '../../shared/wallGeometry.js';
import type {MapWall} from '../../shared/mapWalls.js';
const door:MapWall={id:'door',door:true,kind:'rectangle',ax:100,ay:100,bx:200,by:120};
it('allows footprint reach beyond the full doorstep on either side, including open doors',()=>{
 expect(doorInReach({x:150,y:245,widthFt:5},door,10)).toBe(true);
 expect(doorInReach({x:150,y:245.1,widthFt:5},door,10)).toBe(false);
 expect(doorInReach({x:150,y:-25,widthFt:5},{...door,open:true},10)).toBe(true);
 expect(doorInReach({x:150,y:-50,widthFt:10},door,10)).toBe(true);
});
it('uses map scale and ignores decorative miniature width, rejecting invalid values',()=>{
 const t={x:150,y:240,widthFt:5,miniatureWidthFt:100};
 expect(doorInReach(t,door,10)).toBe(true);expect(doorInReach(t,door,5)).toBe(false);
 expect(doorInReach({...t,y:246},door,10)).toBe(false);
 expect(doorInReach({...t,widthFt:NaN},door,10)).toBe(false);
 expect(doorInReach(t,door,0)).toBe(false);
});
it('keeps the approach area full-width and aligned when doors are rotated or moved',()=>{
 const area=doorInteractionArea(door,10);expect(area).toMatchObject({ax:100,bx:200,ay:50,by:170});
 expect(area.door).toBeUndefined();expect(doorInteractionArea(door,10)).toBe(area);
 const moved=translateWall(door,30,40);expect(doorInteractionArea(moved,10)).toMatchObject({ax:130,bx:230,ay:90,by:210});
 const angled={...door,rotation:90};expect(doorInteractionArea(angled,10)).toMatchObject({ax:90,bx:210,ay:60,by:160});
});
