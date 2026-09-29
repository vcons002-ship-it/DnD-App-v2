import type {StateSnapshot} from '../../../shared/types.js';
import type {ExploredTerrain} from '../../../shared/exploration.js';
import {createPlayerVision, type PlayerVision} from '../../../shared/playerVision.js';
import {tokenMoveDuration, tokenMoveProgress} from './tokenMotion.js';

type Point = {x:number;y:number};
type Move = {from:Point;to:Point;start:number;duration:number};

/** One presentation clock for the body, HUD, lantern and sight. It survives
 * token layer/model changes, and never retains tokens removed by the server. */
export class TokenPresentation {
  private moves = new Map<string,Move>();
  private snapshot?: StateSnapshot;
  private time = 0;
  private memory?: ExploredTerrain;
  private personal?: PlayerVision;
  private party?: PlayerVision;
  private visionDirty = true;

  sync(snapshot:StateSnapshot, pxPerFoot:number, now:number, reducedMotion=false) {
    if(this.snapshot===snapshot)return;
    const previous=this.snapshot;
    const sameMap=previous?.map?.id===snapshot.map?.id;
    if(!sameMap)this.moves.clear();
    this.advance(now);
    const ids=new Set(snapshot.tokens.map(t=>t.id));
    for(const id of this.moves.keys())if(!ids.has(id))this.moves.delete(id);
    for(const token of snapshot.tokens){
      const old=this.moves.get(token.id);
      if(old&&old.to.x===token.x&&old.to.y===token.y)continue;
      const from=old?this.position(token.id)!:token;
      const duration=old&&!reducedMotion?tokenMoveDuration(Math.hypot(token.x-from.x,token.y-from.y),pxPerFoot):0;
      this.moves.set(token.id,{from:{x:from.x,y:from.y},to:{x:token.x,y:token.y},start:now,duration});
    }
    this.snapshot=snapshot;
    // Shared exploration arrives for the destination. Show existing memory plus
    // live sight until the party finishes moving. Clears/restrictions are immediate.
    if(!sameMap || !snapshot.exploredTerrain?.length || !this.moving() ||
      previous?.map?.mapFogEnabled!==snapshot.map?.mapFogEnabled ||
      JSON.stringify(previous?.map?.mapFogRevealed)!==JSON.stringify(snapshot.map?.mapFogRevealed))this.memory=snapshot.exploredTerrain;
    this.visionDirty=true;
  }

  advance(now:number) {
    this.time=Math.max(this.time,now);
    this.visionDirty=true;
    if(!this.moving())this.memory=this.snapshot?.exploredTerrain;
  }

  moving() {return [...this.moves.values()].some(m=>this.time<m.start+m.duration);}
  position = (id:string):Point|undefined => {
    const move=this.moves.get(id);if(!move)return undefined;
    const t=move.duration?tokenMoveProgress(this.time-move.start,move.duration):1;
    return {x:move.from.x+(move.to.x-move.from.x)*t,y:move.from.y+(move.to.y-move.from.y)*t};
  };
  explored = () => this.memory;
  private updateVision() {
    if(!this.visionDirty)return;
    this.visionDirty=false;
    const snapshot=this.snapshot, vision=snapshot?.playerVision;
    this.personal=vision?{...vision,origins:vision.origins.map(o=>({...o,...this.position(o.id)})),
      lights:vision.lights.map(l=>({...l,...this.position(l.id)}))}:undefined;
    const tokens=snapshot?.tokens.map(t=>({...t,...this.position(t.id)}))??[];
    this.party=snapshot?.role==='player'?createPlayerVision(snapshot.map,tokens,new Set(tokens.filter(t=>t.kind==='pc').map(t=>t.refId))):undefined;
  }
  personalVision = () => {this.updateVision();return this.personal;};
  partyVision = () => {this.updateVision();return this.party;};
}
