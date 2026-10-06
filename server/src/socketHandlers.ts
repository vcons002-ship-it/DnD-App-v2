import {setRollPending,setRollSmite} from './sessions.js';
import {repeatSpell,summonSpiritualWeapon,spiritualWeaponPlacementError,spiritualWeaponOwner,moveSpiritualWeapon} from './linkedSpells.js';
import {castDispelMagic,dispelTargetError} from './dispelMagic.js';
import {advancedSpell} from '../../shared/advancedSpells.js';
import {castInvisibility,invisibilityError,breakInvisibility,spikeConditions} from './advancedSpells.js';
import {deferCast,getHeldCast,heldCasts,finishHeldCast,counterspellChoice} from './counterspell.js';
import type {AbilityRollPayload} from '../../shared/types.js';
import {isCommandSpell,commandWord,isStandardCommand,activeCommand} from '../../shared/commandSpell.js';
import {castCommand,resolveCommandInstruction} from './commandSpell.js';
import {linkedSpellProfile,spellKey} from '../../shared/linkedSpells.js';
import {spellcastingKeyFor} from '../../shared/spellExecution.js';
import {spellcastingMod} from '../../shared/spellMath.js';
import {shapeSaveFrame} from './liveSaveFrame.js';
import {chatAudience,privateChatVisible} from './privateChat.js';
import {chatImageForSend} from './chatImages.js';
import {doorApproachPoints,hasLineOfSight} from '../../shared/mapWalls.js';
import {doorInReach} from '../../shared/doorInteraction.js';
import {visionContains} from '../../shared/playerVision.js';
import {areaPlacementError} from './areaSpells.js';
import {liveRollTarget,type LiveTargetRef} from '../../shared/liveRollTarget.js';
import {editMapWalls,setWallDoor} from './mapWalls.js';
import {deleteMapFeatures} from './mapFeatureDelete.js';
import {enqueueRoll,rollInProgress,runLiveCommand,UnsupportedPhysicalDice} from './liveRolls.js';
import { partyRest, restCharacter, describeRest, spendHitDice } from './rests.js';
import { canonicalClassName } from '../../shared/multiclass.js';
import { grantLevelUp, cancelLevelUp, getLevelUpPlan, previewLevelUp, applyLevelUp, rollLevelUpHp, configureLevelUpClasses } from './leveling.js';
import {afterRollCommit} from './liveRollContext.js';
import {turnKey} from './hitFeatures.js';
import { resolveHitFeature } from './hitFeatures.js';
import { castMark } from './marks.js';
import {abilityKey} from '../../shared/hitFeatures.js';
import { markSpell } from '../../shared/hitFeatures.js';
import {partySpell} from '../../shared/partySpells.js';
import {resolveShield,mistyStepError,teleportMistyStep,shakeAwake} from './partySpellEffects.js';
import { selectSpellSlot } from '../../shared/spellSlotPools.js';
import { listRipostes } from './reactions.js';
import { config } from './config.js';
import { invokeSafely } from './safeHandler.js';
import { newId,db } from './db.js';
import { parseRollCommand, rollDice, isValidDiceExpression } from '../../shared/dice.js';
import { diceReveal } from '../../shared/rollReveal.js';
import { effectiveSheetAbility, spellDamageTypeChoices } from '../../shared/spellExecution.js';
import { spellCombatSupport } from '../../shared/spellSupport.js';
import { activeHasteCondition, spellActionBlock, spellActionBlockMessage } from '../../shared/spellBuffs.js';
import { expireTimedSpellEffects } from './hitEffectTurns.js';
import {
  resolveAttack,
  resolveAttackDamage,
  resolveSmite,
  resolveManeuver,
  resolveOrbLeap,
  resolveRiposte,
  castSlotLevel,
  resolveAbilityRoll,
  resolveMonsterSheetAbility,
  resolveForcedSave,
  resolveSkillRoll,
  useConsumable,
  resolveTrapDisarm,
  resolveObjectCheck,
  resolveSaves,
  resolveSave,
  resolveCheck,
  resolveDeathSave,
  noteConcentration,
  isConcentrationSpell,
  spellControlTargetError,
  spellApplyTargetError,
} from './combat.js';
import {
  aiCreateCharacter,
  aiFillCharacter,
  aiFillCreature,
} from './creatures/fill.js';
import {
  broadcastSnapshots,
  broadcastSpellCast,
  broadcastTokenDrag,
  broadcastTyping,
  broadcastSay,
  broadcastCursor,
  broadcastCursorHide,
  dropConn,
  getConn,
  isConnected,
  roomName,
  sendSnapshot,
  setConn,
  chatAccessToken,
  type IOServer,
} from './connections.js';
import { answerRules, recapSession, creatureLine } from './assistant/index.js';
import { buildSnapshot, lootVisibleToPlayers } from './visibility.js';
import {
  captureTokenDelete,
  captureCreatureDelete,
  captureFogCover,
  popUndo,
  pushUndo,
} from './undo.js';
import {
  addRollLog,
  advanceTurn,
  applyDamage,
  isDeadEntity,
  setTempHp,
  setTokenLantern,
  claimCharacter,
  clearOwnershipElsewhere,
  listCharacters,
  setCharacterOwner,
  clearCondition,
  clearInitiative,
  clearRollLog,
  clearTokensConditions,
  copyTokens,
  createCharacter,
  createCharacterFromLibrary,
  updateCharacter,
  getCharacter,
  getRollEntry,
  getMonster,
  addMeasurement,
  clearMeasurements,
  removeMeasurement,
  addAnnotation,
  clearAnnotations,
  moveAnnotation,
  removeAnnotation,
  resizeAnnotation,
  setAnnotationPopup,
  addMapImage,
  moveMapImage,
  resizeMapImage,
  reorderMapImage,
  deleteMapImage,
  setResource,
  setItem,
  removeItem,
  setLoot,
  takeLoot,
  setSheetAbility,
  setAbilityRechargeSpent,
  removeSheetAbility,
  reorderSheetAbilities,
  spendResourceForAbility,
  spendSpellSlot,
  pactSlotLevel,
  damageTokens,
  duplicateToken,
  setTokensHidden,
  setTokensDisposition,
  setTokensCondition,
  coverFog,
  setFogRevealed,
  createMonsterTemplate,
  createToken,
  deleteMap,
  deleteMonster,
  deleteCharacter,
  setMonsterPlayerNotes,
  deleteToken,
  instantiateMonster,
  setEntityIcon,
  paintFog,
  setFogLayer,
  setVisionFog,
  setTokenHidden,
  setTokenInCombat,
  setTokensHideCombatRole,
  setTokensCombatRole,
  getActiveMapId,
  getMap,
  getSessionById,
  getSessionByCode,
  getToken,
  listRollLog,
  listChat,
  listTokens,
  listMaps,
  monsterInSession,
  moveToken,
  wallLimitedMove,
  firstInInitiative,
  releaseClaims,
  renameMap,
  reorderMaps,
  renameSession,
  importMaps,
  previewImportCharacters,
  resizeToken,
  resizeMiniature,
  setTokenShape,
  createPastedObject,
  createSummon,
  updateMapGrid,
  updateMapEnvironment,
  rollAllInitiative,
  startCombat, finishInitiative, rollPlayerInitiative, setInitiativePending,
  rollMissingInitiative,
  setCombatRound,
  setHideDmRolls,
  setManualDamage,
  rollerName,
  getClaimedCharacterId,
  addChatMessage,
  setActiveMap,
  setActiveTurn,
  setCondition,
  setConcentration,
  setTokenInitiative,
  touchSession,
  updateMonster,
} from './sessions.js';
import type { Character, Condition, MapPopup, TokenKind } from '../../shared/types.js';

/** Grace window after a disconnect before a player's claim is freed, so a brief
 *  connection blip doesn't de-select their character (and others can't snipe it).
 *  When the same player reconnects within it, the claim is handed straight back. */
/** Clamp a client-supplied decal popup to safe sizes before storing. */
function sanitizePopup(p: MapPopup): MapPopup {
  const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
  return {
    title: str(p?.title, 80) || 'Shop',
    ...(p?.note ? { note: str(p.note, 1000) } : {}),
    items: (Array.isArray(p?.items) ? p.items : []).slice(0, 100).map((it) => ({
      id: str(it?.id, 40) || newId(),
      name: str(it?.name, 80),
      price: str(it?.price, 40),
      ...(Number.isFinite(Number(it?.qty)) ? { qty: Math.max(0, Math.round(Number(it.qty))) } : {}),
      ...(it?.note ? { note: str(it.note, 300) } : {}),
    })),
  };
}

const CLAIM_GRACE_MS = 20_000;
/** In-flight rules-assistant requests by socket id, so the Stop button (and a
 *  disconnect) can abort the long-running LLM call. */
const assistantInFlight = new Map<string, AbortController>();
/** Disconnected sockets whose claims are held during their grace window:
 *  socketId → its session + player + the pending release timer. */
const pendingReleases = new Map<
  string,
  { sessionId: string; playerId: string | null; timer: NodeJS.Timeout }
>();
/** A claim is protected (un-stealable) while its holder is connected OR still
 *  inside its post-disconnect grace window. */
const isClaimProtected = (claimedBy: string | null | undefined): boolean =>
  isConnected(claimedBy) || (!!claimedBy && pendingReleases.has(claimedBy));
/** The player id behind a claim, whether the holder is live or grace-pending. */
const claimHolderPlayerId = (claimedBy: string | null): string | null =>
  (claimedBy
    ? getConn(claimedBy)?.playerId ?? pendingReleases.get(claimedBy)?.playerId
    : null) ?? null;

export function registerSocketHandlers(io: IOServer, options:{livePhysics?:boolean}={}): void {
  /** Cancel every pending release for a player (they're back) so their claims
   *  aren't freed, then hand back the one character they last held if no live
   *  player holds it now. Called on (re)join. */
  const reclaimForPlayer = (
    sid: string,
    playerId: string | null,
    socketId: string,
  ): void => {
    if (!playerId) return;
    for (const [oldSock, p] of pendingReleases) {
      if (p.playerId === playerId) {
        clearTimeout(p.timer);
        pendingReleases.delete(oldSock);
      }
    }
    for (const c of listCharacters(sid)) {
      if (c.ownerId !== playerId) continue;
      // Skip if a DIFFERENT live socket is actively holding it.
      if (c.claimedBy && c.claimedBy !== socketId && isConnected(c.claimedBy)) continue;
      claimCharacter(c.id, socketId, playerId);
      break; // a player holds exactly one character
    }
  };

  /** Hold a disconnected socket's claim for the grace window, then free it. */
  const scheduleRelease = (
    sid: string,
    socketId: string,
    playerId: string | null,
  ): void => {
    const timer = setTimeout(() => {
      pendingReleases.delete(socketId);
      releaseClaims(socketId);
      broadcastSnapshots(io, sid);
    }, CLAIM_GRACE_MS);
    pendingReleases.set(socketId, { sessionId: sid, playerId, timer });
  };

  io.on('connection', (socket) => {
    let activeCommandConnection:ReturnType<typeof getConn>;
    let resumedSocketId:string|undefined,resumedCastId:string|undefined;
    const commandSocketId=()=>resumedSocketId??socket.id;
    const commandConnection=()=>activeCommandConnection??getConn(socket.id);
    // Crash boundary: every domain handler below registers through `on` instead
    // of `socket.on`, so a throw inside a handler (a malformed payload, an
    // invalid dice expression, a better-sqlite3 bind error) is caught and turned
    // into an `error` notice to the sender — rather than an uncaught exception
    // that takes down the whole process and, with it, the live table.
    const rawOn = socket.on.bind(socket) as (
      event: string,
      handler: (...args: unknown[]) => void,
    ) => void;
    const trayReady=new Map<string,()=>void>();
    rawOn('dice:ready',(...args)=>{const id=(args[0] as {id?:unknown})?.id;if(typeof id==='string')trayReady.get(id)?.();});
    const prepareTray=(id:string)=>new Promise<void>(resolve=>{
      const finish=()=>{clearTimeout(timer);trayReady.delete(id);resolve();};
      const timer=setTimeout(finish,2500);trayReady.set(id,finish);
    });
    const commandDispatch=new Map<string,(...args:unknown[])=>void>();
    const domainHandlers=new Map<string,(payload:any)=>unknown>();
    const scheduleCastTimeout=(held:NonNullable<ReturnType<typeof deferCast>>)=>afterRollCommit(()=>{
      const timer=setTimeout(()=>commandDispatch.get('spell:counterspell')?.({castId:held.id,continueCast:true}),Math.max(0,held.expiresAt-Date.now())+150);timer.unref();
    });
    const liveEvents=new Set(['spell:counterspell','spell:shield','spell:repeat','dice:roll','ability:roll','death:roll','skill:roll','save:roll','check:roll','save:resolve','combat:attack','combat:damage','combat:smite','combat:maneuver','combat:hitFeature','combat:orbLeap','combat:riposte','combat:save','trap:disarm','object:interact','item:use','hitDice:spend','character:levelRollHp','initiative:start','initiative:rollMine','initiative:rollAll','initiative:rollMissing','initiative:next','initiative:endTurn']);
    const on = ((event: string, handler: (...args: unknown[]) => void) => {
      const wrapped=(...args:unknown[]) => {
        const failed=(err:unknown)=>{console.error(`[socket:${event}]`,err);socket.emit('error',{code:'HANDLER_ERROR',message:err instanceof UnsupportedPhysicalDice?err.message:'The action could not complete. No unfinished roll was applied.'});};
        const sid=sessionId();
        const runHandler=()=>{
          // Resolve elapsed durations before this action reads AC, movement or
          // spell conditions. Within a live roll these writes are staged and
          // replayed with the rest of the command, never published early.
          if(sid && !['cursor:move','cursor:hide','chat:typing','token:drag'].includes(event) && expireTimedSpellEffects(sid))
            afterRollCommit(()=>broadcastSnapshots(io,sid));
          return handler(...args);
        };
        const moving=event==='token:move'?getToken((args[0] as any)?.tokenId):undefined;
        const isRoll=!!(moving&&sid&&spikeConditions(sid).some(c=>c.combatEffect?.spikeArea?.mapId===moving.mapId))||liveEvents.has(event)||(event==='chat:send'&&!(args[0] as any)?.whisperTo&&!!parseRollCommand(String((args[0] as any)?.text??'')));
        if(options.livePhysics!==false && sid && (isRoll||rollInProgress(sid)) && !['join','disconnect','cursor:move','cursor:hide','chat:typing','token:drag'].includes(event)){
          enqueueRoll(sid,async()=>{
            if(!socket.connected||commandConnection()?.sessionId!==sid)return;
            if(!isRoll){await runHandler();return;}
            const commandConn=commandConnection();
            const roller=rollerName(sid,commandSocketId(),isDm());
            const character=listCharacters(sid).find(c=>c.name===roller);
            const payload=args[0] as any;
            const abilityOwner=payload?.refId && (payload.kind==='pc'?getCharacter(payload.refId):getMonster(payload.refId));
            const ability=abilityOwner?.sheetAbilities.find((a:import('../../shared/types.js').SheetAbility)=>a.id===payload?.abilityId);
            const sourceEntry=payload?.rollId?getRollEntry(payload.rollId,sid):undefined;
            const pending=sourceEntry?.pending;
            const requestedToken=payload?.attackerTokenId?getToken(payload.attackerTokenId):undefined;
            const actor=pending?.attacker.kind==='pc'?getCharacter(pending.attacker.refId)
              :requestedToken?.kind==='pc'?getCharacter(requestedToken.refId)
              :payload?.characterId?getCharacter(payload.characterId)
              :payload?.kind==='pc'&&abilityOwner?getCharacter(abilityOwner.id):character;
            const rolledToken=payload?.tokenId?getToken(payload.tokenId):undefined;
            const npc=pending?.attacker.kind==='monster'?getMonster(pending.attacker.refId)
              :requestedToken?.kind==='monster'?getMonster(requestedToken.refId)
              :payload?.kind==='monster'&&abilityOwner?getMonster(abilityOwner.id)
              :rolledToken?.kind==='monster'?getMonster(rolledToken.refId):undefined;
            const dmDice=!!npc || isDm()&&!actor;
            const meta={dmDice,affinity:npc?.disposition,ready:prepareTray,onFacing:()=>broadcastSnapshots(io,sid),roller,className:actor?.className??'',label:ability?.name??pending?.weapon??(sourceEntry?.apply?.orb?'Chromatic Orb':undefined)??actor?.weapons[payload?.weaponIndex]?.name??payload?.label??payload?.skill??payload?.ability??event.split(':').join(' ')};
            if(event==='combat:hitFeature')meta.label=actor?.sheetAbilities.find(a=>a.id===payload?.abilityId)?.name??meta.label;
            if(event==='death:roll')meta.label='Death Saving Throw';
            else if(event==='hitDice:spend')meta.label='Hit Dice';
            else if(event==='character:levelRollHp')meta.label='Level-up Hit Point Increase';
            else if(ability?.roll?.kind==='heal')meta.label=`${ability.name} — Healing Roll`;
            else if(ability?.roll&&['save','damage'].includes(ability.roll.kind))meta.label=`${ability.name} — Damage Roll`;
            const riposte=event==='combat:riposte'?listRipostes(sid).find(o=>o.id===payload?.opportunityId):undefined;
            const targetId=payload?.targetTokenId??(event==='save:resolve'?payload?.tokenId:undefined)??pending?.hitOptions?.targetTokenId??riposte?.attackerTokenId;
            const targetRefs:LiveTargetRef[]=typeof targetId==='string'?[{id:targetId}]:pending?[pending.target]:Array.isArray(payload?.tokenIds)?payload.tokenIds.map((id:string)=>({id})):[];
            const targetLabels=new Map<string,string|undefined>();
            const privateRoll=isDm()&&!!getSessionById(sid)?.hideDmRolls;
            const sourceToken=payload?.attackerTokenId?getToken(payload.attackerTokenId):undefined;
            const sources=[sourceToken,abilityOwner&&{kind:payload.kind,refId:abilityOwner.id},pending?.attacker,
              payload?.tokenId?getToken(payload.tokenId):undefined].filter(Boolean);
            const audienceCache=new Map<string,boolean>();
            const audience=()=>[...io.sockets.sockets.keys()].filter(id=>{
              const conn=getConn(id);
              if(conn?.sessionId!==sid)return false;
              if(conn.role==='dm')return true;
              if(privateRoll||(isDm()&&event.startsWith('initiative:')))return false;
              // Use the same fog/map shaping as ordinary tokens. Cache while map
              // mutations are queued; newly joined viewers get a fresh decision.
              if(!audienceCache.has(id)) {
                const view=buildSnapshot(sid,conn.role,conn.viewMapId,id,conn.playerId);
                audienceCache.set(id,!!view&&sources.every(source=>view.tokens.some(t=>!t.sharedSightOnly&&t.kind===source!.kind&&t.refId===source!.refId)));
              }
              return audienceCache.get(id)!;
            });
            const lastDelivered=new Map<string,string>();
            try{
              await runLiveCommand(()=>{
                const emit=socket.emit;
                // Notices from an aborted pass are not emitted twice.
                (socket as any).emit=(...values:any[])=>{afterRollCommit(()=>emit.apply(socket,values as any));return socket;};
                activeCommandConnection=commandConn;
                try{runHandler();}finally{socket.emit=emit;activeCommandConnection=undefined;}
              },(frame,info)=>{for(const id of audience()){
                if(info?.saveDice){
                  const shaped=shapeSaveFrame(frame,info.saveDice,target=>{
                    const key=`save:${id}:${target.kind}:${target.refId}`;
                    if(!targetLabels.has(key)){
                      const conn=getConn(id)!,view=buildSnapshot(sid,conn.role,conn.viewMapId,id,conn.playerId);
                      const token=view?.tokens.find(t=>!t.sharedSightOnly&&t.kind===target.kind&&t.refId===target.refId);
                      targetLabels.set(key,token?(token.kind==='monster'&&token.revealTag&&token.revealTag!=='U'?token.revealTag:liveRollTarget(view!,[target])):undefined);
                    }
                    return targetLabels.get(key);
                  },{hideModifiersFor:target=>getConn(id)?.role!=='dm'&&(target.kind==='monster'||isDm()),hideDc:getConn(id)?.role!=='dm'});
                  if(shaped){io.to(id).emit('dice:frame',shaped);lastDelivered.set(id,frame.id);}
                  continue;
                }
                const labelKey=`${id}:${info?.target?.refId??''}`;
                if(!targetLabels.has(labelKey)){
                  const conn=getConn(id)!;
                  const view=buildSnapshot(sid,conn.role,conn.viewMapId,id,conn.playerId);
                  if(info?.target&&conn.role!=='dm'&&!view?.tokens.some(t=>!t.sharedSightOnly&&t.kind===info.target!.kind&&t.refId===info.target!.refId)){
                    targetLabels.set(labelKey,undefined);continue;
                  }
                  targetLabels.set(labelKey,(view?liveRollTarget(view,info?.target?[info.target]:targetRefs):undefined)??(payload?.area?'Placed spell area':ability?.roll&&['save','damage'].includes(ability.roll.kind)?'Targets not selected':undefined));
                }
                // An automatic area save must not expose an unseen bystander.
                if(info?.target&&!targetLabels.get(labelKey)&&getConn(id)?.role!=='dm')continue;
                io.to(id).emit('dice:frame',{...frame,target:targetLabels.get(labelKey)});lastDelivered.set(id,frame.id);
              }},meta);
            }finally{for(const [id,lastId] of lastDelivered)io.to(id).emit('dice:finished',{id:lastId});}
          },failed);
          return;
        }
        invokeSafely(runHandler,failed);
      };
      domainHandlers.set(event,handler);commandDispatch.set(event,wrapped);rawOn(event,wrapped);
    }) as typeof socket.on;

    const isDm = () => commandConnection()?.role === 'dm';
    const sessionId = () => commandConnection()?.sessionId;

    /** Run a mutation, persist, and re-shape snapshots for everyone. */
    const afterChange = () => {
      const sid = sessionId();
      if (sid) { expireTimedSpellEffects(sid); afterRollCommit(() => { finishInitiative(sid); broadcastSnapshots(io, sid); }); }
    };

    on('join', (payload, ack) => {
      // TypeScript does not validate untrusted Socket.IO payloads at runtime.
      if (typeof ack !== 'function') return;
      if (!payload || (payload.role !== 'dm' && payload.role !== 'player')) {
        return ack({ ok: false, error: { code: 'BAD_ROLE', message: 'Choose DM or player.' } });
      }
      const session = getSessionByCode(payload.sessionCode ?? '');
      if (!session) {
        return ack({
          ok: false,
          error: { code: 'NO_SESSION', message: 'Session not found' },
        });
      }
      // The DM secret is mandatory now (config.dmPassphrase is always set), so
      // this always enforces. Players never supply it.
      if (payload.role === 'dm' && payload.dmPassphrase !== config.dmPassphrase) {
        return ack({
          ok: false,
          error: {
            code: 'BAD_PASSPHRASE',
            message: 'Incorrect DM secret. Check the server console / data/dm-secret.txt.',
          },
        });
      }

      const playerId =
        typeof payload.playerId === 'string' && payload.playerId.trim()
          ? payload.playerId.slice(0, 64)
          : null;
      setConn(socket.id, {
        sessionId: session.id,
        role: payload.role,
        viewMapId: session.activeMapId,
        playerId,
      });
      socket.join(roomName(session.id));
      touchSession(session.id); // keep the resume directory fresh

      // Hand back the character this player last held (and cancel any pending
      // release from a just-dropped connection) so a reload/reconnect lands them
      // right back on their PC if it's still free.
      if (payload.role === 'player') reclaimForPlayer(session.id, playerId, socket.id);

      const snapshot = buildSnapshot(
        session.id,
        payload.role,
        session.activeMapId,
        socket.id,
        playerId,
      );
      if (!snapshot) {
        return ack({
          ok: false,
          error: { code: 'NO_SNAPSHOT', message: 'Could not load session' },
        });
      }
      ack({ ok: true, snapshot, chatAccessToken:chatAccessToken(socket.id) });
      // Let everyone else see the (possibly) re-taken character.
      broadcastSnapshots(io, session.id);
    });

    // ---- DM-only: map prep & promotion ----

    on('map:select', ({ mapId }) => {
      const conn = commandConnection();
      if (!conn || conn.role !== 'dm') return;
      if (!getMap(mapId)) return;
      setConn(socket.id, { ...conn, viewMapId: mapId });
      sendSnapshot(io, socket.id); // only this DM's staging view changes
    });

    on('map:setActive', ({ mapId }) => {
      const sid = sessionId();
      if (!sid || !isDm() || !getMap(mapId)) return;
      setActiveMap(sid, mapId);
      afterChange();
    });

    on('map:rename', ({ mapId, name }) => {
      if (!isDm() || !getMap(mapId)) return;
      renameMap(mapId, name);
      afterChange();
    });

    // Reorder the DM's map list. Ids are scoped to this session by reorderMaps,
    // so a forged list can't touch another session's maps.
    on('map:reorder', ({ orderedIds }) => {
      const sid = sessionId();
      if (!sid || !isDm() || !Array.isArray(orderedIds)) return;
      const ids = orderedIds.filter((id) => typeof id === 'string').slice(0, 500);
      if (!ids.length) return;
      reorderMaps(sid, ids);
      afterChange();
    });

    on('map:editWalls', (p) => {
      const sid=sessionId();
      if(!sid||!isDm()||!p||typeof p.mapId!=='string')return;
      const error=editMapWalls(sid,p.mapId,p);
      if(error)socket.emit('notice',{message:error});else afterChange();
    });
    on('map:deleteFeatures',p=>{
      const sid=sessionId();if(!sid||!isDm()||!p||typeof p.mapId!=='string')return;
      const error=deleteMapFeatures(sid,p.mapId,p.wallIds,p.lightIds);
      if(error)socket.emit('notice',{message:error});else afterChange();
    });

    const usableWallDoor=(map:NonNullable<ReturnType<typeof getMap>>,door:NonNullable<typeof map.walls>[number])=>{
      if(isDm())return true;
      const sid=sessionId()!;
      const snapshot=buildSnapshot(sid,'player',null,socket.id,commandConnection()?.playerId);
      const visible=snapshot?.map?.id===map.id&&(!door.tokenId||snapshot.tokens.some(t=>t.id===door.tokenId))&&doorApproachPoints(door).some(point=>visionContains(snapshot?.playerVision,point.x,point.y)&&(!map.mapFogEnabled||map.mapFogRevealed.includes(`${Math.floor(point.x/map.gridSizePx)},${Math.floor(point.y/map.gridSizePx)}`)));
      const nearby=listTokens(map.id).some(t=>t.kind==='pc'&&!t.isHidden&&ownsCharacter(t.refId)&&doorInReach(t,door,map.gridSizePx/map.feetPerSquare));
      if(!visible||!nearby)socket.emit('notice',{message:'Move your character’s footprint within 5 ft of a visible door’s approach area to use it.'});
      return visible&&nearby;
    };
    const linkedWallDoor=(refId:string)=>{
      const sid=sessionId();if(!sid)return undefined;
      for(const map of listMaps(sid)){
        const door=map.walls?.find(w=>w.door&&w.tokenId&&getToken(w.tokenId)?.refId===refId);
        if(door)return {map,door};
      }
    };
    on('map:setDoor',p=>{
      const sid=sessionId();if(!sid||!p||typeof p.open!=='boolean')return;
      const map=getMap(p.mapId),door=map?.walls?.find(w=>w.id===p.doorId&&w.door);
      if(!map||map.sessionId!==sid||!door||!usableWallDoor(map,door))return;
      const error=setWallDoor(sid,map.id,door.id,p.open);
      if(error)socket.emit('notice',{message:error});else afterChange();
    });

    on('map:setEnvironment', (p) => {
      const sid = sessionId();
      if (!sid || !isDm() || !p || typeof p.mapId !== 'string') return;
      if (updateMapEnvironment(sid, p.mapId, p.settings)) afterChange();
    });

    on('map:setGrid', (p) => {
      if (!isDm() || !getMap(p.mapId)) return;
      const px = Number.isFinite(p.gridSizePx)
        ? Math.round(Math.max(10, Math.min(400, p.gridSizePx)))
        : 50;
      // Keep feet-per-square as a FLOAT: the "drag a line to set scale" tool sends
      // an exact fractional value (e.g. a 3000px map declared 100ft wide over a
      // 50px grid = 1.667 ft/sq) that drives tokenDistanceFt / reach / auto-crit.
      // Rounding it skewed every distance rule; NaN-guard, allow fine sub-1 grids.
      const ft = Number.isFinite(p.feetPerSquare)
        ? Math.max(0.1, Math.min(1000, p.feetPerSquare))
        : 5;
      // 0 = unset (fall back to feet-per-square); otherwise clamp to a sane span.
      const w = p.widthFt <= 0 ? 0 : Math.max(1, Math.min(100000, p.widthFt));
      updateMapGrid(p.mapId, px, ft, w, {
        offsetX: p.offsetX === undefined ? undefined : ((p.offsetX % px) + px) % px,
        offsetY: p.offsetY === undefined ? undefined : ((p.offsetY % px) + px) % px,
        locked: p.locked,
        hidden: p.hidden,
      });
      afterChange();
    });

    // Measuring shapes — any session member may draw/clear them; they're shared.
    const MEASURE_KINDS = ['cone', 'circle', 'line', 'square', 'emanation', 'ruler'];
    on('measure:add', ({ kind, origin, target, tokenId }) => {
      const sid = sessionId();
      const conn = commandConnection();
      if (!sid || !conn || !MEASURE_KINDS.includes(kind)) return;
      const mapId =
        conn.role === 'dm' ? conn.viewMapId ?? getActiveMapId(sid) : getActiveMapId(sid);
      if (!mapId || !getMap(mapId)) return;
      addMeasurement(sid, {
        mapId,
        kind,
        origin: { x: Number(origin?.x) || 0, y: Number(origin?.y) || 0 },
        target: { x: Number(target?.x) || 0, y: Number(target?.y) || 0 },
        tokenId: typeof tokenId === 'string' ? tokenId : undefined,
        createdBy: rollerName(sid, commandSocketId(), conn.role === 'dm'),
      });
      afterChange();
    });

    on('measure:remove', ({ id }) => {
      const sid = sessionId();
      const conn = commandConnection();
      if (!sid || !conn || !id) return;
      const zone=spikeConditions(sid).find(c=>c.id===id),fx=zone?.combatEffect;
      if(zone&&fx){
        if(!ownsCreature(fx.casterKind,fx.casterId))return;
        clearCondition(fx.casterKind,fx.casterId,id);afterChange();return;
      }
      // The DM may remove any; a player only their own.
      removeMeasurement(
        id,
        conn.role === 'dm' ? undefined : rollerName(sid, commandSocketId(), false),
      );
      afterChange();
    });

    on('measure:clear', ({ mapId, mineOnly }) => {
      const sid = sessionId();
      const conn = commandConnection();
      if (!sid || !conn || !getMap(mapId)) return;
      // Players may only clear their own; the DM may clear everyone's.
      const onlyMine = mineOnly || conn.role !== 'dm';
      clearMeasurements(mapId, onlyMine ? rollerName(sid, commandSocketId(), false) : undefined);
      afterChange();
    });

    on('annotation:add', ({ kind, points, x, y, text, color, url, width, height }) => {
      const sid = sessionId();
      const conn = commandConnection();
      if (!sid || !conn || (kind !== 'freehand' && kind !== 'text' && kind !== 'image')) return;
      // Image decals are a DM tool (scenery/set-dressing); strokes/text are shared.
      if (kind === 'image' && conn.role !== 'dm') return;
      const mapId =
        conn.role === 'dm' ? conn.viewMapId ?? getActiveMapId(sid) : getActiveMapId(sid);
      if (!mapId || !getMap(mapId)) return;
      addAnnotation(sid, {
        mapId,
        kind,
        points: Array.isArray(points) ? points.slice(0, 2000).map(Number) : undefined,
        x: Number(x) || 0,
        y: Number(y) || 0,
        text: typeof text === 'string' ? text : undefined,
        color: typeof color === 'string' ? color : '#ffd166',
        url: typeof url === 'string' ? url : undefined,
        width: Number(width) || undefined,
        height: Number(height) || undefined,
        createdBy: rollerName(sid, commandSocketId(), conn.role === 'dm'),
      });
      afterChange();
    });

    // Paste an uploaded image onto the map AS AN OBJECT (draggable token).
    on('object:paste', ({ mapId, x, y, icon, name }) => {
      const sid = sessionId();
      if (!sid || !isDm() || typeof icon !== 'string' || !icon) return;
      const map = getMap(mapId);
      if (!map) return; // the DM pastes onto whatever map they're viewing
      createPastedObject(sid, mapId, Number(x) || 0, Number(y) || 0, icon, (name || 'Object').slice(0, 60));
      afterChange();
    });

    // Cast a summon-tagged spell/ability: spawn its friendly companion token. The
    // caster must own the creature; players may only place on the ACTIVE map. A
    // leveled spell spends a slot (cantrips/abilities don't).
    on('summon:cast', ({ kind, refId, abilityId, mapId, x, y, castLevel, slotPool }) => {
      const sid = sessionId();
      if (!sid || !ownsCreature(kind, refId)) return;
      const map = getMap(mapId);
      if (!map || map.sessionId !== sid) return;
      if (!isDm() && getActiveMapId(sid) !== mapId) return;
      const ent = kind === 'pc' ? getCharacter(refId) : getMonster(refId);
      const blocked=ent && spellActionBlockMessage(ent,{inCombat:!!getSessionById(sid)?.combatRound});
      if(blocked){socket.emit('notice',{message:blocked,durationMs:8000});return;}
      const savedAbility = ent?.sheetAbilities.find((a) => a.id === abilityId);
      const ability = savedAbility ? effectiveSheetAbility(savedAbility) : undefined;
      if (!ability?.summon) return;
      if (spellCombatSupport(ability)?.manualCastOnly) {
        socket.emit('notice', { message: `Use Cast (manual) for ${ability.name}; its catalogue summon represents older rules.` });
        return;
      }
      const name = (ability.summon.name?.trim() || ability.name || 'Summon').slice(0, 60);
      const spectral=spellKey(ability.name)==='spiritual weapon'&&!!linkedSpellProfile(ability);
      if(spectral){
        const error=spiritualWeaponPlacementError(sid,kind,refId,mapId,x,y);
        if(error){socket.emit('notice',{message:error});return;}
      }
      let actualLevel=typeof castLevel==='number'&&castLevel>=(ability.level??1)?Math.min(9,castLevel):ability.level??1;
      const icon = (ability.summon.icon || '✋').slice(0, 2000);
      if(!resumedCastId){
        const held=deferCast(sid,{kind,refId,abilityId,castLevel,slotPool,mapId,x,y},ability,commandConnection()!,commandSocketId(),rollerName(sid,commandSocketId(),isDm()),'summon:cast');
        if(held){scheduleCastTimeout(held);afterChange();return;}
      }
      if(ability.type==='spell')breakInvisibility(kind,refId,'casting a spell');
      // Spend a slot for a leveled spell BEFORE spawning; bail if none left.
      if (kind === 'pc' && ability.type === 'spell' && (ability.level ?? 0) >= 1) {
        const base = ability.level ?? 1;
        const lvl = typeof castLevel === 'number' && castLevel >= base ? castLevel : base;
        // Soft like ability:roll: only a sheet that HAS slots at this level and
        // is out of them is refused — no slot table (homebrew) still summons.
        const { hasSlot, spent,level:spentLevel } = spendSpellSlot(refId, lvl,slotPool==='pact'||slotPool==='spellcasting'?slotPool:undefined);
        actualLevel=spentLevel??lvl;
        if (hasSlot && !spent) {
          socket.emit('notice', { message: `No level ${lvl} spell slots left.` });
          return;
        }
      }
      if(spectral){
        summonSpiritualWeapon({spell:ability.name,abilityId:ability.id,casterKind:kind,casterId:refId,castLevel:actualLevel,dc:0,
          modifier:spellcastingMod(ent!.stats,kind==='pc'?spellcastingKeyFor(ent as Character,ability):ability.roll?.castingAbility)},ability,mapId,x,y);
        afterChange();broadcastSpellCast(io,sid,kind,refId);return;
      }
      if (isConcentrationSpell(ability)) setConcentration(kind, refId, ability.name);
      const summon=createSummon(sid, mapId, Number(x) || 0, Number(y) || 0, name, icon);
      if(ability.type==='spell'&&ability.source!=='custom'&&ability.executionProfile!=='manual'){
        const source=kind==='pc'?getCharacter(refId):getMonster(refId),conc=source?.conditions.find(c=>c.isConcentration);
        setCondition(summon.kind,summon.refId,{id:newId(),label:ability.name,aura:'blue',isConcentration:false,combatEffect:{casterKind:kind,casterId:refId,spell:ability.name,castId:isConcentrationSpell(ability)?conc?.id:newId(),castLevel:actualLevel,summoned:true,concentration:isConcentrationSpell(ability)}});
      }
      addRollLog(sid, {
        roller: rollerName(sid, commandSocketId(), isDm()), label: ability.name, expr: 'Summon', total: 0,
        detail: `${ent!.name}: ${ability.name} — placed ${name}. Manual companion stats, commands, duration, and removal remain with the DM.`,
      });
      afterChange();
      if (ability.type === 'spell') broadcastSpellCast(io, sid, kind, refId);
    });

    on('annotation:remove', ({ id }) => {
      const sid = sessionId();
      const conn = commandConnection();
      if (!sid || !conn || !id) return;
      removeAnnotation(id, conn.role === 'dm' ? undefined : rollerName(sid, commandSocketId(), false));
      afterChange();
    });

    on('annotation:clear', ({ mapId, mineOnly, kind }) => {
      const sid = sessionId();
      const conn = commandConnection();
      if (!sid || !conn || !getMap(mapId)) return;
      const onlyMine = mineOnly || conn.role !== 'dm';
      const k =
        kind === 'freehand' || kind === 'text' || kind === 'image' ? kind : undefined;
      // NOTE: pass the caller's REAL role — annotations store the DM's as
      // createdBy 'DM', so a hardcoded `false` here made the DM's "Clear mine"
      // look for 'Player' and delete nothing.
      clearAnnotations(
        mapId,
        onlyMine ? rollerName(sid, commandSocketId(), conn.role === 'dm') : undefined,
        k,
      );
      afterChange();
    });

    // Reposition an image decal (DM drag); strokes/text never move.
    on('annotation:move', ({ id, x, y }) => {
      if (!sessionId() || !isDm() || !id) return;
      moveAnnotation(id, Number(x) || 0, Number(y) || 0);
      afterChange();
    });

    // Resize an image decal (DM corner-handle drag).
    on('annotation:resize', ({ id, width, height }) => {
      if (!sessionId() || !isDm() || !id) return;
      const w = Math.max(8, Math.min(20000, Number(width) || 0));
      const h = Math.max(8, Math.min(20000, Number(height) || 0));
      resizeAnnotation(id, w, h);
      afterChange();
    });

    // Attach/edit/clear a decal's clickable "shop" popup (DM only).
    on('annotation:setPopup', ({ id, popup }) => {
      if (!sessionId() || !isDm() || !id) return;
      setAnnotationPopup(id, popup ? sanitizePopup(popup) : null);
      afterChange();
    });

    // ---- Map image tiles (DM composes a larger map from several images) ----
    const px = (v: unknown) => Math.max(-100000, Math.min(100000, Number(v) || 0));
    const dim = (v: unknown) => Math.max(1, Math.min(40000, Number(v) || 0));
    on('mapImage:add', ({ mapId, imagePath, x, y, w, h }) => {
      const sid = sessionId();
      if (!sid || !isDm() || !getMap(mapId) || typeof imagePath !== 'string' || !imagePath) return;
      addMapImage(sid, { mapId, imagePath, x: px(x), y: px(y), w: dim(w), h: dim(h) });
      afterChange();
    });
    on('mapImage:move', ({ id, x, y }) => {
      if (!sessionId() || !isDm() || !id) return;
      moveMapImage(id, px(x), px(y));
      afterChange();
    });
    on('mapImage:resize', ({ id, x, y, w, h }) => {
      if (!sessionId() || !isDm() || !id) return;
      resizeMapImage(id, px(x), px(y), dim(w), dim(h));
      afterChange();
    });
    on('mapImage:reorder', ({ id, to }) => {
      if (!sessionId() || !isDm() || !id || (to !== 'front' && to !== 'back')) return;
      reorderMapImage(id, to);
      afterChange();
    });
    on('mapImage:remove', ({ id }) => {
      if (!sessionId() || !isDm() || !id) return;
      deleteMapImage(id);
      afterChange();
    });

    on('session:rename', ({ name }) => {
      const sid = sessionId();
      if (!sid || !isDm()) return;
      renameSession(sid, name);
      afterChange();
    });

    // Import selected maps + their tokens from another session (DM only).
    on('session:importPreview', ({ sourceCode, mapIds }, ack) => {
      const sid = sessionId();
      if (!sid || !isDm() || typeof ack !== 'function') {
        if (typeof ack === 'function') ack([]);
        return;
      }
      const ids = Array.isArray(mapIds)
        ? mapIds.filter((m): m is string => typeof m === 'string').slice(0, 200)
        : [];
      ack(previewImportCharacters(sid, sourceCode, ids));
    });

    on('session:importMaps', ({ sourceCode, mapIds, resolutions }) => {
      const sid = sessionId();
      if (!sid || !isDm()) return;
      if (typeof sourceCode !== 'string' || !Array.isArray(mapIds)) return;
      const ids = mapIds.filter((m): m is string => typeof m === 'string').slice(0, 200);
      const n = importMaps(sid, sourceCode, ids, {
        resolutions: resolutions ?? {},
        isClaimActive: isConnected,
      });
      socket.emit('notice', {
        message: n
          ? `Imported ${n} map${n === 1 ? '' : 's'} from ${sourceCode.toUpperCase()}.`
          : `No maps imported from "${sourceCode}".`,
      });
      if (n) afterChange();
    });

    on('map:delete', ({ mapId }) => {
      const sid = sessionId();
      const conn = commandConnection();
      if (!sid || !conn || conn.role !== 'dm' || !getMap(mapId)) return;
      deleteMap(mapId);
      // If this DM was prepping the deleted map, drop the stale view so their
      // snapshot falls back to the (possibly new) active map.
      if (conn.viewMapId === mapId) {
        setConn(socket.id, { ...conn, viewMapId: getActiveMapId(sid) });
      }
      afterChange();
    });

    on('fog:setLayer', ({ mapId, layer, enabled }) => {
      if (!isDm() || !getMap(mapId)) return;
      setFogLayer(mapId, layer, enabled);
      afterChange();
    });

    on('fog:setVision', ({mapId,layer,enabled})=>{
      const sid=sessionId();
      if(!sid||!isDm()||!setVisionFog(sid,mapId,layer,enabled))return;
      afterChange();
    });

    on('fog:paint', ({ mapId, layer, cells, reveal }) => {
      if (!isDm() || !getMap(mapId) || !Array.isArray(cells)) return;
      paintFog(mapId, layer, cells, reveal);
      afterChange();
    });

    on('fog:cover', ({ mapId, layer }) => {
      const sid = sessionId();
      const map = getMap(mapId);
      if (!sid || !isDm() || !map) return;
      // Snapshot the cells about to be wiped so "cover all" is undoable.
      const before = layer === 'map' ? map.mapFogRevealed : map.tokenFogRevealed;
      captureFogCover(sid, () => setFogRevealed(mapId, layer, before));
      coverFog(mapId, layer);
      afterChange();
    });

    on('token:spawn', (p) => {
      const sid = sessionId();
      if (!sid || !getMap(p.mapId)) return;
      if (!isDm()) {
        // Players may place ONLY their own claimed character, on the active map.
        if (p.kind !== 'pc') return;
        const c = getCharacter(p.refId);
        if (!c || c.claimedBy !== socket.id) return;
        if (p.mapId !== getActiveMapId(sid)) return;
        // Don't pile up duplicates: skip if their token is already on this map.
        const exists = listTokens(p.mapId).some(
          (t) => t.kind === 'pc' && t.refId === p.refId,
        );
        if (exists) return;
      }
      // Monsters spawn from a template -> each placement is a fresh numbered
      // instance (Goblin 1, 2, …). PCs reference their character directly.
      let refId = p.refId;
      if (p.kind === 'monster') {
        const inst = instantiateMonster(p.refId);
        if (!inst) return;
        refId = inst.id;
      }
      createToken({ mapId: p.mapId, kind: p.kind, refId, x: p.x, y: p.y });
      afterChange();
    });

    // ---- Shared: anyone in the session may move/resize tokens (per spec) ----

    on('token:move', ({ tokenId, x, y }, placed) => {
      const moving=getToken(tokenId);
      if (!sessionId()||!moving||getMap(moving.mapId)?.sessionId!==sessionId()) return;
      if(getMap(moving.mapId)?.walls?.some(w=>w.tokenId===moving.id))return;
      const spectral=spiritualWeaponOwner(moving);
      if(spectral){
        if(!isDm()&&(!ownsCreature(spectral.kind,spectral.caster.id)||moving.isHidden))return;
        const blocked=spellActionBlockMessage(spectral.caster,{inCombat:!!getSessionById(spectral.caster.sessionId)?.combatRound});
        const result=blocked?{error:blocked}:moveSpiritualWeapon(moving,x,y);
        if(result.error){socket.emit('notice',{message:result.error});sendSnapshot(io,socket.id);return;}
        afterChange();if(result.point&&typeof placed==='function')placed({x:result.point.x,y:result.point.y});return;
      }
      // Players may move PCs and FRIENDLY creatures (companions/summons) only —
      // enemy/neutral tokens and OBJECTS (chests/doors/traps) are the DM's.
      // Hidden tokens are never sent to players, so a non-DM move of one is
      // stale/forged.
      if (!isDm()) {
        const t = getToken(tokenId);
        const m = t && t.kind === 'monster' ? getMonster(t.refId) : null;
        const creature=t?.kind==='pc'?getCharacter(t.refId):m;
        const command=creature&&activeCommand(creature);
        const commandMoves=command&&!command.combatEffect!.commandResolved&&['Approach','Flee'].includes(command.combatEffect!.commandWord!);
        const blocked=creature && spellActionBlockMessage(commandMoves?{...creature,conditions:creature.conditions.filter(c=>c.combatEffect?.spell!=='Command')}:creature,{inCombat:!!getSessionById(creature.sessionId)?.combatRound});
        if(blocked) {
          socket.emit('notice',{message:blocked,durationMs:8000});
          sendSnapshot(io,socket.id); return;
        }
        const allowed =
          !!t &&
          !t.isHidden &&
          (t.kind !== 'monster' || (!!m && m.disposition === 'friendly' && !m.objectKind));
        if (!allowed) {
          // The client optimistically moved the token (Konva) but the move is
          // rejected and no broadcast follows — re-sync THIS socket so its node
          // snaps back to the server position instead of leaving a client-only
          // ghost (react-konva won't correct an unchanged x/y prop on its own).
          sendSnapshot(io, socket.id);
          return;
        }
      }
      const moved = moveToken(tokenId, x, y, !isDm());
      afterChange();
      if (moved && typeof placed === 'function') placed({x:moved.x,y:moved.y});
    });

    // Live, throttled drag preview (no DB write / snapshot) — same sender gate
    // as token:move so a player can't broadcast a ghost for a token they can't
    // move; recipients are filtered by visibility inside broadcastTokenDrag.
    on('token:drag', ({ tokenId, x, y }) => {
      const sid = sessionId();
      if (!sid) return;
      const t = getToken(tokenId);
      if (!t||getMap(t.mapId)?.sessionId!==sid) return;
      const spectral=spiritualWeaponOwner(t);
      if(spectral){
        if(!isDm()&&(!ownsCreature(spectral.kind,spectral.caster.id)||t.isHidden))return;
        if(spellActionBlock(spectral.caster))return;
        const result=moveSpiritualWeapon(t,x,y,true);
        if(result.point)broadcastTokenDrag(io,sid,socket.id,t,result.point.x,result.point.y);return;
      }
      if (!isDm()) {
        if (t.isHidden) return;
        const creature=t.kind==='pc'?getCharacter(t.refId):getMonster(t.refId);
        const command=creature&&activeCommand(creature);
        const commandMoves=command&&!command.combatEffect!.commandResolved&&['Approach','Flee'].includes(command.combatEffect!.commandWord!);
        if(creature && spellActionBlock(commandMoves?{...creature,conditions:creature.conditions.filter(c=>c.combatEffect?.spell!=='Command')}:creature)) return;
        if (t.kind === 'monster') {
          const m = getMonster(t.refId);
          if (!m || m.disposition !== 'friendly' || m.objectKind) return;
        }
      }
      const point=!isDm()&&Number.isFinite(x)&&Number.isFinite(y)?wallLimitedMove(t,x,y):{x,y};
      broadcastTokenDrag(io, sid, socket.id, t, point.x, point.y);
    });

    on('token:resize', ({ tokenId, widthFt, miniature }) => {
      const sid = sessionId(), token = getToken(tokenId);
      if (!sid || !token || getMap(token.mapId)?.sessionId !== sid || !Number.isFinite(widthFt)) return;
      if (!isDm()) {
        const character = token.kind === 'pc' ? getCharacter(token.refId) : null;
        // A player adjusts only their own visible placement on the active map.
        if (token.isHidden || token.mapId !== getActiveMapId(sid) || !character ||
          character.sessionId !== sid || character.claimedBy !== socket.id) return;
      }
      if (miniature === true) resizeMiniature(tokenId, widthFt);
      else resizeToken(tokenId, widthFt);
      afterChange();
    });
    on('token:setLantern',({tokenId,enabled})=>{
      const sid=sessionId(),token=getToken(tokenId);
      if(!sid||!token||typeof enabled!=='boolean'||getMap(token.mapId)?.sessionId!==sid)return;
      if(!isDm()){
        const character=token.kind==='pc'?getCharacter(token.refId):null;
        if(token.isHidden||token.mapId!==getActiveMapId(sid)||character?.claimedBy!==socket.id)return;
      }
      setTokenLantern(tokenId,enabled);afterChange();
    });

    on('token:setShape', ({ tokenId, shape }) => {
      if (!isDm()) return;
      const ok = ['circle', 'square', 'diamond', 'triangle', 'image'];
      if (!ok.includes(shape)) return;
      setTokenShape(tokenId, shape);
      afterChange();
    });

    on('token:delete', ({ tokenId }) => {
      const sid = sessionId();
      if (!sid || !isDm()) return; // removing tokens is a DM action
      captureTokenDelete(sid, tokenId); // snapshot for undo before it's gone
      deleteToken(tokenId);
      afterChange();
    });

    // Undo the DM's last destructive action (delete token/creature, cover fog).
    on('session:undo', () => {
      const sid = sessionId();
      if (!sid || !isDm()) return;
      const entry = popUndo(sid);
      if (!entry) {
        socket.emit('notice', { message: 'Nothing to undo.' });
        return;
      }
      try {
        entry.run();
        socket.emit('notice', { message: `Undid: ${entry.label}` });
        afterChange();
      } catch {
        // The world moved on (e.g. the map is gone) — the restore rolled back.
        // Put the entry back so the DM can retry once they fix the world, instead
        // of permanently losing the captured rows.
        pushUndo(sid, entry.label, entry.run);
        socket.emit('notice', { message: `Couldn't undo "${entry.label}" — the map changed.` });
      }
    });

    on('token:duplicate', ({ tokenId }) => {
      if (!isDm()) return; // duplicating tokens is a DM action
      duplicateToken(tokenId);
      afterChange();
    });

    on('token:setHidden', ({ tokenId, hidden }) => {
      if (!isDm()) return; // hiding tokens from players is a DM action
      setTokenHidden(tokenId, hidden);
      afterChange();
    });

    // Who joins the fight when initiative is rolled (DM's call).
    on('token:setInCombat', ({ tokenId, inCombat }) => {
      if (!isDm() || !getToken(tokenId)) return;
      setTokenInCombat(tokenId, typeof inCombat === 'boolean' ? inCombat : undefined);
      afterChange();
    });

    on('tokens:copy', ({ fromMapId, toMapId, kinds }) => {
      if (!isDm() || !getMap(fromMapId) || !getMap(toMapId)) return;
      const n = copyTokens(fromMapId, toMapId, kinds);
      afterChange();
      socket.emit('notice', {
        message: n
          ? `Brought ${n} token${n === 1 ? '' : 's'} to this map`
          : 'No new tokens to bring (already here)',
      });
    });

    // A player may only affect their own claimed PC; the DM may affect any
    // creature. (Creatures/objects stay DM-controlled.) Shared by the HP,
    // temp-HP and condition handlers so a player can't damage/heal/status a
    // token they don't own — manual damage on enemies is the DM's job, and
    // real player damage flows through server-computed combat:attack.
    const canEditCreature = (kind: TokenKind, refId: string): boolean =>
      isDm() || (kind === 'pc' && getCharacter(refId)?.claimedBy === socket.id);

    on('damage:apply', ({ kind, refId, amount }) => {
      const sid = sessionId();
      if (!sid || !Number.isFinite(amount) || !canEditCreature(kind, refId)) return;
      // Healing a DEAD creature: ordinary heals can't, so a player gets told why.
      // The DM's manual heal is the deliberate correction path — it revives and
      // reconciles the death state, and the log records that it happened.
      const before = kind === 'pc' ? getCharacter(refId) : getMonster(refId);
      const reviving = !!before && amount < 0 && isDeadEntity(kind, before);
      if (reviving && !isDm()) {
        socket.emit('notice', {
          message: `${before!.name} is dead — only the DM can bring them back.`,
        });
        return;
      }
      applyDamage(kind, refId, amount, undefined, false, undefined, { correction: isDm() });
      if (reviving) {
        addRollLog(sid, {
          roller: 'DM',
          label: 'Revive',
          expr: 'correction',
          total: -amount,
          detail: `DM revived ${before!.name} (correction) — death state cleared, healed ${-amount}`,
        });
      }
      // Damage taken while concentrating prompts a CON save (DC from the amount).
      noteConcentration(sid, kind, refId, amount);
      afterChange();
    });

    // Grant temporary HP — same audience as damage:apply (quick in-combat
    // buff that sets the flat 2024-rules buffer pool, drained before real HP).
    on('tempHp:set', ({ kind, refId, amount }) => {
      if (!sessionId() || !Number.isFinite(amount) || !canEditCreature(kind, refId))
        return;
      setTempHp(kind, refId, amount);
      afterChange();
    });

    on('condition:set', ({ kind, refId, condition }) => {
      if (!sessionId() || !canEditCreature(kind, refId)) return;
      const linked=kind==='monster'&&condition.label.toLowerCase()==='open'?linkedWallDoor(refId):undefined;
      if(linked){const error=setWallDoor(sessionId()!,linked.map.id,linked.door.id,true);if(error)socket.emit('notice',{message:error});else afterChange();return;}
      const full: Condition = { id: newId(), ...condition };
      setCondition(kind, refId, full);
      afterChange();
    });

    on('condition:clear', ({ kind, refId, conditionId }) => {
      if (!sessionId() || !canEditCreature(kind, refId)) return;
      const linked=kind==='monster'&&getMonster(refId)?.conditions.some(c=>c.id===conditionId&&c.label.toLowerCase()==='open')?linkedWallDoor(refId):undefined;
      if(linked){const error=setWallDoor(sessionId()!,linked.map.id,linked.door.id,false);if(error)socket.emit('notice',{message:error});else afterChange();return;}
      clearCondition(kind, refId, conditionId);
      afterChange();
    });

    on('character:claim', ({ characterId }) => {
      const sid = sessionId();
      if (!sid) return;
      const c = getCharacter(characterId);
      if (!c || c.sessionId !== sid) return;
      const pid = commandConnection()?.playerId ?? null;
      if (!isDm()) {
        // A character is "taken" only while another player is actively holding
        // it — live, or within their brief disconnect grace. Once that lapses,
        // anyone may claim (no offline lock). The same player may always reclaim.
        if (
          c.claimedBy &&
          c.claimedBy !== socket.id &&
          isClaimProtected(c.claimedBy) &&
          claimHolderPlayerId(c.claimedBy) !== pid
        ) {
          socket.emit('notice', {
            message: `${c.name} is being played by someone else.`,
          });
          return;
        }
      }
      claimCharacter(characterId, socket.id, isDm() ? null : pid);
      // One owned character per player → drop their claim on any other.
      if (pid) clearOwnershipElsewhere(sid, pid, characterId);
      afterChange();
    });

    // DM fallback: force a character free (e.g. a stuck claim) so anyone can grab
    // it. Clears the live claim and the last-holder record.
    on('character:unlock', ({ characterId }) => {
      if (!isDm() || getCharacter(characterId)?.sessionId !== sessionId()) return;
      setCharacterOwner(characterId, null);
      afterChange();
    });

    on('character:create', (p) => {
      const sid = sessionId();
      if (!sid || !p.name?.trim()) return; // DM or player may add a character
      const className = canonicalClassName(p.className ?? '');
      if (className === null)
        socket.emit('notice', { message: 'That class isn\'t on the list — the character was created without one. Pick a class on its sheet.' });
      const created = createCharacter(sid, {
        name: p.name,
        race: p.race,
        className: className ?? '',
        maxHp: p.maxHp,
        stats: p.stats,
      });
      // A player's new character is theirs from the start.
      const pid = commandConnection()?.playerId;
      if (created && !isDm() && pid) {
        setCharacterOwner(created.id, pid);
        clearOwnershipElsewhere(sid, pid, created.id);
      }
      afterChange();
    });

    on('character:loadFromLibrary', ({ name, claim }) => {
      const sid = sessionId();
      if (!sid || !name?.trim()) return; // DM or player may load a saved sheet
      const created = createCharacterFromLibrary(sid, name);
      // A player loading their own sheet claims (and thereby owns) it.
      if (created && claim && !isDm()) {
        const pid = commandConnection()?.playerId ?? null;
        claimCharacter(created.id, socket.id, pid);
        if (pid) clearOwnershipElsewhere(sid, pid, created.id);
      }
      afterChange();
    });

    on('character:update', ({ characterId, ...patch }) => {
      const c = getCharacter(characterId);
      // The DM or the owning player may edit a character's stat sheet.
      if (!c || c.sessionId !== sessionId() || (!isDm() && c.claimedBy !== socket.id)) return;
      // Classes come from the fixed list (canonicalised; an unchanged legacy
      // name is kept). A name outside it is dropped from the patch — the rest
      // (e.g. an imported sheet's other sections) still applies.
      if (patch.className !== undefined) {
        const canonical = canonicalClassName(patch.className, c.className);
        if (canonical === null) {
          socket.emit('notice', { message: `"${String(patch.className).slice(0, 60)}" isn't one of the 12 classes — pick one from the list (the DM sets a multiclass split with Edit class levels).` });
          delete patch.className;
        } else patch.className = canonical;
      }
      const structuredMulticlass = (c.leveling?.classes?.length ?? 0) > 1;
      const changedRoster = patch.leveling?.classes !== undefined && JSON.stringify(patch.leveling.classes) !== JSON.stringify(c.leveling?.classes);
      if (!isDm() && changedRoster || structuredMulticlass && (patch.className !== undefined && patch.className !== c.className || patch.subclass !== undefined && patch.subclass !== c.subclass || patch.level !== undefined && patch.level !== c.level)) {
        socket.emit('notice', { message: 'Ask the DM to configure the class levels, or use the level-up guide to advance a class.' });
        return;
      }
      if (!isDm() && patch.level !== undefined && patch.level !== c.level) {
        socket.emit('notice', { message: 'Ask the DM to grant a level-up, then use the 2024 level-up guide.' });
        return;
      }
      try { updateCharacter(characterId, patch); }
      catch (error) { socket.emit('notice', { message: error instanceof Error ? error.message : 'The sheet could not be updated. Check its class levels.' }); return; }
      afterChange();
    });

    on('character:levelGrant', (payload, ack) => {
      const sid = sessionId();
      if (typeof ack !== 'function') return;
      if (!payload || typeof payload !== 'object' || typeof payload.characterId !== 'string') { ack({ ok: false, error: 'Choose a character to level up.' }); return; }
      const { characterId } = payload;
      if (!sid || !isDm()) { ack({ ok: false, error: 'Only the DM can grant a level-up.' }); return; }
      const result = grantLevelUp(sid, characterId);
      ack(result); if (result.ok) afterChange();
    });
    on('character:levelConfigureClasses', (payload, ack) => {
      if (typeof ack !== 'function') return;
      if (!payload || typeof payload !== 'object' || typeof payload.characterId !== 'string' || !Array.isArray(payload.classes)) { ack({ ok: false, error: 'Provide the character\'s exact class levels.' }); return; }
      const sid = sessionId();
      if (!sid || !isDm()) { ack({ ok: false, error: 'Only the DM can configure class levels.' }); return; }
      const result = configureLevelUpClasses(sid, payload.characterId, payload.classes);
      ack(result); if (result.ok) afterChange();
    });
    on('character:levelCancel', (payload, ack) => {
      const sid = sessionId();
      if (typeof ack !== 'function') return;
      if (!payload || typeof payload !== 'object' || typeof payload.characterId !== 'string' || typeof payload.grantId !== 'string') { ack({ ok: false, error: 'Choose a pending level-up to cancel.' }); return; }
      const { characterId, grantId } = payload;
      if (!sid || !isDm()) { ack({ ok: false, error: 'Only the DM can cancel a level-up.' }); return; }
      const result = cancelLevelUp(sid, characterId, grantId);
      ack(result); if (result.ok) afterChange();
    });
    on('character:levelPlan', (payload, ack) => {
      if (typeof ack !== 'function') return;
      if (!payload || typeof payload !== 'object' || typeof payload.characterId !== 'string') { ack({ ok: false, error: 'Choose a character to level up.' }); return; }
      const { characterId, subclass, className } = payload;
      const sid = sessionId(), c = getCharacter(characterId);
      if (!sid || !c || c.sessionId !== sid || !isDm() && c.claimedBy !== socket.id) { ack({ ok: false, error: 'Open your claimed character’s level-up guide.' }); return; }
      ack(getLevelUpPlan(sid, characterId, subclass, className));
    });
    on('character:levelPreview', (request, ack) => {
      if (typeof ack !== 'function') return;
      if (!request || typeof request !== 'object' || typeof request.characterId !== 'string') { ack({ ok: false, error: 'Reopen the level-up guide.' }); return; }
      const sid = sessionId(), c = getCharacter(request.characterId);
      if (!sid || !c || c.sessionId !== sid || !isDm() && c.claimedBy !== socket.id) { ack({ ok: false, error: 'Only the character’s player or DM can preview this level-up.' }); return; }
      ack(previewLevelUp(sid, request));
    });
    on('character:levelApply', (request, ack) => {
      if (typeof ack !== 'function') return;
      if (!request || typeof request !== 'object' || typeof request.characterId !== 'string') { ack({ ok: false, error: 'Reopen the level-up guide.' }); return; }
      const sid = sessionId(), c = getCharacter(request.characterId);
      if (!sid || !c || c.sessionId !== sid || !isDm() && c.claimedBy !== socket.id) { ack({ ok: false, error: 'Only the character’s player or DM can finish this level-up.' }); return; }
      const result = applyLevelUp(sid, request);
      ack(result); if (result.ok) afterChange();
    });
    on('character:levelRollHp', (payload) => {
      if (!payload || typeof payload !== 'object' || typeof payload.characterId !== 'string' || typeof payload.grantId !== 'string') { socket.emit('notice', { message: 'Choose a pending level-up before rolling HP.' }); return; }
      const { characterId, grantId, className } = payload;
      const sid = sessionId(), c = getCharacter(characterId);
      if (!sid || !c || c.sessionId !== sid || !isDm() && c.claimedBy !== socket.id) return;
      const result = rollLevelUpHp(sid, rollerName(sid, commandSocketId(), isDm()), characterId, grantId, className);
      if (!result.ok) socket.emit('notice', { message: result.error });
      else afterChange();
    });

    on('character:delete', ({ characterId }) => {
      const sid = sessionId();
      if (!sid || !isDm()) return; // DM-only: prune a PC from the spawn list
      const c = getCharacter(characterId);
      if (!c || c.sessionId !== sid) return;
      // Never delete a character a player is actively holding (still connected).
      if (isConnected(c.claimedBy)) {
        socket.emit('notice', {
          message: `Can't remove ${c.name} — it's claimed by an active player.`,
        });
        return;
      }
      captureCreatureDelete(sid, 'pc', characterId);
      deleteCharacter(characterId);
      afterChange();
    });

    on('character:release', () => {
      const sid = sessionId();
      if (!sid) return;
      releaseClaims(socket.id);
      // An explicit "change character" gives it up for good — drop the
      // last-holder record so they don't get auto-reclaimed back onto it.
      const pid = commandConnection()?.playerId;
      if (pid) clearOwnershipElsewhere(sid, pid);
      afterChange();
    });

    // ---- Resources & items (DM or the owning player) ----
    const ownsCharacter = (characterId: string): boolean => {
      const c = getCharacter(characterId);
      return !!c && c.sessionId === sessionId() && (isDm() || c.claimedBy === commandSocketId());
    };
    // Who may edit/roll sheet abilities on a creature: a PC's owner or the DM;
    // monster sheet abilities are DM-authored (like monster:update).
    const ownsCreature = (kind: 'pc' | 'monster', refId: string): boolean =>
      kind === 'pc' ? ownsCharacter(refId) : kind === 'monster' && isDm() &&
        !!sessionId() && monsterInSession(refId, sessionId()!);

    // Casting and applying a roll may only target a token in the caller's
    // current, role-shaped map. Reuse visibility shaping so hidden/fog/staged
    // tokens cannot be attacked by replaying an old or guessed token id.
    const canDirectlyTargetToken = (tokenId: string): boolean => {
      const conn = commandConnection();
      if (!conn) return false;
      const snapshot = buildSnapshot(conn.sessionId, conn.role, conn.viewMapId, commandSocketId(), conn.playerId);
      return !!snapshot?.tokens.some((token) => token.id === tokenId && !token.sharedSightOnly &&
        (conn.role==='dm'||visionContains(snapshot.playerVision,token.x,token.y)));
    };

    const targetBehindWall=(targetId:string,origin:{kind:'pc'|'monster';refId:string}|string):boolean=>{
      const target=getToken(targetId);
      const actor=typeof origin==='string'?getToken(origin):target&&listTokens(target.mapId).find(t=>t.kind===origin.kind&&t.refId===origin.refId);
      if(!target||!actor||actor.mapId!==target.mapId)return false;
      if(hasLineOfSight(actor,target,getMap(actor.mapId)?.walls))return false;
      socket.emit('notice',{message:'A wall or closed door blocks this target. Move or open the door first.'});
      return true;
    };

    on('resource:set', ({ characterId, group, key, max, used, remove, preserveMax, recharge }) => {
      if ((group !== 'spellSlots' && group !== 'resources') ||
          typeof key !== 'string' || !key.trim() ||
          ['__proto__', 'constructor', 'prototype'].includes(key) || !ownsCharacter(characterId)) return;
      setResource(characterId, group, key, { max, used, remove, preserveMax, recharge });
      afterChange();
    });

    on('item:set', ({ characterId, item }) => {
      if (!item?.name?.trim() || !ownsCharacter(characterId)) return;
      setItem(characterId, item);
      afterChange();
    });

    on('item:remove', ({ characterId, itemId }) => {
      if (!ownsCharacter(characterId)) return;
      removeItem(characterId, itemId);
      afterChange();
    });

    // Drink a potion: the server re-reads what the item does, rolls it, applies
    // the healing/temp HP and spends one from the stack.
    on('rest:party', ({ kind }) => {
      const sid = sessionId();
      if (!sid || !isDm() || (kind !== 'short' && kind !== 'long')) return;
      const outcomes = partyRest(sid, kind);
      addChatMessage(sid, 'DM', 'dm', describeRest(kind, outcomes));
      io.to(roomName(sid)).emit('fx:rest', { kind });
      afterChange();
    });

    on('rest:character', ({ characterId, kind }) => {
      const sid = sessionId();
      if (!sid || !isDm() || (kind !== 'short' && kind !== 'long') || typeof characterId !== 'string') return;
      const outcome = restCharacter(sid, characterId, kind);
      if (!outcome) return;
      addChatMessage(sid, 'DM', 'dm', describeRest(kind, [outcome]));
      afterChange();
    });

    on('hitDice:spend', ({ characterId, count, die }) => {
      const sid = sessionId();
      if (!sid || typeof characterId !== 'string' || !ownsCharacter(characterId)) return;
      const n = Number(count);
      if (!Number.isFinite(n) || n < 1) return;
      if(die !== undefined && ![6,8,10,12].includes(die)) return;
      const result = spendHitDice(sid, rollerName(sid, commandSocketId(), isDm()), characterId, Math.min(20, n),die);
      if (!result.ok) { socket.emit('notice', { message: result.reason }); return; }
      afterChange();
    });

    on('item:use', ({ characterId, itemId }) => {
      const sid = sessionId();
      if (!sid || typeof itemId !== 'string' || !ownsCharacter(characterId)) return;
      const drinker = getCharacter(characterId);
      if (drinker && isDeadEntity('pc', drinker)) {
        socket.emit('notice', { message: `${drinker.name} is dead — the item is kept.` });
        return;
      }
      const ok = useConsumable(
        sid,
        rollerName(sid, commandSocketId(), isDm()),
        characterId,
        itemId,
      );
      if (ok) afterChange();
    });

    // ---- Object loot (DM fills containers; anyone who owns the target PC takes) ----
    on('object:setLoot', ({ monsterId, loot }) => {
      if (!isDm()) return; // only the DM stocks loot (object OR creature)
      const sid = sessionId();
      if (!sid || !monsterInSession(monsterId, sid)) return;
      setLoot(monsterId, loot);
      afterChange();
    });

    on('loot:take', ({ monsterId, characterId, itemId, gold, all }) => {
      const sid = sessionId();
      if (!sid || !monsterInSession(monsterId, sid)) return; // this session only
      const m = getMonster(monsterId);
      // The taker must own the destination character; players can only take from
      // a container/corpse whose contents are actually revealed to them.
      if (!m || !ownsCharacter(characterId)) return;
      if (!isDm() && !lootVisibleToPlayers(m)) return;
      takeLoot(monsterId, characterId, { itemId, gold, all });
      afterChange();
    });

    // A character attempts to disarm a trap (DM or the owning player). On success
    // the trap flips to "Disarmed" so it can't be triggered.
    on('trap:disarm', ({ monsterId, characterId, advantage }) => {
      const sid = sessionId();
      if (!sid || !ownsCharacter(characterId)) return;
      const trap = getMonster(monsterId);
      const c = getCharacter(characterId);
      if (!trap || trap.objectKind !== 'trap' || !c) return;
      const adv = advantage === 'adv' || advantage === 'dis' ? advantage : undefined;
      const { success } = resolveTrapDisarm(
        sid,
        rollerName(sid, commandSocketId(), isDm()),
        c,
        trap,
        adv,
      );
      if (success) {
        const armed = trap.conditions.find((x) => x.label.toLowerCase() === 'armed');
        if (armed) clearCondition('monster', monsterId, armed.id);
        if (!trap.conditions.some((x) => x.label.toLowerCase() === 'disarmed'))
          setCondition('monster', monsterId, {
            id: newId(),
            label: 'Disarmed',
            aura: 'green',
            isConcentration: false,
          });
      }
      afterChange();
    });

    // Player/DM interacts with a door or chest: open it (if not locked) or pick
    // its lock (a DEX check vs the object's DC; success clears Locked).
    on('object:interact', ({ monsterId, characterId, action }) => {
      const sid = sessionId();
      if (!sid) return;
      const obj = getMonster(monsterId);
      if (!obj || obj.sessionId!==sid || (obj.objectKind !== 'door' && obj.objectKind !== 'chest')) return;
      const linked=linkedWallDoor(monsterId);
      if(linked&&!usableWallDoor(linked.map,linked.door))return;
      if(linked&&action==='open'){
        const error=setWallDoor(sid,linked.map.id,linked.door.id,!linked.door.open);
        if(error)socket.emit('notice',{message:error});else afterChange();
        return;
      }
      const has = (label: string) =>
        obj.conditions.find((c) => c.label.toLowerCase() === label.toLowerCase());
      const locked = has('locked');

      if (action === 'unlock') {
        // Anyone who owns a PC may attempt the pick; the DM may force it open.
        if (!locked) return;
        if (isDm()) {
          clearCondition('monster', monsterId, locked.id);
          afterChange();
          return;
        }
        const c = characterId ? getCharacter(characterId) : undefined;
        if (!c || !ownsCharacter(c.id)) return;
        const { success } = resolveObjectCheck(
          sid,
          rollerName(sid, commandSocketId(), false),
          c,
          obj,
          'unlock',
        );
        if (success) clearCondition('monster', monsterId, locked.id);
        afterChange();
        return;
      }

      // Open/close toggle — blocked while Locked (pick it first).
      if (action === 'open') {
        if (locked) return;
        const open = has('open');
        if (open) clearCondition('monster', monsterId, open.id);
        else
          setCondition('monster', monsterId, {
            id: newId(),
            label: 'Open',
            aura: 'green',
            isConcentration: false,
          });
        afterChange();
      }
    });

    // ---- Sheet spells/abilities (PC owner, or the DM for creatures) ----
    on('ability:set', ({ kind, refId, ability }) => {
      if (!ability?.name?.trim() || !ownsCreature(kind, refId)) return;
      const entity=kind==='pc'?getCharacter(refId):getMonster(refId);
      const previous=entity?.sheetAbilities.find(a=>a.id===ability.id);
      const blocked=entity && spellActionBlockMessage(entity,{inCombat:!!getSessionById(entity.sessionId)?.combatRound});
      if(blocked && ability.stance?.active && !previous?.stance?.active) {
        socket.emit('notice',{message:blocked,durationMs:8000});return;
      }
      // Validate any dice expressions BEFORE persisting: an unrollable string
      // (e.g. "lol") stored here would make every later ability:roll throw. The
      // roll is resolved server-side, so a bad expression is a client bug/abuse.
      for (const expr of [ability.roll?.dice, ability.roll?.scaleDice]) {
        if (expr && !isValidDiceExpression(expr)) {
          socket.emit('notice', { message: `Invalid dice: "${expr}"` });
          return;
        }
      }
      setSheetAbility(kind, refId, ability);
      afterChange();
    });

    on('ability:remove', ({ kind, refId, abilityId }) => {
      if (!ownsCreature(kind, refId)) return;
      removeSheetAbility(kind, refId, abilityId);
      afterChange();
    });

    on('ability:reorder', ({ kind, refId, orderedIds }) => {
      if (!Array.isArray(orderedIds) || !ownsCreature(kind, refId)) return;
      reorderSheetAbilities(kind, refId, orderedIds.filter((x) => typeof x === 'string'));
      afterChange();
    });

    on('ability:setRecharge', ({ kind, refId, abilityId, spent }) => {
      const sid = sessionId();
      if (!sid || (kind !== 'pc' && kind !== 'monster') || typeof abilityId !== 'string' || !ownsCreature(kind, refId)) return;
      if (!setAbilityRechargeSpent(kind, refId, abilityId, !!spent)) return;
      afterChange();
    });

    const handleAbilityRoll=(payload:AbilityRollPayload)=>{
      const {kind,refId,abilityId,castLevel,slotPool,advantage,targetTokenId,damageType,area,destination,commandWord:word,targetTokenIds,dispelTarget}=payload;
      const sid = sessionId();
      if (!sid || !ownsCreature(kind, refId)) return;
      const adv = advantage === 'adv' || advantage === 'dis' ? advantage : undefined;
      const tgt = typeof targetTokenId === 'string' ? targetTokenId : undefined;
      if(tgt&&targetBehindWall(tgt,{kind,refId}))return;
      if (tgt !== undefined && !canDirectlyTargetToken(tgt)) {
        socket.emit('notice', { message: 'Choose a creature you can see yourself. Party sightings cannot be targeted.' });
        return;
      }
      const cast = typeof castLevel === 'number' && Number.isFinite(castLevel)
        ? Math.min(9, Math.max(0, Math.floor(castLevel))) : undefined;
      const selectedDamageType = typeof damageType === 'string' ? damageType.trim().toLowerCase() : undefined;
      const validDamageChoice = (ability: import('../../shared/types.js').SheetAbility): boolean => {
        const choices = spellDamageTypeChoices(ability, cast);
        if (choices.length && (!selectedDamageType || !choices.includes(selectedDamageType))) {
          socket.emit('notice', { message: `Choose a damage type for ${ability.name}: ${choices.join(', ')}.` });
          return false;
        }
        return true;
      };
      const roller = rollerName(sid, commandSocketId(), isDm());
      const casterEntity=kind==='pc'?getCharacter(refId):getMonster(refId);
      if(area){
        const a=casterEntity?.sheetAbilities.find(a=>a.id===abilityId);
        const error=a&&areaPlacementError(sid,kind,refId,a,cast,area);
        if(!a||error){socket.emit('notice',{message:error??'Unknown spell.'});return;}
        if(!isDm()){
          const view=buildSnapshot(sid,'player',null,commandSocketId()),map=view?.map;
          if(!map||map.id!==area.mapId||area.points.some(p=>!visionContains(view.playerVision,p.x,p.y)||(map.mapFogEnabled&&!map.mapFogRevealed.includes(`${Math.floor(p.x/map.gridSizePx)},${Math.floor(p.y/map.gridSizePx)}`)))){
            socket.emit('notice',{message:'Place the spell area somewhere you can see yourself.'});return;
          }
        }
      }
      const blocked=casterEntity && spellActionBlockMessage(casterEntity,{inCombat:!!getSessionById(sid)?.combatRound});
      if(blocked) {
        socket.emit('notice',{message:blocked,durationMs:8000}); return;
      }

      const selectedAbility=casterEntity?.sheetAbilities.find(a=>a.id===abilityId);
      if(!selectedAbility)return;
      const advanced=advancedSpell(selectedAbility);
      if(advanced==='counterspell'){socket.emit('notice',{message:'Counterspell is offered when a visible opponent starts casting within 60 ft.'});return;}
      if(!resumedCastId&&heldCasts(sid).some(c=>c.payload.kind===kind&&c.payload.refId===refId)){socket.emit('notice',{message:'Your previous spell is waiting for a Counterspell reaction.'});return;}
      const requestedSlot=kind==='pc'?(selectedAbility.level??0)>0?selectSpellSlot(getCharacter(refId)!,cast??selectedAbility.level!,slotPool):undefined:undefined;
      if(advanced&&(selectedAbility.level??0)>0&&kind==='pc'&&!requestedSlot?.remaining){socket.emit('notice',{message:`No spell slot available for ${selectedAbility.name}.`});return;}
      const invisTargets=targetTokenIds??(tgt?[tgt]:[]);
      if(advanced==='invisibility'){
        if(!Array.isArray(invisTargets)||invisTargets.some(id=>typeof id!=='string'||!canDirectlyTargetToken(id))){socket.emit('notice',{message:'Choose visible willing targets.'});return;}
        const error=invisibilityError(sid,kind,refId,requestedSlot?.level??cast??2,invisTargets);
        if(error){socket.emit('notice',{message:error});return;}
      }
      if(advanced==='dispel magic'){
        if((requestedSlot?.level??cast??3)<3){socket.emit('notice',{message:'Dispel Magic requires a level 3 or higher slot.'});return;}
        const error=dispelTargetError(sid,kind,refId,dispelTarget);
        if(error){socket.emit('notice',{message:error});return;}
        if(!isDm()){
          const view=buildSnapshot(sid,'player',null,commandSocketId());
          const point=dispelTarget&&'effectId'in dispelTarget?view?.measurements.find(m=>m.id===dispelTarget.effectId)?.origin:undefined;
          if(dispelTarget&&'tokenId'in dispelTarget?!canDirectlyTargetToken(dispelTarget.tokenId):!point||!visionContains(view?.playerVision,point.x,point.y)){
            socket.emit('notice',{message:'Choose a magical effect or creature you can see yourself.'});return;
          }
        }
      }
      if(!resumedCastId){
        const held=deferCast(sid,payload,selectedAbility,commandConnection()!,commandSocketId(),roller);
        if(held){
          scheduleCastTimeout(held);
          afterChange();return;
        }
      }
      if(selectedAbility.type==='spell')breakInvisibility(kind,refId,'casting a spell');
      if(advanced==='invisibility'){
        const error=castInvisibility(sid,roller,kind,refId,requestedSlot?.level??cast??2,invisTargets);
        if(error){socket.emit('notice',{message:error});afterChange();return;}
        if(requestedSlot)spendSpellSlot(refId,requestedSlot.level,requestedSlot.pool);
        afterChange();broadcastSpellCast(io,sid,kind,refId);return;
      }
      if(advanced==='dispel magic'){
        const message=castDispelMagic(sid,roller,kind,refId,abilityId,requestedSlot?.level??cast??3,dispelTarget!,adv);
        if(requestedSlot)spendSpellSlot(refId,requestedSlot.level,requestedSlot.pool);
        setAbilityRechargeSpent(kind,refId,abilityId,true);
        if(message)socket.emit('notice',{message,durationMs:8000});
        afterChange();broadcastSpellCast(io,sid,kind,refId);return;
      }
      if(selectedAbility&&isCommandSpell(selectedAbility)){
        const chosen=commandWord(word);
        if(!chosen){socket.emit('notice',{message:'Choose a command or enter one word.'});return;}
        if(!isStandardCommand(chosen)&&!getSessionById(sid)?.commandCustomWords){socket.emit('notice',{message:'The DM must enable custom Command words in Combat settings.'});return;}
        const slot=kind==='pc'?selectSpellSlot(getCharacter(refId)!,Math.max(1,cast??1),slotPool):undefined;
        if(kind==='pc'&&!slot?.remaining){socket.emit('notice',{message:'No spell slot available for Command.'});return;}
        const error=castCommand(sid,roller,kind,refId,selectedAbility,slot?.level??Math.max(1,cast??1),chosen,tgt);
        if(error){socket.emit('notice',{message:error});return;}
        if(slot)spendSpellSlot(refId,slot.level,slot.pool);
        setAbilityRechargeSpent(kind,refId,selectedAbility.id,true);
        afterChange();broadcastSpellCast(io,sid,kind,refId);return;
      }
      if(selectedAbility&&partySpell(selectedAbility)==='shield'){
        socket.emit('notice',{message:'Shield is offered as a reaction when an attack hits you or Magic Missile targets you.'});return;
      }
      if(selectedAbility&&partySpell(selectedAbility)==='misty step'){
        const error=mistyStepError(sid,kind,refId,destination);
        if(error){socket.emit('notice',{message:error});return;}
        if(!isDm()){
          const view=buildSnapshot(sid,'player',null,commandSocketId()),map=view?.map,d=destination!;
          if(!map||map.id!==d.mapId||!visionContains(view.playerVision,d.x,d.y)||map.mapFogEnabled&&!map.mapFogRevealed.includes(`${Math.floor(d.x/map.gridSizePx)},${Math.floor(d.y/map.gridSizePx)}`)){
            socket.emit('notice',{message:'Choose a destination you can see yourself.'});return;
          }
        }
        if(kind==='pc'){
          const slot=selectSpellSlot(getCharacter(refId)!,Math.max(2,cast??2),slotPool);
          if(!slot?.remaining||!spendSpellSlot(refId,slot.level,slotPool)){socket.emit('notice',{message:'No spell slot available for Misty Step.'});return;}
        }
        teleportMistyStep(sid,kind,refId,destination!);afterChange();broadcastSpellCast(io,sid,kind,refId);return;
      }
      if (kind === 'monster') {
        const m = getMonster(refId);
        const ability = m?.sheetAbilities.find((a) => a.id === abilityId);
        if (!m || !ability || !validDamageChoice(ability)) return;
        const targetError=tgt && spellControlTargetError(sid,ability,tgt);
        if(targetError){socket.emit('notice',{message:targetError});return;}
        // CR-based DC/to-hit; no spell slots for creatures. A limited-use action
        // (breath weapon) is spent by using it; the DM re-readies it manually.
        if (resolveMonsterSheetAbility(sid, roller, m, ability, cast, adv, area?undefined:tgt, selectedDamageType,area)) {
          setAbilityRechargeSpent('monster', m.id, ability.id, true);
          afterChange();
          if (ability.type === 'spell') broadcastSpellCast(io, sid, kind, refId);
        } else if(JSON.stringify(m.conditions)!==JSON.stringify(getMonster(m.id)?.conditions)) {
          // Ending self-Haste can incapacitate this caster before a replacement
          // concentration spell starts. Its ended buff still needs publishing.
          afterChange();socket.emit('notice',{message:spellActionBlockMessage(getMonster(m.id)!,{inCombat:!!getSessionById(sid)?.combatRound})??'Previous concentration ended. Recover from Haste lethargy before casting a new concentration spell.',durationMs:8000});
        }
        return;
      }

      const c = getCharacter(refId);
      const ability = c?.sheetAbilities.find((a) => a.id === abilityId);
      if (!c || !ability || !validDamageChoice(ability)) return;
      const targetError=tgt && spellControlTargetError(sid,ability,tgt);
      if(targetError){socket.emit('notice',{message:targetError});return;}
      // Pact Magic: a Warlock's leveled spell is cast at the pact-slot level (the
      // only slots they have), so its dice scale like it — roll at that level.
      const preferredPool = slotPool === 'pact' || slotPool === 'spellcasting' ? slotPool : undefined;
      const requested = castSlotLevel(ability, cast);
      const slot = requested === null ? undefined : selectSpellSlot(c,requested,preferredPool);
      const castAt = slot?.level ?? cast;
      if(partySpell(ability)&&requested!==null&&!slot?.remaining){socket.emit('notice',{message:`No spell slot available for ${ability.name}.`});return;}
      if (markSpell(ability)) {
        const needed=castAt??1;
        if (!slot || slot.remaining<=0) {
          socket.emit('notice',{message:'No spell slot available for this mark.'}); return;
        }
        if(!tgt || (!isDm()&&!buildSnapshot(sid,'player',null,commandSocketId())?.tokens.some(t=>t.id===tgt))) {
          socket.emit('notice',{message:'Choose a visible creature for the mark.'}); return;
        }
      }
      const ok = resolveAbilityRoll(sid, roller, c, ability, castAt, adv, area?undefined:tgt, selectedDamageType,area);
      if(!ok&&area)socket.emit('notice',{message:'Could not place the area. Check its range, connected pieces, and chosen target limit.'});
      if(!ok && JSON.stringify(c.conditions)!==JSON.stringify(getCharacter(c.id)?.conditions)) {
        afterChange();socket.emit('notice',{message:spellActionBlockMessage(getCharacter(c.id)!,{inCombat:!!getSessionById(sid)?.combatRound})??'Previous concentration ended. Recover from Haste lethargy before casting a new concentration spell.',durationMs:8000});
      }
      if(!ok && markSpell(ability)) socket.emit('notice',{message:'Choose a creature within 90 feet of your token.'});
      // Casting a leveled spell (or activating a spell-backed stance like
      // Hunter's Mark) spends a slot at the level it was cast.
      // Casting a leveled spell, activating a spell-backed stance, or rolling a
      // slot-fuelled ability spends a slot at the level it was cast.
      const slotLevel = castSlotLevel(ability, castAt);
      const leveled = slotLevel !== null;
      if (ok && slotLevel !== null) {
        const { hasSlot, spent } = spendSpellSlot(refId, slotLevel,slot?.pool ?? preferredPool);
        if (hasSlot && !spent) {
          socket.emit('notice', {
            message: `No level-${slotLevel} spell slot remaining for ${ability.name}.`,
          });
        }
      }
      // A non-spell ability that shares its name with a class-resource counter
      // (Second Wind, Bardic Inspiration…) spends one use on cast. Soft: an
      // empty pool never blocks the roll, it just nudges the player.
      if (ok && !leveled) {
        const { matched, spent } = spendResourceForAbility(refId, ability.name,ability.sourceClass);
        if (matched && !spent) {
          socket.emit('notice', {
            message: `No uses of ${ability.name} remaining.`,
          });
        }
      }
      if (ok) {
        afterChange();
        if (ability.type === 'spell' || (ability.type === 'stance' && leveled)) broadcastSpellCast(io, sid, kind, refId);
      }
    };
    on('ability:roll',handleAbilityRoll);
    on('spell:counterspell', ({castId,reactorTokenId,pass,level,slotPool,continueCast})=>{
      const sid=sessionId(),held=sid&&getHeldCast(sid,castId);if(!sid||!held)return;
      let resume:typeof held|undefined;
      if(continueCast){
        if(!isDm()&&!(Date.now()>=held.expiresAt&&ownsCreature(held.payload.kind,held.payload.refId)))return;
        finishHeldCast(held);resume=held;
      }else{
        const reactor=reactorTokenId&&getToken(reactorTokenId);
        if(!reactor||getMap(reactor.mapId)?.sessionId!==sid||!ownsCreature(reactor.kind,reactor.refId))return;
        const result=counterspellChoice(sid,castId,reactor.id,!!pass,level??3,slotPool);
        if(result.error){socket.emit('notice',{message:result.error});return;}
        resume=result.resume;
        if(result.interrupted&&held.payload.rollId&&held.event==='spell:shield'){
          resolveShield(sid,held.roller,held.payload.rollId,true,1,undefined,true);
        }else if(result.interrupted&&held.payload.rollId){
          const entry=getRollEntry(held.payload.rollId,sid),p=entry?.pending;
          const actor=held.payload.kind==='pc'?getCharacter(held.payload.refId):null,ability=actor?.sheetAbilities.find(a=>a.id===held.payload.abilityId);
          if(actor&&ability)setSheetAbility('pc',actor.id,{...ability,hitUsedTurn:`bonus:${turnKey(sid)}`});
          if(entry?.smite)setRollSmite(entry.id,{...entry.smite,used:true});
          if(p&&!p.done){setRollPending(entry!.id,{...p,hitOptions:p.hitOptions?{...p.hitOptions,used:[...p.hitOptions.used,abilityKey({name:held.spell})]}:undefined});resolveAttackDamage(sid,held.roller,entry!.id);}
        }
      }
      if(resume){
        const previous=activeCommandConnection;
        activeCommandConnection=resume.source;
        const original=resume.payload.kind==='pc'?getCharacter(resume.payload.refId):undefined;
        resumedSocketId=original?.ownerId&&original.ownerId===resume.source.playerId?original.claimedBy??resume.socketId:resume.socketId;resumedCastId=resume.id;
        try{domainHandlers.get(resume.event)?.(resume.payload);}finally{activeCommandConnection=previous;resumedSocketId=undefined;resumedCastId=undefined;}
      }
      afterChange();
    });


    // Roll a death saving throw for a downed PC (owner or DM).
    on('death:roll', ({ characterId }) => {
      const sid = sessionId();
      if (!sid || !ownsCharacter(characterId)) return;
      if (resolveDeathSave(sid, characterId)) afterChange();
    });

    // Shared in-session chat (anyone in the session).
    on('chat:send', ({ text, speakAsTokenId, whisperTo, imageId, replyToMessageId },ack) => {
      const sid = sessionId();
      const body = typeof text === 'string' ? text.trim() : '';
      const fail=(error:string)=>{socket.emit('notice',{message:error});ack?.({ok:false,error});};
      const conn=commandConnection();
      if (!sid||!conn){fail('Join a campaign before sending chat.');return;}
      if(!body&&!imageId){fail('Write a message or attach an image.');return;}
      if(whisperTo!==undefined&&typeof whisperTo!=='string'){fail('Choose a valid chat recipient.');return;}
      if(whisperTo){
        if(/^\/(?:r|roll|ask|recap)(?:\s|$)/i.test(body)){fail('Dice and AI commands use Everyone chat. Private chat sends text and images.');return;}
        try {
          let privacy;
          if(replyToMessageId){
            const source=typeof replyToMessageId==='string'?listChat(sid,1000).find(m=>m.id===replyToMessageId):undefined;
            if(!source?.privacy||source.privacy.channel!=='whisper'||!privateChatVisible(source.privacy,conn.role,conn.playerId,!!source.dmOnly)||source.dmOnly||!source.privacy.audience.length){fail('That conversation is no longer available. Choose a recipient to start a new whisper.');return;}
            // Reuse the original participants even if one PC has changed owners.
            privacy=source.privacy;
          }else privacy=chatAudience(conn,socket.id,whisperTo,listCharacters(sid));
          const image=typeof imageId==='string'?chatImageForSend(conn,imageId):undefined;
          if(imageId&&!image){fail('Attach an image you uploaded in this campaign.');return;}
          addChatMessage(sid,rollerName(sid,commandSocketId(),isDm()),isDm()?'dm':'player',body,false,[],{privacy,image});
          afterChange();
          ack?.({ok:true});
        }catch(error){fail(error instanceof Error?error.message:'The private message could not be sent.');}
        return;
      }
      if(replyToMessageId){fail('Choose a private conversation before replying.');return;}
      if(imageId){fail('Choose a private recipient or Party chat before attaching an image.');return;}
      // "/roll 2d6+3 [adv|dis]" (or "/r …") typed into chat rolls server-side
      // into the shared roll log instead of posting a message — the combined
      // feed shows the result inline where the chat line would have been.
      const cmd = parseRollCommand(body);
      if (cmd) {
        const result = rollDice(cmd.expr, cmd.advantage);
        if (!result) {
          socket.emit('notice', { message: `Invalid dice: "${cmd.expr}"` });
          ack?.({ok:false,error:`Invalid dice: "${cmd.expr}"`});
          return;
        }
        const roller = rollerName(sid, commandSocketId(), isDm());
        addRollLog(sid, {
          roller,
          label: '',
          expr: result.expr,
          total: result.total,
          detail: result.detail,
          reveal: diceReveal(roller, result),
        });
        afterChange();
        ack?.({ok:true});
        return;
      }
      // The DM may "speak as" a selected token (NPC/monster/PC): the message is
      // attributed to that token's name and the bubble pops over it. Falls back to
      // a plain "DM" message if no/invalid token is given.
      const speakToken =
        isDm() && typeof speakAsTokenId === 'string' ? getToken(speakAsTokenId) : null;
      const speakEntity = speakToken
        ? speakToken.kind === 'pc'
          ? getCharacter(speakToken.refId)
          : getMonster(speakToken.refId)
        : null;
      // Only speak as a token belonging to THIS session.
      const speakAs = speakEntity && speakEntity.sessionId === sid ? speakEntity : null;
      const sender = speakAs ? speakAs.name : rollerName(sid, commandSocketId(), isDm());
      addChatMessage(sid, sender, isDm() ? 'dm' : 'player', body);
      // Pop the words in a speech bubble over the speaker's token. Players bubble
      // over their claimed PC; the DM bubbles over the token they're speaking as.
      if (speakAs) {
        broadcastSay(io, sid, speakToken!.refId, body.slice(0, 240));
      } else if (!isDm()) {
        const refId = getClaimedCharacterId(sid, socket.id);
        if (refId) broadcastSay(io, sid, refId, body.slice(0, 240));
      }
      afterChange();
      ack?.({ok:true});
    });

    // Ephemeral "I'm typing" ping → a typing bubble over the player's PC token.
    on('chat:typing', ({ typing }) => {
      const sid = sessionId();
      if (!sid || isDm()) return; // DMs have no PC token to bubble over
      const refId = getClaimedCharacterId(sid, socket.id);
      if (refId) broadcastTyping(io, sid, socket.id, refId, !!typing);
    });

    // Live "laser pointer": relay my cursor to others on the same map.
    on('cursor:move', ({ x, y, mapId }) => {
      const sid = sessionId();
      if (!sid || !Number.isFinite(x) || !Number.isFinite(y) || typeof mapId !== 'string') return;
      broadcastCursor(io, sid, socket.id, rollerName(sid, commandSocketId(), isDm()), x, y, mapId);
    });
    on('cursor:hide', () => {
      const sid = sessionId();
      if (sid) broadcastCursorHide(io, sid, socket.id);
    });

    // DM-only rules assistant. The DM's question and the answer are posted as
    // DM-only chat messages (filtered from players in visibility.ts) and answered
    // by a local Ollama model, falling back to Gemini. Fail-safe: posts a notice
    // if no backend is reachable.
    on('assistant:ask', async ({ question, backend }) => {
      const sid = sessionId();
      const q = typeof question === 'string' ? question.trim() : '';
      if (!sid || !isDm() || !q) return;
      // Sanitize the chat's backend choice (prefer + an Ollama model name).
      const opts =
        backend && typeof backend === 'object'
          ? {
              prefer: backend.prefer === 'local' ? ('local' as const) : ('gemini' as const),
              ...(typeof backend.ollamaModel === 'string'
                ? { ollamaModel: backend.ollamaModel.slice(0, 80) }
                : {}),
            }
          : {};
      // Show the question in the DM's feed immediately, then think. Other chat
      // keeps flowing while we await (the handler yields, never blocks).
      addChatMessage(sid, 'DM', 'dm', `❓ ${q.slice(0, 500)}`, true);
      afterChange();
      // A cancellable, long-running request (the Stop button aborts it).
      const controller = new AbortController();
      assistantInFlight.set(socket.id, controller);
      socket.emit('assistant:thinking', { thinking: true });
      let result: { answer: string | null; pages: number[] } = { answer: null, pages: [] };
      try {
        result = await answerRules(q, { ...opts, signal: controller.signal, timeoutMs: 600_000 });
      } catch (err) {
        console.warn('  [assistant] failed:', (err as Error).message);
      } finally {
        assistantInFlight.delete(socket.id);
        socket.emit('assistant:thinking', { thinking: false });
      }
      if (controller.signal.aborted) {
        // Stopped by the DM — note it, don't post a stale answer.
        addChatMessage(sid, '📖 Rules Assistant', 'dm', '⏹ Stopped.', true);
        afterChange();
        socket.emit('notice', { message: 'Rules assistant stopped', aiDone: true });
        return;
      }
      addChatMessage(
        sid,
        '📖 Rules Assistant',
        'dm',
        result.answer ??
          'Rules assistant is unavailable. Start a local Ollama server (or set a Gemini API key in Settings) and try again.',
        true,
        result.answer ? result.pages : [],
      );
      afterChange();
      socket.emit('notice', { message: result.answer ? 'Rules assistant answered' : 'Rules assistant unavailable', aiDone: true });
    });

    // DM-only: stop the in-flight rules-assistant request.
    on('assistant:cancel', () => {
      assistantInFlight.get(socket.id)?.abort();
    });

    // DM-only: "Previously on…" recap of recent rolls + chat, posted to chat for
    // everyone (so returning players can catch up).
    on('assistant:recap', async () => {
      const sid = sessionId();
      if (!sid || !isDm()) return;
      const rolls = listRollLog(sid, 60).map((r) => ({
        t: r.createdAt,
        line: `[roll] ${r.roller}: ${r.detail}${r.description ? ` (${r.description})` : ''}`,
      }));
      const chat = listChat(sid, 60)
        .filter((c) => !c.dmOnly&&!c.privacy)
        .map((c) => ({ t: c.createdAt, line: `[chat] ${c.sender}: ${c.text}` }));
      const transcript = [...rolls, ...chat]
        .sort((a, b) => a.t - b.t)
        .map((x) => x.line)
        .join('\n')
        .slice(-6000); // keep the most recent if very long
      let recap: string | null = null;
      try {
        recap = await recapSession(transcript);
      } catch (err) {
        console.warn('  [recap] failed:', (err as Error).message);
      }
      if (recap) {
        addChatMessage(sid, '📜 Recap', 'dm', recap); // visible to everyone
        afterChange();
      }
      socket.emit('notice', { message: recap ? 'Session recap posted' : 'Could not generate a recap', aiDone: true });
    });

    // DM-only: make a creature speak an AI-generated in-character line, floated
    // as a speech bubble over its token (reuses the chat-bubble system).
    on('creature:speak', async ({ tokenId }) => {
      const sid = sessionId();
      if (!sid || !isDm()) return;
      const t = getToken(tokenId);
      if (!t || t.kind === 'pc') return; // voice monsters/NPCs, not PCs
      const m = getMonster(t.refId);
      if (!m) return;
      const conds = m.conditions?.map((c) => c.label).join(', ');
      const describe =
        `Creature: ${m.name}${m.creatureType ? ` (${m.creatureType})` : ''}. ` +
        `Disposition toward the party: ${m.disposition ?? 'enemy'}. ` +
        `${m.maxHp > 0 && m.curHp <= m.maxHp * 0.35 ? 'It is badly wounded. ' : ''}` +
        `${conds ? `Current conditions: ${conds}. ` : ''}` +
        `Give its one spoken line right now.`;
      let line: string | null = null;
      try {
        line = await creatureLine(describe);
      } catch (err) {
        console.warn('  [speak] failed:', (err as Error).message);
      }
      if (line) broadcastSay(io, sid, t.refId, line);
      socket.emit('notice', { message: line ? `${m.name} speaks` : 'No AI backend for dialogue', aiDone: true });
    });

    // Apply a caster-owned logged spell to a visible target: save, damage, dart,
    // or an individual ray. The DM may resolve any cast in their own session.
    on('save:resolve', ({ rollId, tokenId, advantage, instanceIndex }) => {
      const sid = sessionId();
      if (!sid) return;
      if (typeof rollId !== 'string' || typeof tokenId !== 'string') return;
      // Caster ownership never grants access to another session's source roll.
      const entry = getRollEntry(rollId, sid);
      if (!entry?.apply || !canDirectlyTargetToken(tokenId)) return;
      const owner = entry.apply.owner;
      const caster = owner ? getCharacter(owner) : null;
      const allowed =
        isDm() || (caster?.sessionId === sid && caster.claimedBy === socket.id);
      if (!allowed) return;
      const targetError=spellApplyTargetError(sid,entry,tokenId);
      if(targetError){socket.emit('notice',{message:targetError});return;}
      const adv = advantage === 'adv' || advantage === 'dis' ? advantage : undefined;
      const idx = typeof instanceIndex === 'number' ? instanceIndex : undefined;
      resolveForcedSave(sid, rollId, tokenId, adv, idx);
      afterChange();
    });

    on('skill:roll', ({ characterId, skill, advantage }) => {
      const sid = sessionId();
      if (!sid || typeof skill !== 'string' || !ownsCharacter(characterId)) return;
      const c = getCharacter(characterId);
      if (!c) return;
      const adv = advantage === 'adv' || advantage === 'dis' ? advantage : undefined;
      const ok = resolveSkillRoll(
        sid,
        rollerName(sid, commandSocketId(), isDm()),
        c,
        skill,
        adv,
      );
      if (ok) afterChange();
    });

    // Click a stat block ability to roll that creature's saving throw. A PC's
    // save may be rolled by its owner or the DM; a monster's by the DM only.
    on('save:roll', ({ kind, refId, ability, advantage }) => {
      const sid = sessionId();
      if (!sid || typeof ability !== 'string' || typeof refId !== 'string') return;
      const allowed = kind === 'pc' ? ownsCharacter(refId) : isDm();
      if (!allowed) return;
      const adv = advantage === 'adv' || advantage === 'dis' ? advantage : undefined;
      const ok = resolveSave(sid, rollerName(sid, commandSocketId(), isDm()), kind, refId, ability, adv);
      if (ok) afterChange();
    });

    on('check:roll', ({ kind, refId, ability, advantage }) => {
      const sid = sessionId();
      if (!sid || typeof ability !== 'string' || typeof refId !== 'string') return;
      const allowed = kind === 'pc' ? ownsCharacter(refId) : isDm();
      if (!allowed) return;
      const adv = advantage === 'adv' || advantage === 'dis' ? advantage : undefined;
      const ok = resolveCheck(sid, rollerName(sid, commandSocketId(), isDm()), kind, refId, ability, adv);
      if (ok) afterChange();
    });

    on('ai:fillCharacter', async ({ characterId }) => {
      const c = getCharacter(characterId);
      if (!c || (!isDm() && c.claimedBy !== socket.id)) return;
      const res = await aiFillCharacter(characterId);
      if (res.ok) {
        afterChange();
        socket.emit('notice', {
          message: `Filled ${res.filled} missing field${
            res.filled === 1 ? '' : 's'
          } with AI`,
          aiDone: true,
        });
      } else {
        socket.emit('notice', {
          message:
            res.reason === 'no-key'
              ? 'No AI key configured'
              : res.reason === 'nothing'
              ? 'Nothing missing to fill'
              : 'AI lookup failed',
          aiDone: true,
        });
      }
    });

    on('ai:createCharacter', async ({ description }) => {
      const sid = sessionId();
      if (!sid || !description?.trim()) return; // DM or player may generate
      const res = await aiCreateCharacter(sid, description.trim());
      if (res.ok) {
        afterChange();
        socket.emit('notice', { message: `Created ${res.character.name} with AI`, aiDone: true });
      } else {
        socket.emit('notice', {
          message:
            res.reason === 'no-key' ? 'No AI key configured' : 'AI lookup failed',
          aiDone: true,
        });
      }
    });

    // ---- Bulk multi-select token edits ----

    on('tokens:damage', ({ tokenIds, amount }) => {
      // Bulk damage/heal is a DM-only (Data-view multi-select) tool, like its
      // tokens:setCondition / tokens:clearConditions siblings below.
      if (!isDm() || !Array.isArray(tokenIds) || !Number.isFinite(amount)) return;
      // DM-only, so a bulk heal is the same deliberate correction as a single one.
      damageTokens(tokenIds, amount, { correction: true });
      afterChange();
    });

    on('tokens:setHidden', ({ tokenIds, hidden }) => {
      if (!isDm() || !Array.isArray(tokenIds)) return;
      setTokensHidden(tokenIds, hidden);
      afterChange();
    });

    // Bulk combat participation (the initiative panel's All / None) — one event
    // and ONE broadcast rather than N of each.
    on('tokens:setInCombat', ({ tokenIds, inCombat }) => {
      if (!isDm() || !Array.isArray(tokenIds)) return;
      const flag = typeof inCombat === 'boolean' ? inCombat : undefined;
      for (const id of tokenIds.slice(0, 500)) {
        if (typeof id === 'string' && getToken(id)) setTokenInCombat(id, flag);
      }
      afterChange();
    });

    on('tokens:setCondition', ({ tokenIds, condition }) => {
      // Bulk condition edits are a DM-only (Data view) tool.
      if (!isDm() || !Array.isArray(tokenIds) || !condition) return;
      setTokensCondition(tokenIds, condition);
      afterChange();
    });

    on('tokens:clearConditions', ({ tokenIds }) => {
      if (!isDm() || !Array.isArray(tokenIds)) return;
      clearTokensConditions(tokenIds);
      afterChange();
    });

    on('monster:create', (p) => {
      const sid = sessionId();
      if (!sid || !isDm() || !p.name?.trim()) return; // DM action
      createMonsterTemplate(sid, {
        name: p.name,
        maxHp: p.maxHp,
        creatureType: p.creatureType,
        modelType: p.modelType, modelColor: p.modelColor, visualTags: p.visualTags,
        level: p.level,
        armorClass: p.armorClass,
        speed: p.speed,
        stats: p.stats,
        resistances: p.resistances,
        immunities: p.immunities,
        weaknesses: p.weaknesses,
        actions: p.actions,
        abilities: p.abilities,
        sheetAbilities: p.sheetAbilities,
        crBaseline: p.crBaseline,
        weapons: p.weapons,
        icon: p.icon,
        disposition: p.disposition,
        objectKind: p.objectKind,
        objectDc: p.objectDc,
        source: p.source,
      });
      afterChange();
    });

    on('monster:update', ({ monsterId, ...patch }) => {
      const sid = sessionId();
      // Editing creature stats is a DM action, scoped to the DM's own session.
      if (!sid || !isDm() || !monsterInSession(monsterId, sid)) return;
      updateMonster(monsterId, patch);
      afterChange();
    });

    on('monster:delete', ({ monsterId }) => {
      const sid = sessionId();
      if (!sid || !isDm() || !monsterInSession(monsterId, sid)) return;
      captureCreatureDelete(sid, 'monster', monsterId);
      deleteMonster(monsterId);
      afterChange();
    });

    // Shared party notes — any joined client (DM or player) may edit, scoped to
    // their own session so notes can't leak/write across sessions.
    on('creature:setNotes', ({ monsterId, notes }) => {
      const sid = sessionId();
      if (!sid || getMonster(monsterId)?.sessionId !== sid) return;
      setMonsterPlayerNotes(monsterId, notes);
      afterChange();
    });

    on('ai:fillCreature', async ({ monsterId }) => {
      const sid = sessionId();
      if (!sid || !isDm() || !monsterInSession(monsterId, sid)) return;
      const res = await aiFillCreature(monsterId);
      if (res.ok) {
        afterChange();
        socket.emit('notice', {
          message: `Filled ${res.filled} missing field${
            res.filled === 1 ? '' : 's'
          } with AI`,
          aiDone: true,
        });
      } else {
        const msg =
          res.reason === 'no-key'
            ? 'No AI key configured'
            : res.reason === 'nothing'
            ? 'Nothing missing to fill'
            : 'AI lookup failed';
        socket.emit('notice', { message: msg, aiDone: true });
      }
    });

    on('tokens:setIcon', ({ tokenIds, icon }) => {
      if (!isDm() || !Array.isArray(tokenIds)) return;
      for (const id of tokenIds) {
        const t = getToken(id);
        if (t) setEntityIcon(t.kind, t.refId, icon);
      }
      afterChange();
    });

    // Bulk disposition (the multi-select panel): flip a whole ambush to friendly
    // in one go. Disposition drives what PLAYERS see of a creature, so it stays
    // DM-only and PC tokens — which have no disposition — are skipped.
    on('tokens:setDisposition', ({ tokenIds, disposition }) => {
      const sid = sessionId();
      if (!sid || !isDm() || !Array.isArray(tokenIds)) return;
      if (!['friendly', 'neutral', 'enemy'].includes(disposition)) return;
      const ids = tokenIds
        .slice(0, 500)
        .filter((id): id is string => typeof id === 'string')
        .filter((id) => {
          const t = getToken(id);
          return !!t && monsterInSession(t.refId, sid);
        });
      setTokensDisposition(ids, disposition);
      afterChange();
    });

    on('tokens:setHideCombatRole', ({ tokenIds, hide }) => {
      if (!isDm() || !Array.isArray(tokenIds)) return;
      setTokensHideCombatRole(tokenIds, hide);
      afterChange();
    });

    on('tokens:setCombatRole', ({ tokenIds, role }) => {
      if (!isDm() || !Array.isArray(tokenIds)) return;
      setTokensCombatRole(tokenIds, role);
      afterChange();
    });

    on('initiative:set', ({ tokenId, initiative }) => {
      if (!sessionId() || !isDm()) return;
      setTokenInitiative(tokenId, initiative);
      afterChange();
    });

    on('initiative:start', () => {
      const sid = sessionId();
      if (!sid || !isDm()) return;
      const before = getSessionById(sid);
      if (!before?.activeMapId || before.initiativePending) return;
      startCombat(sid, isConnected);
      if (!getSessionById(sid)?.initiativePending) afterRollCommit(()=>io.to(roomName(sid)).emit('fx:initiative', {mapId: before.activeMapId!}));
      afterChange();
    });
    on('initiative:rollMine', ({tokenId}) => {
      const sid = sessionId();
      if (!sid || typeof tokenId !== 'string') return;
      if (!rollPlayerInitiative(sid, tokenId, socket.id)) {
        socket.emit('notice', {message: 'No initiative roll is waiting for your character.'});
        return;
      }
      afterChange();
    });

    on('initiative:rollAll', () => {
      const sid = sessionId();
      if (!sid || !isDm()) return;
      const activeMapId = getSessionById(sid)?.activeMapId;
      if (!activeMapId) return;
      // Roll-all resets combat: re-roll everyone, start at the top, round 1.
      afterRollCommit(()=>io.to(roomName(sid)).emit('fx:initiative', {mapId: activeMapId}));
      setInitiativePending(sid, false);
      rollAllInitiative(activeMapId);
      setActiveTurn(sid, firstInInitiative(activeMapId));
      setCombatRound(sid, 1);
      afterChange();
    });

    on('initiative:rollMissing', () => {
      const sid = sessionId();
      if (!sid || !isDm()) return;
      const activeMapId = getSessionById(sid)?.activeMapId;
      if (!activeMapId) return;
      if (!getSessionById(sid)?.activeTurnTokenId && !getSessionById(sid)?.initiativePending) afterRollCommit(()=>io.to(roomName(sid)).emit('fx:initiative', {mapId: activeMapId}));
      // Only roll latecomers; if combat hasn't started, highlight the top and
      // open round 1. Mid-fight, the round counter is left alone.
      rollMissingInitiative(activeMapId);
      const ses = getSessionById(sid);
      if (!ses?.activeTurnTokenId) {
        setActiveTurn(sid, firstInInitiative(activeMapId));
        if (!ses?.combatRound) setCombatRound(sid, 1);
      }
      afterChange();
    });

    on('initiative:next', () => {
      const sid = sessionId();
      if (!sid || !isDm()) return;
      advanceTurn(sid);
      afterChange();
    });

    // A player may end the turn ONLY when the active combatant is their own
    // claimed PC (the DM still advances anyone via initiative:next).
    on('initiative:endTurn', () => {
      const sid = sessionId();
      if (!sid) return;
      if (!isDm()) {
        const activeId = getSessionById(sid)?.activeTurnTokenId;
        if (!activeId) return;
        const tok = getToken(activeId);
        const mine = getClaimedCharacterId(sid, socket.id);
        if (!tok || tok.kind !== 'pc' || !mine || tok.refId !== mine) return;
      }
      advanceTurn(sid);
      afterChange();
    });

    on('initiative:clear', () => {
      const sid = sessionId();
      if (!sid || !isDm()) return;
      clearInitiative(sid); // also zeroes the round counter
      afterChange();
    });

    // DM edits the round counter directly (fix a miscount / re-count after a
    // narrative break) without touching anyone's rolls.
    on('initiative:setRound', ({ round }) => {
      const sid = sessionId();
      if (!sid || !isDm() || !Number.isFinite(round)) return;
      setCombatRound(sid, Math.min(999, Math.max(0, Math.round(round))));
      afterChange();
    });

    on('session:setHideDmRolls', ({ hide }) => {
      const sid = sessionId();
      if (!sid || !isDm()) return;
      setHideDmRolls(sid, !!hide);
      afterChange();
    });

    on('dice:roll', ({ expr, label, advantage }) => {
      const sid = sessionId();
      if (!sid || typeof expr !== 'string') return;
      const result = rollDice(expr.trim(), advantage);
      if (!result) {
        socket.emit('notice', { message: `Invalid dice: "${expr}"` });
        return;
      }
      const roller = rollerName(sid, commandSocketId(), isDm());
      const rollLabel = (label ?? '').slice(0, 40);
      addRollLog(sid, {
        roller,
        label: rollLabel,
        expr: result.expr,
        total: result.total,
        detail: result.detail,
        reveal: diceReveal(roller, result, rollLabel || undefined),
      });
      afterChange();
    });

    on('dice:clearLog', () => {
      const sid = sessionId();
      if (!sid || !isDm()) return; // clearing the shared roll log is a DM action
      clearRollLog(sid);
      afterChange();
    });

    on('spell:repeat', ({kind,refId,conditionId,targetTokenId,advantage,area}) => {
      const sid=sessionId();if(!sid||!ownsCreature(kind,refId)||typeof conditionId!=='string')return;
      const caster=kind==='pc'?getCharacter(refId):getMonster(refId);
      if(!caster)return;
      const blocked=spellActionBlockMessage(caster,{inCombat:!!getSessionById(sid)?.combatRound});
      if(blocked){socket.emit('notice',{message:blocked,durationMs:8000});return;}
      const fx=caster.conditions.find(c=>c.id===conditionId)?.combatEffect;
      if(area){const a=caster.sheetAbilities.find(a=>a.id===fx?.abilityId),error=a&&areaPlacementError(sid,kind,refId,a,fx?.castLevel,area);
        if(!a||fx?.spell.toLowerCase()!=='call lightning'||error){socket.emit('notice',{message:error??'That spell does not use an area repeat.'});return;}
        if(!isDm()){const view=buildSnapshot(sid,'player',null,socket.id),map=view?.map;
          if(!map||map.id!==area.mapId||area.points.some(p=>!visionContains(view.playerVision,p.x,p.y)||(map.mapFogEnabled&&!map.mapFogRevealed.includes(`${Math.floor(p.x/map.gridSizePx)},${Math.floor(p.y/map.gridSizePx)}`)))){socket.emit('notice',{message:'Place the spell area somewhere you can see yourself.'});return;}}
      }
      const target=/^(witch bolt|heat metal)$/i.test(fx?.spell??'')?fx?.targetTokenId:targetTokenId??fx?.targetTokenId;
      if(!area&&(typeof target!=='string'||!canDirectlyTargetToken(target))){socket.emit('notice',{message:'Choose a target you can see yourself.'});return;}
      const error=repeatSpell(sid,isDm()?'DM':caster.name,kind,refId,conditionId,target,advantage==='adv'||advantage==='dis'?advantage:undefined,area);
      if(error){socket.emit('notice',{message:error});return;}
      broadcastSpellCast(io,sid,kind,refId);afterChange();
    });
    on('spell:dropHeatedItem', ({kind,refId,conditionId})=>{
      if(!ownsCreature(kind,refId))return;
      const target=kind==='pc'?getCharacter(refId):getMonster(refId),condition=target?.conditions.find(c=>c.id===conditionId),fx=condition?.combatEffect;
      if(!target||!fx||fx.spell.toLowerCase()!=='heat metal'||condition!.isConcentration||fx.spellAction)return;
      const caster=fx.casterKind==='pc'?getCharacter(fx.casterId):getMonster(fx.casterId);
      for(const c of caster?.conditions??[])if(c.combatEffect?.spellAction&&c.combatEffect.castId===fx.castId)
        setCondition(fx.casterKind,fx.casterId,{...c,combatEffect:{...c.combatEffect,itemDropped:true}});
      clearCondition(kind,refId,conditionId);
      addRollLog(target.sessionId,{roller:isDm()?'DM':target.name,label:'Heat Metal',expr:'Drop heated item',total:0,detail:`${target.name} drops the heated held item; its penalties end. Worn armor must be removed normally.`});afterChange();
    });

    on('haste:action', ({kind,refId,action}) => {
      const sid=sessionId();
      if(!sid || !['dash','disengage','hide','utilize'].includes(action)) return;
      const entity=kind==='pc'?getCharacter(refId):kind==='monster'?getMonster(refId):null;
      if(!entity || entity.sessionId!==sid || !(isDm() || kind==='pc' && (entity as import('../../shared/types.js').Character).claimedBy===socket.id ||
          kind==='monster' && (entity as import('../../shared/types.js').Monster).disposition==='friendly')) return;
      const blocked=spellActionBlockMessage(entity,{inCombat:!!getSessionById(sid)?.combatRound});
      if(blocked){socket.emit('notice',{message:blocked,durationMs:8000});return;}
      const active=getToken(getSessionById(sid)?.activeTurnTokenId??'');
      const haste=activeHasteCondition(entity);
      if(!active || active.kind!==kind || active.refId!==refId || !haste || haste.combatEffect?.hasteActionUsed) {
        socket.emit('notice',{message:'Use Haste’s extra action once on the affected creature’s turn.'}); return;
      }
      setCondition(kind,refId,{...haste,combatEffect:{...haste.combatEffect!,casterKind:haste.combatEffect?.casterKind??kind,
        casterId:haste.combatEffect?.casterId??refId,spell:'Haste',hasteActionUsed:action}});
      addRollLog(sid,{roller:isDm()?'DM':entity.name,label:'Haste extra action',expr:'Haste',total:0,
        detail:`${entity.name}: uses Haste’s extra action to ${action}. ${action==='hide'?'Roll the appropriate Stealth check.':action==='utilize'?'Resolve the object interaction with the DM.':action==='dash'?'Adds one additional movement allowance for this turn.':'Movement does not provoke Opportunity Attacks this turn.'}`});
      afterChange();
    });

    on(
      'combat:attack',
      ({ attackerTokenId, targetTokenId, weaponIndex, advantage, offhand, twoHanded, hasteAction }) => {
        if (!isDm() && !canDirectlyTargetToken(targetTokenId)) {
          socket.emit('notice', {message:'You must see this creature yourself to target it. Party sightings are for awareness only.'});
          return;
        }
        const sid = sessionId();
        if (!sid) return;
        const at = getToken(attackerTokenId);
        if (!at) return;
        if(targetBehindWall(targetTokenId,attackerTokenId))return;
        const attackerEntity=at.kind==='pc'?getCharacter(at.refId):getMonster(at.refId);
        const blocked=attackerEntity && spellActionBlockMessage(attackerEntity,{inCombat:!!getSessionById(sid)?.combatRound});
        if(blocked) {
          socket.emit('notice',{message:blocked,durationMs:8000}); return;
        }
        // DM may attack with anyone. A player may attack with their own claimed
        // PC, or with a friendly creature (e.g. a companion/summon they control).
        if (!isDm()) {
          if (at.kind === 'pc') {
            const ch = getCharacter(at.refId);
            if (!ch || ch.claimedBy !== socket.id) return;
          } else {
            const m = getMonster(at.refId);
            if (!m || m.disposition !== 'friendly') return;
          }
        }
        // Attribute the roll to the ATTACKING creature, not the player's own PC,
        // so attacking as a friendly companion/summon reads as that creature (for
        // a player's own token the name is the same). The DM stays "DM".
        const attackerName =
          at.kind === 'pc' ? getCharacter(at.refId)?.name : getMonster(at.refId)?.name;
        const roller = isDm()
          ? 'DM'
          : attackerName ?? rollerName(sid, commandSocketId(), false);
        // In manual-damage mode the deferred damage is rolled by the DM or by
        // the attacking PLAYER — identified by the character they've claimed, so
        // it works even when they're attacking with a companion/summon token.
        const mine = isDm()
          ? undefined
          : listCharacters(sid).find((c) => c.claimedBy === socket.id)?.id;
        const haste=attackerEntity&&activeHasteCondition(attackerEntity);
        if(hasteAction && (!haste || haste.combatEffect?.hasteActionUsed || getSessionById(sid)?.activeTurnTokenId!==at.id ||
            !Number.isInteger(weaponIndex) || !attackerEntity?.weapons[weaponIndex])) {
          socket.emit('notice',{message:'Haste permits one weapon attack with its extra action on your turn.'});return;
        }
        const attacked=resolveAttack(
          sid,
          roller,
          attackerTokenId,
          targetTokenId,
          weaponIndex,
          advantage,
          !!offhand,
          !!twoHanded,
          mine,
        );
        // This hit may have dropped the Haste caster and ended concentration.
        // Record spending only on the still-existing buff, never resurrect it.
        const remainingHaste=attacked && hasteAction && haste && (at.kind==='pc'?getCharacter(at.refId):getMonster(at.refId))?.conditions.find(c=>c.id===haste.id);
        if(remainingHaste) setCondition(at.kind,at.refId,{...remainingHaste,combatEffect:{...remainingHaste.combatEffect!,
          casterKind:remainingHaste.combatEffect?.casterKind??at.kind,casterId:remainingHaste.combatEffect?.casterId??at.refId,
          spell:'Haste',hasteActionUsed:'attack'}});
        afterChange();
      },
    );

    // The second half of a two-step attack: roll the parked damage and apply it.
    // The DM may resolve any of them; a player only their own attack's.
    on('spell:shield', ({rollId,pass,level,slotPool})=>{
      const sid=sessionId(),entry=sid&&typeof rollId==='string'?getRollEntry(rollId,sid):undefined,p=entry?.pending;
      if(!sid||!p?.shield||!ownsCreature(p.target.kind,p.target.refId))return;
      if(!resumedCastId&&heldCasts(sid).some(c=>c.payload.rollId===rollId)){socket.emit('notice',{message:'Waiting for a Counterspell reaction.'});return;}
      const caster=p.target.kind==='pc'?getCharacter(p.target.refId):getMonster(p.target.refId),ability=caster?.sheetAbilities.find(a=>a.id===p.shield!.abilityId);
      if(!pass&&ability&&!resumedCastId){
        const held=deferCast(sid,{kind:p.target.kind,refId:p.target.refId,abilityId:ability.id,rollId,level,slotPool},ability,commandConnection()!,commandSocketId(),rollerName(sid,commandSocketId(),isDm()),'spell:shield');
        if(held){scheduleCastTimeout(held);afterChange();return;}
      }
      const result=resolveShield(sid,rollerName(sid,commandSocketId(),isDm()),rollId,!!pass,level??1,slotPool);
      if(!result.ok)socket.emit('notice',{message:result.reason!});
      else if(result.blocked)socket.emit('notice',{message:'Blocked!',presentation:'blocked',durationMs:4000});
      afterChange();
    });
    on('spell:wake', ({actorTokenId,targetTokenId})=>{
      const sid=sessionId(),actor=typeof actorTokenId==='string'?getToken(actorTokenId):null;
      if(!sid||!actor||!ownsCreature(actor.kind,actor.refId)||typeof targetTokenId!=='string'||!canDirectlyTargetToken(targetTokenId))return;
      const error=shakeAwake(sid,actorTokenId,targetTokenId);if(error)socket.emit('notice',{message:error});else afterChange();
    });

    on('combat:damage', ({ rollId }) => {
      if(sessionId()&&heldCasts(sessionId()!).some(c=>c.payload.rollId===rollId)){socket.emit('notice',{message:'Waiting for a Counterspell reaction.'});return;}
      const sid = sessionId();
      if (!sid || typeof rollId !== 'string') return;
      const entry = getRollEntry(rollId, sid);
      if (!entry?.pending) return;
      if(entry.pending.shield){socket.emit('notice',{message:'Waiting for the defender to cast Shield or pass.'});return;}
      const owner = entry.pending.owner;
      const caster = owner ? getCharacter(owner) : null;
      const allowed =
        isDm() || (caster?.sessionId === sid && caster.claimedBy === socket.id);
      if (!allowed) return;
      if (resolveAttackDamage(sid, rollerName(sid, commandSocketId(), isDm()), rollId))
        afterChange();
    });

    // The caster or DM continues the stored cast; players can only choose visible targets.
    on('combat:hitFeature', ({rollId,abilityId,level,slotPool}) => {
      const held=sessionId()&&heldCasts(sessionId()!).some(c=>c.payload.rollId===rollId);if(held&&!resumedCastId){socket.emit('notice',{message:'Waiting for a Counterspell reaction.'});return;}
      const sid=sessionId(); if(!sid||typeof rollId!=='string'||typeof abilityId!=='string') return;
      const pending=getRollEntry(rollId,sid)?.pending;
      const ch=pending?.attacker.kind==='pc'?getCharacter(pending.attacker.refId):null;
      if(!ch||(!isDm()&&ch.claimedBy!==commandSocketId())) return;

      const ab=ch.sheetAbilities.find(a=>a.id===abilityId);
      if(ab?.type==='spell'&&!resumedCastId&&pending?.hitOptions?.abilityIds.includes(abilityId)&&!pending.done){
        const held=deferCast(sid,{kind:'pc',refId:ch.id,abilityId,rollId,level,slotPool},ab,commandConnection()!,commandSocketId(),rollerName(sid,commandSocketId(),isDm()),'combat:hitFeature');
        if(held){scheduleCastTimeout(held);afterChange();return;}
      }
      if(ab?.type==='spell')breakInvisibility('pc',ch.id,'casting a spell');
      const result=resolveHitFeature(sid,rollerName(sid,commandSocketId(),isDm()),rollId,abilityId,level,slotPool==='pact'||slotPool==='spellcasting'?slotPool:undefined);
      if(!result.ok) socket.emit('notice',{message:result.reason!});
      afterChange();
    });
    on('combat:moveMark', ({kind,refId,abilityId,targetTokenId}) => {
      const sid=sessionId(); if(!sid||!canEditCreature(kind,refId)) return;
      const ch=kind==='pc'?getCharacter(refId):getMonster(refId);
      const ab=ch?.sheetAbilities.find(a=>a.id===abilityId);
      if(!ab||!canDirectlyTargetToken(targetTokenId)) return;
      if(!castMark(sid,kind,refId,ab,targetTokenId,1,true)) socket.emit('notice',{message:'The mark can move only after its target reaches 0 HP, to a visible creature within 90 feet.'});
      afterChange();
    });
    on('combat:orbLeap', ({rollId,targetTokenId,end}) => {
      const sid=sessionId();
      if (!sid || typeof rollId !== 'string') return;
      const apply=getRollEntry(rollId,sid)?.apply;
      const owner=apply?.owner ? getCharacter(apply.owner) : null;
      if (!isDm() && (!owner || owner.claimedBy !== commandSocketId())) return;
      if (!end && (typeof targetTokenId !== 'string' || !canDirectlyTargetToken(targetTokenId))) {
        socket.emit('notice',{message:'Choose a visible creature for the orb.'}); return;
      }
      const result=resolveOrbLeap(sid,rollId,targetTokenId,!!end);
      if (!result.ok) socket.emit('notice',{message:result.reason});
      afterChange();
    });

    on('combat:riposte', ({opportunityId, weaponIndex, pass}) => {
      const sid = sessionId();
      if (!sid || typeof opportunityId !== 'string') return;
      const offer = listRipostes(sid).find(o => o.id === opportunityId);
      const ch = offer ? getCharacter(offer.owner) : null;
      if (!ch || (!isDm() && (ch.claimedBy !== socket.id || (!pass && !canDirectlyTargetToken(offer!.attackerTokenId))))) return;
      const result = resolveRiposte(sid, isDm() ? 'DM' : ch.name, opportunityId, weaponIndex, !!pass);
      if (!result.ok) socket.emit('notice', {message: result.reason});
      afterChange();
    });

    on('combat:maneuver', ({rollId, abilityId}) => {
      const sid = sessionId();
      if (!sid || typeof rollId !== 'string' || typeof abilityId !== 'string') return;
      const pending = getRollEntry(rollId, sid)?.pending;
      const ch = pending?.attacker.kind === 'pc' ? getCharacter(pending.attacker.refId) : null;
      if (!ch || ch.sessionId !== sid || (!isDm() && ch.claimedBy !== socket.id)) return;
      const result = resolveManeuver(sid, rollerName(sid, commandSocketId(), isDm()), rollId, abilityId);
      if (!result.ok) socket.emit('notice', {message: result.reason});
      else afterChange();
    });

    on('combat:smite', ({ rollId, level }) => {
      if(!resumedCastId&&sessionId()&&heldCasts(sessionId()!).some(c=>c.payload.rollId===rollId)){socket.emit('notice',{message:'Waiting for a Counterspell reaction.'});return;}
      const sid = sessionId();
      if (!sid || typeof rollId !== 'string') return;
      const choice =
        level === 'free' ? 'free' : typeof level==='string' && /^pact:[1-5]$/.test(level) ? level :
          typeof level==='number' && Number.isInteger(level) && level >= 1 && level <= 9 ? level : null;
      if (choice === null) return;
      const sm = getRollEntry(rollId, sid)?.smite;
      if (!sm) return;
      const caster = getCharacter(sm.owner);
      if(!caster)return;
      const allowed = isDm() || (caster.sessionId === sid && caster.claimedBy === commandSocketId());
      if (!allowed) return;

      const opportunity=getRollEntry(rollId,sid)?.smite,ab=opportunity&&caster.sheetAbilities.find(a=>a.id===opportunity.abilityId);
      if(ab&&!resumedCastId&&opportunity&&!opportunity.used){
        const held=deferCast(sid,{kind:'pc',refId:caster.id,abilityId:ab.id,rollId,level:choice},ab,commandConnection()!,commandSocketId(),rollerName(sid,commandSocketId(),isDm()),'combat:smite');
        if(held){scheduleCastTimeout(held);afterChange();return;}
      }
      if(ab)breakInvisibility('pc',caster.id,'casting a spell');
      const res = resolveSmite(sid, rollerName(sid, commandSocketId(), isDm()), rollId, choice);
      if (!res.ok) {
        socket.emit('notice', { message: res.reason });
        return;
      }
      afterChange();
    });

    on('session:setManualDamage', ({ manual }) => {
      const sid = sessionId();
      if (!sid || !isDm()) return;
      setManualDamage(sid, !!manual);
      afterChange();
    });

    on('session:setCommandCustomWords',({enabled})=>{
      const sid=sessionId();if(!sid||!isDm()||typeof enabled!=='boolean')return;
      db.prepare('UPDATE sessions SET command_custom_words=? WHERE id=?').run(enabled?1:0,sid);afterChange();
    });
    on('spell:commandResolve',({kind,refId,conditionId})=>{
      const sid=sessionId(),e=kind==='pc'?getCharacter(refId):getMonster(refId),c=e?.conditions.find(c=>c.id===conditionId);
      if(!sid||!ownsCreature(kind,refId)||!c?.combatEffect?.commandWord)return;
      if(!isStandardCommand(c.combatEffect.commandWord)&&!isDm()){socket.emit('notice',{message:'The DM resolves custom Command words.'});return;}
      const error=resolveCommandInstruction(sid,kind,refId,conditionId);if(error)socket.emit('notice',{message:error});else afterChange();
    });

    on('combat:save', ({ tokenIds, ability, dc, advantage, advantageByToken }) => {
      const sid = sessionId();
      if (!sid || !isDm() || !Array.isArray(tokenIds) || !Number.isFinite(dc))
        return;
      resolveSaves(sid, 'DM', tokenIds, String(ability), dc, advantage, advantageByToken);
      afterChange();
    });

    on('disconnect', () => {
      const sid = sessionId();
      const playerId = commandConnection()?.playerId ?? null;
      assistantInFlight.get(socket.id)?.abort(); // stop any in-flight LLM call
      assistantInFlight.delete(socket.id);
      if (sid) broadcastCursorHide(io, sid, socket.id); // clear my laser pointer
      dropConn(socket.id);
      if (sid) {
        // Hold the claim through a short grace window (handed back if they
        // reconnect, freed if they don't) instead of de-selecting on a blip.
        scheduleRelease(sid, socket.id, playerId);
        broadcastSnapshots(io, sid);
      } else {
        releaseClaims(socket.id);
      }
    });
  });
}
