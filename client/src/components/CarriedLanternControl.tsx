import type {Token} from '../../../shared/types';
import {useStore} from '../state/socket';

export function CarriedLanternControl({token,orb=false}:{token:Token|null|undefined;orb?:boolean}){
  const socket=useStore(s=>s.socket);
  if(!token)return null;
  return <button type="button" className={`btn carried-lantern-toggle ${orb?'orb-lantern-toggle':'tiny'}`} aria-label="Carried lantern" aria-pressed={!!token.carriedLantern}
    title={`Lantern ${token.carriedLantern?'on':'off'} — tap to ${token.carriedLantern?'extinguish':'light'}. Illuminates nearby darkness; manual fog cover stays in place.`}
    onClick={()=>socket?.emit('token:setLantern',{tokenId:token.id,enabled:!token.carriedLantern})}>
    {orb?<><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M9 5V4a3 3 0 0 1 6 0v1M7 7h10l2 13H5L7 7ZM8 4h8M4 21h16M12 10v7M9 14h6"/></svg><span>{token.carriedLantern?'On':'Off'}</span></>:<>Lantern {token.carriedLantern?'on':'off'}</>}
  </button>;
}
