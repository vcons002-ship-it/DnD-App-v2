import type {Character, ChatMessage, Role} from '../../shared/types.js';
import type {Conn} from './connections.js';

export type ChatParticipant={characterId:string;characterName:string};
/** Audience keys are server-only. Bind them when sent, never to a later claim. */
export type ChatPrivacy={channel:'whisper'|'party';audience:string[];includesDm:boolean;participants:ChatParticipant[]};
export type StoredChatMessage=ChatMessage & {privacy?:ChatPrivacy};

export function chatAudience(conn:Conn,socketId:string,to:string,characters:Character[]):ChatPrivacy {
  const mine=characters.find(c=>c.claimedBy===socketId||!!conn.playerId&&c.ownerId===conn.playerId);
  if(conn.role==='player'&&(!conn.playerId||!mine))throw new Error('Claim your character before sending private chat.');
  if(to==='party') {
    if(conn.role==='dm')throw new Error('Party chat is for players only.');
    return {channel:'party',audience:[],includesDm:false,participants:[]};
  }
  if(to==='dm') {
    if(conn.role==='dm')throw new Error('Choose a player to whisper to.');
    return {channel:'whisper',audience:[conn.playerId!],includesDm:true,participants:[{characterId:mine!.id,characterName:mine!.name}]};
  }
  const target=characters.find(c=>c.id===to);
  if(!target?.ownerId)throw new Error('That player needs to claim their character before receiving whispers.');
  if(conn.role==='player'&&target.ownerId===conn.playerId)throw new Error('Choose another player or the DM.');
  const participants=[...(mine&&conn.role==='player'?[{characterId:mine.id,characterName:mine.name}]:[]),{characterId:target.id,characterName:target.name}];
  return {channel:'whisper',audience:[...new Set([...(conn.role==='player'?[conn.playerId!]:[]),target.ownerId])],includesDm:conn.role==='dm',participants};
}

export function parseChatPrivacy(row:Record<string,unknown>):ChatPrivacy|undefined {
  if(row.chat_channel&&row.chat_channel!=='whisper'&&row.chat_channel!=='party')return {channel:'whisper',audience:[],participants:[],includesDm:false};
  const channel=row.chat_channel==='party'?'party':row.chat_channel||row.whisper_character_id||row.whisper_character_name||row.whisper_owner_id||row.image_id?'whisper':undefined;
  if(!channel)return undefined;
  let audience:string[]=[],participants:ChatParticipant[]=[];
  try {const a=JSON.parse(String(row.chat_audience??'[]'));if(Array.isArray(a))audience=a.filter((x):x is string=>typeof x==='string');}catch{}
  try {const a=JSON.parse(String(row.chat_participants??'[]'));if(Array.isArray(a))participants=a.filter(x=>x&&typeof x.characterId==='string'&&typeof x.characterName==='string').map(x=>({characterId:x.characterId,characterName:x.characterName}));}catch{}
  // Old DM/player archives remain private even without a live recipient key.
  if(!row.chat_channel&&row.whisper_character_id){
    if(typeof row.whisper_owner_id==='string')audience=[row.whisper_owner_id];
    if(!participants.length)participants=[{characterId:String(row.whisper_character_id),characterName:String(row.whisper_character_name??'Player')}];
  }
  return {channel,audience,participants,includesDm:channel==='whisper'&&(!!row.chat_includes_dm||!row.chat_channel&&!!row.whisper_character_id)};
}

export function privateChatVisible(privacy:ChatPrivacy,role:Role,playerId?:string|null,dmOnly=false):boolean {
  if(role==='dm')return privacy.channel==='whisper'&&privacy.includesDm;
  if(dmOnly||!playerId)return false;
  return privacy.channel==='party'||privacy.audience.includes(playerId);
}

export function chatForViewer(messages:StoredChatMessage[],role:Role,playerId?:string|null):ChatMessage[] {
  return messages.filter(m=>m.privacy?privateChatVisible(m.privacy,role,playerId,!!m.dmOnly):role==='dm'||!m.dmOnly).map(m=>{
    const {privacy,...publicMessage}=m;
    if(!privacy)return publicMessage;
    const first=privacy.participants[0];
    const peerIndex=privacy.audience.indexOf(playerId??'')===0?1:0;
    const replyTo=role==='dm'?first?.characterId:privacy.includesDm?'dm':privacy.participants[peerIndex]?.characterId;
    return {...publicMessage,channel:privacy.channel,...(privacy.channel==='whisper'?{whisper:{characterId:first?.characterId??'',characterName:first?.characterName??'Player',participantNames:[...(privacy.includesDm?['DM']:[]),...privacy.participants.map(p=>p.characterName)],...(replyTo?{replyTo}:{})}}:{})};
  });
}
