import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Group, Line, Text } from 'react-konva';
import Konva from 'konva';
import type { Token } from '../../../shared/types';
import type { HpFloater } from '../state/socket';
import {hpNumberStacks,hpNumberSequence,hpTotalTimeline,hpStackStart,HP_NUMBER_FADE_MS,HP_TOTAL_HOLD_MS,type HpNumber} from '../lib/hpFeedback';
import {spellImpactStyle} from '../../../shared/spellImpact';
import {mapToScreen,projectGround,type BattlefieldView} from './miniatureProjection';

/**
 * Transient combat FX over tokens, driven by server 'fx:hp' events:
 *  - floating ±X damage/heal numbers (always),
 *  - typed ELEMENTAL bursts: a tinted ring pulse + the type's emoji + a radial
 *    particle spray in the type's palette (lightning adds a jagged bolt),
 *  - heals: soft green ring + rising sparkles,
 *  - 'death': skull + an expanding smoke puff,
 *  - 'loot': rising gold sparkle over the plundered container.
 * Physical/untyped damage stays plain so the board doesn't get noisy.
 *
 * Performance: everything is one-shot Konva tweens on non-listening,
 * non-perfect-draw nodes — no idle animation loops, no shadows on particles —
 * and every node unmounts after its token's final total has faded.
 */
const BURSTS: Record<string, { emoji: string; color: string; palette: string[] }> = {
  fire: { emoji: '🔥', color: '#ff8c3b', palette: ['#ff9b3b', '#ffd34d', '#ff5e2f'] },
  cold: { emoji: '❄️', color: '#8fd8ff', palette: ['#bfeaff', '#8fd8ff', '#ffffff'] },
  lightning: { emoji: '⚡', color: '#ffd84d', palette: ['#fff3a0', '#ffd84d', '#ffffff'] },
  thunder: { emoji: '💥', color: '#d8c9a8', palette: ['#d8c9a8', '#bdb39a', '#ffffff'] },
  acid: { emoji: '🧪', color: '#9be04a', palette: ['#9be04a', '#c9f06a', '#6fae2f'] },
  poison: { emoji: '☠️', color: '#8bc97f', palette: ['#8bc97f', '#5a9e57', '#b7e3a8'] },
  necrotic: { emoji: '💀', color: '#a98bd4', palette: ['#a98bd4', '#6e5a91', '#4a3d63'] },
  radiant: { emoji: '✨', color: '#ffe9a0', palette: ['#fff3b0', '#ffe9a0', '#ffffff'] },
  force: { emoji: '🔮', color: '#b39dff', palette: ['#b39dff', '#8f78e0', '#e0d8ff'] },
  psychic: { emoji: '🌀', color: '#ff8ad8', palette: ['#ff8ad8', '#d06ab0', '#ffc1ea'] },
};
const HEAL = { color: '#39c46b', palette: ['#7fe0a0', '#39c46b', '#d6ffe5'] };
const GOLD = { palette: ['#ffd84d', '#ffec9e', '#e0a82e'] };
const SMOKE = ['#8a8a8a', '#666666', '#9a9a9a'];

/** Per-burst random particle specs, computed once so re-renders don't reroll. */
type ParticleSpec = {
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  r: number;
  color: string;
  dur: number;
};
function makeSpecs(
  count: number,
  spread: number,
  palette: string[],
  mode: 'radial' | 'rise' | 'smoke',
): ParticleSpec[] {
  return Array.from({ length: count }, (_, i) => {
    const ang = (i / count) * Math.PI * 2 + Math.random() * 0.8;
    const dist = spread * (0.6 + Math.random() * 0.9);
    return {
      x0: (Math.random() - 0.5) * spread * 0.4,
      y0: (Math.random() - 0.5) * spread * 0.4,
      dx: mode === 'rise' ? (Math.random() - 0.5) * spread * 0.7 : Math.cos(ang) * dist,
      dy:
        mode === 'rise'
          ? -dist * (0.9 + Math.random() * 0.5)
          : mode === 'smoke'
            ? -dist * 0.35
            : Math.sin(ang) * dist,
      r:
        mode === 'smoke'
          ? spread * (0.28 + Math.random() * 0.22)
          : spread * (0.07 + Math.random() * 0.07),
      color: palette[i % palette.length],
      dur: (mode === 'smoke' ? 0.9 : 0.55) + Math.random() * 0.3,
    };
  });
}

/** A one-shot particle spray: radial sparks, rising sparkles, or a smoke puff
 *  (smoke grows + drifts up instead of shrinking). */
function Particles({
  cx,
  cy,
  spread,
  palette,
  count,
  mode,
}: {
  cx: number;
  cy: number;
  spread: number;
  palette: string[];
  count: number;
  mode: 'radial' | 'rise' | 'smoke';
}) {
  const specs = useMemo(() => makeSpecs(count, spread, palette, mode), [count, spread, palette, mode]);
  const refs = useRef<(Konva.Circle | null)[]>([]);

  useEffect(() => {
    const tweens = refs.current
      .map((node, i) => {
        if (!node) return null;
        const s = specs[i];
        return new Konva.Tween({
          node,
          x: node.x() + s.dx,
          y: node.y() + s.dy,
          opacity: 0,
          scaleX: mode === 'smoke' ? 2.2 : 0.3,
          scaleY: mode === 'smoke' ? 2.2 : 0.3,
          duration: s.dur,
          easing: Konva.Easings.EaseOut,
        });
      })
      .filter((t): t is Konva.Tween => !!t);
    tweens.forEach((t) => t.play());
    return () => tweens.forEach((t) => t.destroy());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {specs.map((s, i) => (
        <Circle
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          x={cx + s.x0}
          y={cy + s.y0}
          radius={s.r}
          fill={s.color}
          opacity={mode === 'smoke' ? 0.45 : 0.95}
          listening={false}
          perfectDrawEnabled={false}
        />
      ))}
    </>
  );
}

/** A jagged lightning bolt striking down onto the token — two flash-out lines
 *  (a white core over a gold glow). */
function LightningBolt({ cx, cy, radius }: { cx: number; cy: number; radius: number }) {
  const group = useRef<Konva.Group>(null);
  // Zigzag from above the token down to its center, jagging left/right.
  const points = useMemo(() => {
    const pts: number[] = [];
    const top = -radius * 2.6;
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const y = top + (0 - top) * (i / steps);
      const x = i === steps ? 0 : (Math.random() - 0.5) * radius * 0.9;
      pts.push(x, y);
    }
    return pts;
  }, [radius]);

  useEffect(() => {
    const node = group.current;
    if (!node) return;
    const tween = new Konva.Tween({
      node,
      opacity: 0,
      duration: 0.35,
      easing: Konva.Easings.EaseIn,
    });
    tween.play();
    return () => tween.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Group ref={group} x={cx} y={cy} listening={false}>
      <Line
        points={points}
        stroke="#ffd84d"
        strokeWidth={Math.max(3, radius * 0.22)}
        lineCap="round"
        lineJoin="round"
        opacity={0.7}
        perfectDrawEnabled={false}
      />
      <Line
        points={points}
        stroke="#ffffff"
        strokeWidth={Math.max(1.5, radius * 0.09)}
        lineCap="round"
        lineJoin="round"
        perfectDrawEnabled={false}
      />
    </Group>
  );
}

/** Expanding tinted ring pulse off the token rim. */
function RingPulse({
  cx,
  cy,
  radius,
  color,
  soft,
}: {
  cx: number;
  cy: number;
  radius: number;
  color: string;
  soft?: boolean;
}) {
  const ring = useRef<Konva.Circle>(null);
  useEffect(() => {
    const node = ring.current;
    if (!node) return;
    const tween = new Konva.Tween({
      node,
      scaleX: soft ? 1.35 : 1.6,
      scaleY: soft ? 1.35 : 1.6,
      opacity: 0,
      duration: 0.55,
      easing: Konva.Easings.EaseOut,
    });
    tween.play();
    return () => tween.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Circle
      ref={ring}
      x={cx}
      y={cy}
      radius={radius}
      stroke={color}
      strokeWidth={Math.max(2, radius * 0.12)}
      opacity={soft ? 0.6 : 0.85}
      listening={false}
      perfectDrawEnabled={false}
    />
  );
}

/** A glyph that pops up and fades (the burst's emoji, the death skull…). */
function GlyphPop({
  cx,
  cy,
  text,
  fontSize,
  rise,
  duration = 0.8,
}: {
  cx: number;
  cy: number;
  text: string;
  fontSize: number;
  rise: number;
  duration?: number;
}) {
  const glyph = useRef<Konva.Text>(null);
  useEffect(() => {
    const node = glyph.current;
    if (!node) return;
    const tween = new Konva.Tween({
      node,
      y: node.y() - rise,
      scaleX: 1.25,
      scaleY: 1.25,
      opacity: 0,
      duration,
      easing: Konva.Easings.EaseOut,
    });
    tween.play();
    return () => tween.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Text
      ref={glyph}
      x={cx}
      y={cy}
      text={text}
      fontSize={fontSize}
      opacity={0.95}
      width={fontSize * 2}
      align="center"
      offsetX={fontSize}
      offsetY={fontSize * 0.55}
      listening={false}
      perfectDrawEnabled={false}
    />
  );
}

/** The composed burst for one floater (or null when it should stay plain). */
function BurstFx({
  spellEffects3D,
  floater,
  token,
  pxPerFoot,
}: {
  spellEffects3D?: boolean;
  floater: HpFloater;
  token: Token;
  pxPerFoot: number;
}) {
  const radius = (token.widthFt * pxPerFoot) / 2;
  const { x: cx, y: cy } = token;
  const spell=spellImpactStyle(floater);
  if(spell?.kind==='bolts')return !spellEffects3D?<>
    {Array.from({length:14},(_,i)=>{const a=i*2.399963,r=i===0?0:Math.sqrt(i/13)*(floater.areaWidthFt??10)*pxPerFoot*.46;
      return <LightningBolt key={i} cx={cx+Math.cos(a)*r} cy={cy+Math.sin(a)*r} radius={Math.max(12,radius*.7)}/>;})}
  </>:null;
  if(spell&&spell.kind!=='burst')return <>
    {!spellEffects3D&&<><RingPulse cx={cx} cy={cy} radius={radius} color={spell.color}/>
      <Particles cx={cx} cy={cy} spread={radius*1.4} palette={[spell.color,'#dcffbd']} count={12} mode="rise"/></>}
    {floater.effect==='death'&&<GlyphPop cx={cx} cy={cy} text="💀" fontSize={Math.max(16,radius)} rise={radius}/>}
  </>;

  if (floater.effect === 'loot') {
    return (
      <>
        <Particles cx={cx} cy={cy} spread={radius * 1.1} palette={GOLD.palette} count={9} mode="rise" />
        <GlyphPop cx={cx} cy={cy} text="💰" fontSize={Math.max(14, radius * 0.8)} rise={radius} duration={0.9} />
      </>
    );
  }

  const heal = floater.delta > 0;
  if (heal) {
    return (
      <>
        <RingPulse cx={cx} cy={cy} radius={radius} color={HEAL.color} soft />
        <Particles cx={cx} cy={cy} spread={radius} palette={HEAL.palette} count={6} mode="rise" />
      </>
    );
  }

  const style = BURSTS[floater.damageType ?? ''];
  const death = floater.effect === 'death';
  if (!style && !death) return null; // plain physical/untyped damage

  return (
    <>
      {style && (
        <>
          <RingPulse cx={cx} cy={cy} radius={radius} color={style.color} />
          <Particles cx={cx} cy={cy} spread={radius * 1.3} palette={style.palette} count={8} mode="radial" />
          {floater.damageType === 'lightning' ? (
            !spellEffects3D&&<LightningBolt cx={cx} cy={cy} radius={radius} />
          ) : (
            <GlyphPop
              cx={cx}
              cy={cy}
              text={style.emoji}
              fontSize={Math.max(14, radius * 0.95)}
              rise={radius * 0.9}
            />
          )}
        </>
      )}
      {death && (
        <>
          <Particles cx={cx} cy={cy} spread={radius * 1.2} palette={SMOKE} count={5} mode="smoke" />
          <GlyphPop
            cx={cx}
            cy={cy}
            text="💀"
            fontSize={Math.max(16, radius * 1.05)}
            rise={radius * 0.7}
            duration={1.0}
          />
        </>
      )}
    </>
  );
}

/** Colored numbers float above their creature, hold, then gently fade. */
type HeadPosition=(id:string)=>{x:number;y:number}|undefined;
function FloaterText({number,position,fontSize,rise,startAt,holdMs,fadeMs,targetX,tokenId,headPosition}:{number:HpNumber;position:{x:number;y:number};fontSize:number;rise:number;startAt:number;holdMs:number;fadeMs:number;targetX:number;tokenId:string;headPosition:HeadPosition}) {
  const anchor=useRef<Konva.Group>(null);
  const group=useRef<Konva.Group>(null);
  useEffect(()=>{
    const node=group.current;if(!node)return;
    let drift:Konva.Tween|undefined,fade:Konva.Tween|undefined,fadeTimer:ReturnType<typeof setTimeout>|undefined;
    const follow=new Konva.Animation(()=>{
      const head=headPosition(tokenId);if(!head||!anchor.current)return false;
      anchor.current.position({x:head.x,y:head.y+fontSize*.3});
    },node.getLayer());
    follow.start();
    const stopTimer=setTimeout(()=>follow.stop(),Math.max(0,startAt-performance.now())+holdMs+fadeMs);
    const timer=setTimeout(()=>{
      node.opacity(1);
      drift=new Konva.Tween({node,y:-rise,duration:(holdMs+fadeMs)/1000,easing:Konva.Easings.EaseOut});drift.play();
      fadeTimer=setTimeout(()=>{fade=new Konva.Tween({node,opacity:0,duration:fadeMs/1000,easing:Konva.Easings.EaseIn});fade.play();},holdMs);
    },Math.max(0,startAt-performance.now()));
    return()=>{clearTimeout(timer);clearTimeout(fadeTimer);clearTimeout(stopTimer);follow.stop();drift?.destroy();fade?.destroy();};
  },[]);
  const width=fontSize*3;
  return <Group ref={anchor} x={position.x} y={position.y+fontSize*1.3} listening={false}><Group ref={group} opacity={0} listening={false}>
    <Text name={`hp-floater-number ${number.total?'hp-floater-total':number.delta<0?'hp-floater-component':'hp-floater-heal'}`} targetMapX={targetX} text={`${number.delta>0?'+':'\u2212'}${Math.abs(number.delta)}`}
      fontSize={number.total||number.delta>0?fontSize:fontSize*.72} fontStyle="bold" fill={number.color} stroke="#08090d" strokeWidth={Math.max(1.5,fontSize*.09)} fillAfterStrokeEnabled
      shadowColor="#000" shadowBlur={5} shadowOpacity={.9} align="center" width={width} offsetX={width/2} listening={false}/>
  </Group></Group>;
}

/** One stationary total over the head, increasing as each colored part arrives. */
function RunningTotal({numbers,position,fontSize,startAt,targetX,tokenId,headPosition}:{numbers:HpNumber[];position:{x:number;y:number};fontSize:number;startAt:number;targetX:number;tokenId:string;headPosition:HeadPosition}){
  const anchor=useRef<Konva.Group>(null),group=useRef<Konva.Group>(null),text=useRef<Konva.Text>(null);
  const timeline=hpTotalTimeline(numbers);
  const timingKey=timeline.map(t=>`${t.delayMs}:${t.delta}`).join(',');
  useEffect(()=>{
    const node=group.current,label=text.current;if(!node||!label)return;
    const milestones=hpTotalTimeline(numbers),last=milestones.at(-1);if(!last)return;
    let previousText='';
    const animation=new Konva.Animation(()=>{
      const elapsed=performance.now()-startAt;
      const head=headPosition(tokenId);if(head&&anchor.current)anchor.current.position({x:head.x,y:head.y-fontSize});
      let amount=0;
      for(let i=0;i<milestones.length;i++){
        const item=milestones[i];if(elapsed<item.delayMs)break;
        const before=i?milestones[i-1].delta:0;
        const progress=Math.min(1,(elapsed-item.delayMs)/180);
        amount=before+(item.delta-before)*(1-(1-progress)**3);
      }
      const shown=Math.ceil(-amount),value=`\u2212${shown}`;
      if(value!==previousText){label.text(value);previousText=value;}
      node.opacity(elapsed<milestones[0].delayMs-220?0:elapsed<=last.delayMs+HP_TOTAL_HOLD_MS?1:Math.max(0,1-(elapsed-last.delayMs-HP_TOTAL_HOLD_MS)/HP_NUMBER_FADE_MS));
      if(elapsed>last.delayMs+HP_TOTAL_HOLD_MS+HP_NUMBER_FADE_MS)animation.stop();
    },node.getLayer());
    animation.start();return()=>{animation.stop();};
  },[startAt,tokenId,headPosition,timingKey]);
  if(!timeline.length)return null;
  const width=fontSize*4;
  return <Group ref={anchor} x={position.x} y={position.y} listening={false}><Group ref={group} opacity={0} listening={false}>
    <Text ref={text} name="hp-floater-number hp-floater-total" targetMapX={targetX} text="\u22120" fontSize={fontSize} fontStyle="bold"
      fill="#ff5a60" stroke="#08090d" strokeWidth={Math.max(1.5,fontSize*.09)} fillAfterStrokeEnabled shadowColor="#000" shadowBlur={5}
      shadowOpacity={.9} align="center" width={width} offsetX={width/2} listening={false}/>
  </Group></Group>;
}

/** Project the token anchor only. Text and upward drift stay in screen space. */
export const HpNumberLayer=memo(function HpNumberLayer({floaters,tokens,pxPerFoot,gridSizePx,view,width,height,tilt,rotation,headPosition}:{
 floaters:HpFloater[];tokens:Token[];pxPerFoot:number;gridSizePx:number;view:BattlefieldView;width:number;height:number;tilt:number;rotation:number;headPosition:HeadPosition;
}){
  const fontSize=Math.max(16,Math.min(54,gridSizePx*.5*view.scale));
  return <>{hpNumberStacks(floaters).map(({id,event:f,numbers})=>{
    const token=tokens.find(t=>t.kind===f.kind&&t.refId===f.refId);if(!token)return [];
    const ground=mapToScreen(token.x,token.y,view,tilt),anchor=projectGround(ground.x,ground.y,width,height,tilt,rotation);
    if(!Number.isFinite(anchor.x)||!Number.isFinite(anchor.y))return [];
    const radius=token.widthFt*pxPerFoot*view.scale/2;
    const position={x:anchor.x,y:anchor.y-Math.min(64,radius)-fontSize*.4},startAt=hpStackStart(numbers,f.numberStartAt??performance.now());
    return <Group key={id} listening={false}>
      {hpNumberSequence(numbers).map(({number,delayMs,holdMs,fadeMs},i)=><FloaterText key={i} number={number} position={position} fontSize={fontSize} rise={fontSize*1.3}
        startAt={startAt+delayMs} holdMs={holdMs} fadeMs={fadeMs} targetX={token.x} tokenId={token.id} headPosition={headPosition}/>)}
      <RunningTotal numbers={numbers} position={position} fontSize={fontSize} startAt={startAt} targetX={token.x} tokenId={token.id} headPosition={headPosition}/>
    </Group>;
  })}</>;
});

function DelayedBurst({floater,token,pxPerFoot,spellEffects3D}:{floater:HpFloater;token:Token;pxPerFoot:number;spellEffects3D:boolean}){
  const [ready,setReady]=useState((floater.numberStartAt??0)<=performance.now());
  useEffect(()=>{if(ready)return;const timer=setTimeout(()=>setReady(true),Math.max(0,(floater.numberStartAt??0)-performance.now()));return()=>clearTimeout(timer);},[floater.numberStartAt,ready]);
  return ready?<BurstFx floater={floater} token={token} pxPerFoot={pxPerFoot} spellEffects3D={spellEffects3D}/>:null;
}

/** Spell bursts remain on the ground plane; numbers use HpNumberLayer above it. */
export const HpFxLayer = memo(function HpFxLayer({spellEffects3D=false,floaters,tokens,pxPerFoot}:{
 spellEffects3D?:boolean;floaters:HpFloater[];tokens:Token[];pxPerFoot:number;
}) {
  if (floaters.length === 0) return null;
  return <>
    {floaters.map(f=>{
      const token=tokens.find(t=>t.kind===f.kind&&t.refId===f.refId);
      return token?<Group key={`burst:${f.id}`} listening={false}><DelayedBurst floater={f} token={token} pxPerFoot={pxPerFoot} spellEffects3D={spellEffects3D}/></Group>:null;
    })}
  </>;
});
