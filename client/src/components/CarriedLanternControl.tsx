import type {Token} from '../../../shared/types';
import {useStore} from '../state/socket';

export function CarriedLanternControl({token}:{token:Token|null|undefined}){
  const socket=useStore(s=>s.socket);
  if(!token)return null;
  return <button className="btn tiny carried-lantern-toggle" aria-label="Carried lantern" aria-pressed={!!token.carriedLantern}
    title="Carry a lit lantern at your waist. Follows your character; does not reveal fog."
    onClick={()=>socket?.emit('token:setLantern',{tokenId:token.id,enabled:!token.carriedLantern})}>
    Lantern {token.carriedLantern?'on':'off'}
  </button>;
}
