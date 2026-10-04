import {it,expect} from 'vitest';
import {doorInReach} from '../../shared/doorInteraction.js';
import type {MapWall} from '../../shared/mapWalls.js';
const door:MapWall={id:'door',door:true,kind:'rectangle',ax:100,ay:100,bx:200,by:120};
it('allows five feet from the normal footprint on either side, including open doors',()=>{
 expect(doorInReach({x:150,y:195,widthFt:5},door,10)).toBe(true);
 expect(doorInReach({x:150,y:195.1,widthFt:5},door,10)).toBe(false);
 expect(doorInReach({x:150,y:25,widthFt:5},{...door,open:true},10)).toBe(true);
 expect(doorInReach({x:150,y:0,widthFt:10},door,10)).toBe(true);
});
it('uses map scale and ignores decorative miniature width, rejecting invalid values',()=>{
 const t={x:150,y:190,widthFt:5,miniatureWidthFt:100};
 expect(doorInReach(t,door,10)).toBe(true);expect(doorInReach(t,door,5)).toBe(false);
 expect(doorInReach({...t,y:210},door,10)).toBe(false);
 expect(doorInReach({...t,widthFt:NaN},door,10)).toBe(false);
 expect(doorInReach(t,door,0)).toBe(false);
});
