import {it,expect} from 'vitest';
import {matchingDiceTrigger,sorcerousDiceTrigger} from '../../shared/diceTriggers.js';
it('identifies exact matching indices and separates different matching face values',()=>{
 expect(matchingDiceTrigger([7,2,7,6,2,7,1])).toEqual({title:'Orb can leap!',detail:'Matching damage dice',diceCount:7,groups:[{value:7,indices:[0,2,5]},{value:2,indices:[1,4]}]});
 expect(matchingDiceTrigger([1,3,7])).toBeUndefined();
});
it('highlights only actual eights with available, unreserved Sorcerous Burst capacity',()=>{
 expect(sorcerousDiceTrigger([3,8,7,8],0,4)).toMatchObject({kind:'burst',title:'Burst!',groups:[{value:8,indices:[1,3]}]});
 expect(sorcerousDiceTrigger([8,8],2,3)).toMatchObject({kind:'burst',groups:[{value:8,indices:[0]}]});
 expect(sorcerousDiceTrigger([8],4,4)).toMatchObject({kind:'burst-limit',detail:'No bonus dice remaining'});
 expect(sorcerousDiceTrigger([8],2,3,1)).toMatchObject({kind:'burst-limit',detail:'Remaining bonus dice already triggered'});
 expect(sorcerousDiceTrigger([7,5],0,4)).toBeUndefined();
});
