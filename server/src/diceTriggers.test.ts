import {it,expect} from 'vitest';
import {matchingDiceTrigger} from '../../shared/diceTriggers.js';
it('identifies exact matching indices and separates different matching face values',()=>{
 expect(matchingDiceTrigger([7,2,7,6,2,7,1])).toEqual({title:'Orb can leap!',detail:'Matching damage dice',diceCount:7,groups:[{value:7,indices:[0,2,5]},{value:2,indices:[1,4]}]});
 expect(matchingDiceTrigger([1,3,7])).toBeUndefined();
});
