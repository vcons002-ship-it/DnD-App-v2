import type {LiveDiceFrame} from './liveDiceTypes.js';
import type {TrayDie} from './diceTrayTypes.js';

/** Adapt settled physical faces to the same strength scale as other dice trays. */
export function liveDieResult(frame:LiveDiceFrame,index:number):TrayDie {
 const value=frame.done?frame.values[index]??0:0;
 const part=frame.percentile[index];
 const tensIndex=part==='tens'?index:index-1;
 const tens=frame.values[tensIndex],ones=frame.values[tensIndex+1];
 const percentileValue=part&&frame.done&&tens!=null&&ones!=null?((tens-1)*10+ones-1)||100:undefined;
 return {sides:frame.sides[index],value,index,set:frame.sets[index],crit:frame.critical[index],percentileValue};
}
