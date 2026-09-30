// Dice expression roller, framework-free so the server can roll authoritatively
// and the client can reuse the parser/types. Supports e.g. "2d6+3", "d20",
// "1d8+2d4+1", and d20 advantage/disadvantage.

export type Advantage = 'adv' | 'dis';

export type DiceResult = {
  expr: string;
  total: number;
  /** Every individual die face rolled (for display). */
  rolls: number[];
  /** Human-readable breakdown, e.g. "d20[15] +3 = 18". */
  detail: string;
};

const TERM = /([+-]?)(\d*)d(\d+)|([+-]?)(\d+)/gi;

// Per-term limits (count/sides) cap each term; these cap the whole expression so
// a pathological "1d6+1d6+…" can't burn CPU / flood the roll log.
const MAX_TERMS = 100;
const MAX_TOTAL_DICE = 1000;

export type SaveDieInfo={rollKind?:'initiative';target:{kind:'pc'|'monster';refId:string};modifier:number;dc:number;group:string;mode?:Advantage;autoFail?:boolean};
export type PhysicalDiceInfo={expr:string;advantage?:Advantage;critical?:boolean;criticalFrom?:number;criticalDice?:boolean[];target?:{kind:'pc'|'monster';refId:string};label?:string;saveDice?:SaveDieInfo[]};
type DiceSource = (sides:number[],info:PhysicalDiceInfo) => number[];
let physicalSource:DiceSource|undefined;
export function withDiceSource<T>(source:DiceSource,run:()=>T):T {
  const previous=physicalSource;physicalSource=source;try{return run();}finally{physicalSource=previous;}
}
export function usingPhysicalDice(){return !!physicalSource;}
export function withDiceMetadata<T>(metadata:Partial<PhysicalDiceInfo>,run:()=>T):T {
  const source=physicalSource;
  return source?withDiceSource((sides,info)=>source(sides,{...info,...metadata}),run):run();
}
/** A secondary save belongs to its actual target, including its visibility. */
export function withDiceTarget<T>(target:NonNullable<PhysicalDiceInfo['target']>,label:string,run:()=>T):T {
  const source=physicalSource;
  return source?withDiceSource((sides,info)=>source(sides,{...info,target,label}),run):run();
}
let faces:number[]|undefined;
const d = (sides: number) => {
  if (faces) {
    const face = faces.shift();
    if (face === undefined) throw new Error('Missing authoritative die face');
    return face;
  }
  return 1 + Math.floor(Math.random() * sides);
};

type Once = { total: number; rolls: number[]; detail: string };

function rollOnce(expr: string): Once | null {
  const cleaned = expr.replace(/\s+/g, '');
  if (!cleaned) return null;
  TERM.lastIndex = 0;
  let total = 0;
  let consumed = 0;
  const rolls: number[] = [];
  const parts: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = TERM.exec(cleaned))) {
    if (m.index !== consumed) return null; // gap = invalid char
    consumed += m[0].length;
    if (parts.length >= MAX_TERMS) return null;
    if (m[3] !== undefined) {
      const sign = m[1] === '-' ? -1 : 1;
      const count = m[2] === '' ? 1 : parseInt(m[2], 10);
      const sides = parseInt(m[3], 10);
      if (count < 1 || count > 100 || sides < 1 || sides > 1000) return null;
      if (rolls.length + count > MAX_TOTAL_DICE) return null;
      const these: number[] = [];
      for (let i = 0; i < count; i++) {
        const r = d(sides);
        these.push(r);
        rolls.push(r);
        total += sign * r;
      }
      parts.push(`${sign < 0 ? '-' : parts.length ? '+' : ''}${count}d${sides}[${these.join(',')}]`);
    } else {
      const sign = m[4] === '-' ? -1 : 1;
      const v = parseInt(m[5], 10);
      total += sign * v;
      parts.push(`${sign < 0 ? '-' : parts.length ? '+' : ''}${v}`);
    }
  }
  if (consumed !== cleaned.length || parts.length === 0) return null;
  return { total, rolls, detail: parts.join(' ') };
}

/** Validate without consuming randomness or requesting a live throw. */
export function isValidDiceExpression(expr:string):boolean {
  const previous=faces;
  faces=Array(MAX_TOTAL_DICE).fill(1);
  try { return rollOnce(expr)!==null; } finally { faces=previous; }
}

/** Parse a chat "/roll 2d6+3 [adv|dis]" (or "/r …") command. Returns null when
 *  the text isn't a roll command at all; the expression itself may still fail
 *  `rollDice` validation (callers surface that as an invalid-dice notice). */
export function parseRollCommand(
  text: string,
): { expr: string; advantage?: Advantage } | null {
  const m = text.trim().match(/^\/r(?:oll)?\s+(.+)$/i);
  if (!m) return null;
  const parts = m[1].trim().match(/^(.*?)(?:\s+(adv|dis))?$/i)!;
  const advantage = parts[2]?.toLowerCase() as Advantage | undefined;
  return { expr: (parts[1] ?? '').trim(), advantage };
}

/** Roll a dice expression. With advantage/disadvantage the whole expression is
 *  rolled twice and the higher/lower total is kept. Returns null if invalid. */
export function rollDice(expr: string, advantage?: Advantage,style?:{critical?:boolean;criticalFrom?:number}): DiceResult | null {
  const originalFaces=faces;
  if(physicalSource){
    const plan:number[]=[];
    if (!isValidDiceExpression(expr)) return null;
    for(const m of expr.replace(/\s+/g,'').matchAll(/(\d*)d(\d+)/gi))
      for(let i=0;i<Number(m[1]||1);i++)plan.push(Number(m[2]));
    const requested=advantage?[...plan,...plan]:plan;
    const supplied=physicalSource(requested,{expr,advantage,...style});
    if (supplied.length!==requested.length || supplied.some((v,i)=>!Number.isInteger(v)||v<1||v>requested[i]))
      throw new Error('Invalid authoritative die faces');
    faces=supplied.slice();
  }
  try {
  const a = rollOnce(expr);
  if (!a) return null;
  if (advantage) {
    const b = rollOnce(expr)!;
    const pick =
      advantage === 'adv' ? (a.total >= b.total ? a : b) : (a.total <= b.total ? a : b);
    return {
      expr,
      total: pick.total,
      rolls: pick.rolls,
      detail: `${a.detail} (=${a.total}) / ${b.detail} (=${b.total}) → ${
        advantage === 'adv' ? 'adv' : 'dis'
      } ${pick.total}`,
    };
  }
  return { expr, total: a.total, rolls: a.rolls, detail: `${a.detail} = ${a.total}` };
  } finally {faces=originalFaces;}
}

/** Roll independent damage terms in one physical throw, retaining their breakdowns. */
export function rollDicePool(terms:{expr:string;critical?:boolean}[]):(DiceResult|null)[] {
  if(!physicalSource)return terms.map(t=>rollDice(t.expr,undefined,{critical:t.critical}));
  const plans=terms.map(t=>isValidDiceExpression(t.expr)
    ? [...t.expr.replace(/\s+/g,'').matchAll(/(\d*)d(\d+)/gi)].flatMap(m=>Array(Number(m[1]||1)).fill(Number(m[2]))) : []);
  const sides=plans.flat();
  const supplied=physicalSource(sides,{expr:terms.map(t=>t.expr).join('+'),criticalDice:plans.flatMap((p,i)=>p.map(()=>!!terms[i].critical))});
  if(supplied.length!==sides.length||supplied.some((v,i)=>!Number.isInteger(v)||v<1||v>sides[i]))throw new Error('Invalid authoritative die faces');
  let offset=0;
  return withDiceSource(requested=>{const values=supplied.slice(offset,offset+requested.length);offset+=requested.length;return values;},
    ()=>terms.map(t=>rollDice(t.expr,undefined,{critical:t.critical})));
}
