import {it,expect} from 'vitest';
import {trayResizeAt} from './diceTrayResize';
it.each([[1,2],[2,1]])('resizes real tray geometry continuously from %s to %s', (from,to)=>{
 const a=trayResizeAt(from,to,0),b=trayResizeAt(from,to,230),c=trayResizeAt(from,to,460);
 expect(a.scale).toBe(from);expect(c.scale).toBe(to);
 expect(b.scale).toBe((from+to)/2);
 expect(b.viewScale).toBeGreaterThan(Math.min(a.viewScale,c.viewScale));
 expect(b.viewScale).toBeLessThan(Math.max(a.viewScale,c.viewScale));
 // Tray footprint changes too: it is not a fixed-size tray with smaller dice.
 expect((c.scale/c.viewScale-a.scale/a.viewScale)*(to-from)).toBeGreaterThan(0);
});
it('leaves unchanged pools at the same geometry and camera distance',()=>{
 expect(trayResizeAt(1,1,0).scale).toBe(trayResizeAt(1,1,460).scale);
 expect(trayResizeAt(1,1,0).viewScale).toBe(trayResizeAt(1,1,460).viewScale);
});
