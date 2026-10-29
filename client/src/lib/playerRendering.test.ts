import {it,expect} from 'vitest';
import type {StateSnapshot,Token} from '../../../shared/types';
import {samePlayerPanelSnapshot,samePanelToken} from './playerPanelSnapshot';
import {resolveToken} from './entities';
import {validTargets,healTargets} from './targets';
const token=(id:string,x:number,kind='monster',extra={})=>({id,refId:id,kind,mapId:'map',x,y:100,widthFt:5,...extra}) as Token;
function fixture(){
 const tokens=[token('self',100,'pc'),token('enemy',140),token('far',300),token('ally',125),token('shared',130,'monster',{sharedSightOnly:true}),token('dead',160),token('weapon',170)];
 return {role:'player',sessionCode:'T',tokens,characters:[{id:'self',name:'Hero',curHp:10,maxHp:10,tempHp:0,icon:'',conditions:[],deathSaves:{failures:0}}],monsters:tokens.slice(1).map(t=>({id:t.id,name:t.id,conditions:[],icon:'',disposition:t.id==='ally'?'friendly':'enemy',dead:t.id==='dead',modelType:t.id==='weapon'?'spiritual-weapon':'goblin'})),map:{id:'map',gridSizePx:50,feetPerSquare:5,walls:[{id:'wall',kind:'rectangle',ax:200,ay:-500,bx:210,by:500}]},playerVision:{origins:[{id:'self',x:100,y:100}],radius:600,heavy:false,lights:[],walls:[{id:'wall',kind:'rectangle',ax:200,ay:-500,bx:210,by:500}]}} as unknown as StateSnapshot;
}
it('shares target eligibility without changing walls, teams, shared sight, dead or self-heal rules',()=>{
 const s=fixture(),self=s.tokens[0];
 expect(validTargets(s,self).map(t=>t.id)).toEqual(['enemy']);expect(healTargets(s,self).map(t=>t.id)).toEqual(['self','ally']);
 expect(validTargets(s,self,true).map(t=>t.id)).toEqual(['enemy','dead']);
 expect(validTargets(s,self).map(t=>t.id)).toEqual(['enemy']);
 const next={...s,tokens:[{...self,x:350},...s.tokens.slice(1)],playerVision:{...s.playerVision!,origins:[{id:'self',x:350,y:100}]}};
 expect(validTargets(next,next.tokens[0]).map(t=>t.id)).toEqual(['far']);
});
it('preserves resolved values for unchanged tokens and invalidates HP/privacy changes',()=>{
 const s=fixture(),enemy=s.tokens[1],d=resolveToken(s,enemy);
 expect(resolveToken({...s,tokens:[{...s.tokens[0],x:105},...s.tokens.slice(1)]},enemy)).toEqual(d);
 const privateView={...s,monsters:s.monsters.map(m=>m.id===enemy.refId?{...m,curHp:5,maxHp:10,tempHp:0}:m)} as StateSnapshot;
 expect(resolveToken(privateView,enemy).curHp).toBe(5);expect(resolveToken(s,enemy).curHp).toBeUndefined();
});
it('keeps player reference panels stable on movement while retaining resource, permission and map changes',()=>{
 const s=fixture(),moved={...s,tokens:[{...s.tokens[0],x:150},...s.tokens.slice(1)]};
 expect(samePlayerPanelSnapshot(s,moved)).toBe(true);expect(samePanelToken(s.tokens[0],moved.tokens[0])).toBe(true);
 expect(samePanelToken(s.tokens[0],{...s.tokens[0],isHidden:true})).toBe(false);
 expect(samePlayerPanelSnapshot(s,{...s,characters:s.characters.map(c=>({...c,curHp:2}))})).toBe(false);
 expect(samePlayerPanelSnapshot(s,{...s,map:{...s.map!,walls:[]}})).toBe(false);
});
