import {describe,it,expect} from 'vitest';
import {visionLightEllipse} from '../../client/src/canvas/visionLightEllipse.js';
import {mapToScreen,projectGround} from '../../client/src/canvas/miniatureProjection.js';
import {reduceRollBackground,rollBackgroundBudget} from '../../client/src/lib/rollBackgroundBudget.js';

describe('perspective light bands',()=>{
  it.each([0,25,45])('projects the same light circle at %s degrees under arbitrary rotations and zoom',tilt=>{
    for(const rotation of [0,37,90,205])for(const scale of [.6,1,2]){
      const view={x:100,y:70,scale},width=1440,height=900,x=580,y=320,r=130;
      const ellipse=visionLightEllipse(view,tilt,rotation,width,height,x,y,r)!;
      expect(ellipse).toBeDefined();
      const a=ellipse.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
      for(let i=0;i<96;i++){
        const angle=i*Math.PI/48,p=mapToScreen(x+r*Math.cos(angle),y+r*Math.sin(angle),view,tilt);
        const screen=projectGround(p.x,p.y,width,height,tilt,rotation),dx=screen.x-ellipse.cx,dy=screen.y-ellipse.cy;
        expect(((c*dx+s*dy)/ellipse.rx)**2+((-s*dx+c*dy)/ellipse.ry)**2).toBeCloseTo(1,8);
      }
    }
  });
  it('falls back to clipped paths for circles crossing the camera plane',()=>{
    expect(visionLightEllipse({x:0,y:0,scale:1},45,0,1440,900,700,600,10000)).toBeUndefined();
  });
});

describe('dice background rendering budget',()=>{
  const base={showRollAnim:true,liveDice:null,hiddenRollReview:null,rollFx:null,hpFx:[]};
  it('reduces full rolls and approvals, and restores before impacts or skipped/disabled rolls',()=>{
    expect(reduceRollBackground({...base,liveDice:{}})).toBe(true);
    expect(reduceRollBackground({...base,rollFx:{impactReady:false}})).toBe(true);
    expect(reduceRollBackground({...base,hiddenRollReview:{}})).toBe(true);
    expect(reduceRollBackground({...base,rollFx:{impactReady:true}})).toBe(false);
    expect(reduceRollBackground({...base,liveDice:{},hpFx:[{}]})).toBe(false);
    expect(reduceRollBackground({...base,showRollAnim:false,liveDice:{}})).toBe(false);
    expect(reduceRollBackground(base)).toBe(false);
  });
  it('keeps CSS layout and saved quality separate from the temporary raster budget',()=>{
    expect(rollBackgroundBudget(1,true)).toEqual({pixelRatio:.65,fps:12});
    expect(rollBackgroundBudget(2,true)).toEqual({pixelRatio:1,fps:12});
    expect(rollBackgroundBudget(1.5,false)).toEqual({pixelRatio:1.5,fps:60});
    expect(rollBackgroundBudget(1,true,true)).toEqual({pixelRatio:1,fps:12});
    expect(rollBackgroundBudget(2,true,true)).toEqual({pixelRatio:2,fps:12});
    expect(rollBackgroundBudget(1.5,false,true)).toEqual({pixelRatio:1.5,fps:60});
  });
});
