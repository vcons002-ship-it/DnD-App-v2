import {it,expect} from 'vitest';
import {liveRollTarget} from '../../shared/liveRollTarget.js';
import type {StateSnapshot} from '../../shared/types.js';
const view={tokens:[{id:'g',kind:'monster',refId:'goblin',revealTag:'G2'},{id:'p',kind:'pc',refId:'pc'}],monsters:[{id:'goblin',name:'Goblin'}],characters:[{id:'pc',name:'Druk'}]} as Pick<StateSnapshot,'tokens'|'monsters'|'characters'>;
it('keeps reveal tags on explicit and pending damage targets',()=>{
 expect(liveRollTarget(view,[{id:'g'}])).toBe('Goblin G2');
 expect(liveRollTarget(view,[{kind:'monster',refId:'goblin'}])).toBe('Goblin G2');
 expect(liveRollTarget(view,[{id:'g'},{id:'p'}])).toBe('Goblin G2, Druk');
});
it('does not leak names or encounter numbers for targets outside the visible snapshot',()=>{
 expect(liveRollTarget(view,[{id:'hidden'}])).toBe('Hidden target');
 expect(liveRollTarget({...view,tokens:[]},[{kind:'monster',refId:'goblin'}])).toBe('Hidden target');
 expect(liveRollTarget(view,[])).toBeUndefined();
});
