import { retrieve } from './corpus.js';
import { getRulebook } from './rulebook.js';
import { generateText, type GenOpts } from '../ai/gateway.js';

export { rulebookInfo, setRulebookFromPdf, clearRulebook } from './rulebook.js';
export { assistantConfigured } from './llm.js';

const SYSTEM = `You are a Dungeons & Dragons 5e (2024 rules) assistant helping the Dungeon Master adjudicate rules at the table.

GROUND EVERY RULING IN THE RULES CONTEXT BELOW. Do not invent or guess specific rules, numbers, DCs, ranges, durations, or mechanics that the context does not support. If a precise rule isn't in the context, say so plainly (e.g. "The provided rules don't spell this out") instead of fabricating one — accuracy matters more than completeness.

You MAY reason and interpret. When a situation isn't covered verbatim, apply the closest applicable rules and general 5e principles to suggest a fair ruling — but clearly SEPARATE the two: state what the rules actually say first, then label any judgment call as interpretation (e.g. "Rules as written: … — Interpretation: …"). Never present an interpretation as if it were printed text.

When the context includes excerpts from the DM's uploaded rulebook, treat those as AUTHORITATIVE and prefer them over the generic SRD digest on any conflict.

Be concise and practical: give the ruling first, then a brief why, citing the relevant numbers.`;

/**
 * Answer a DM rules question, grounded in the retrieval corpus (uploaded
 * rulebook > SRD digest > app data). Returns the answer text, or null if no
 * LLM backend is reachable (caller posts an "unavailable" notice).
 */
export async function answerRules(
  question: string,
  backend: GenOpts = {},
): Promise<{ answer: string | null; pages: number[] }> {
  const q = question.trim().slice(0, 1000);
  if (!q) return { answer: null, pages: [] };

  // Pull a generous slice of grounding (the enlarged context window fits it).
  const chunks = retrieve(q, 10);
  const hasBook = !!getRulebook();
  // Pages of the uploaded-rulebook chunks that informed this answer (for citing).
  const pages = [
    ...new Set(
      chunks
        .filter((c) => c.source === 'rulebook' && typeof c.page === 'number')
        .map((c) => c.page as number),
    ),
  ].sort((a, b) => a - b);
  const context = chunks.length
    ? chunks
        .map((c) => {
          const tag =
            c.source === 'rulebook'
              ? '[UPLOADED RULEBOOK — authoritative]'
              : c.source === 'srd'
                ? '[SRD digest]'
                : '[reference]';
          return `${tag} ${c.title}\n${c.text}`;
        })
        .join('\n\n')
    : '(no matching rules found in the corpus)';

  const user =
    `Rules context${hasBook ? ' (the DM uploaded a rulebook — its excerpts win on conflict)' : ''}:\n\n` +
    `${context}\n\n---\nDM question: ${q}\n\nAnswer:`;

  // Low temperature → grounded, deterministic rulings (less drift/hallucination).
  const answer = await generateText(SYSTEM, user, { temperature: 0.1, ...backend });
  return { answer, pages };
}

const RECAP_SYSTEM =
  'You are a Dungeons & Dragons session scribe. From a transcript of recent dice rolls and chat in a live game, write a short "Previously…" recap of 3–6 sentences capturing the key events — who fought whom, notable hits or creatures downed, decisions made, and where things stand. Be vivid but concise, and do NOT invent events that are not in the transcript.';

/** Summarize a session transcript into a player-facing recap. Null if empty/no backend. */
export async function recapSession(transcript: string, backend: GenOpts = {}): Promise<string | null> {
  const t = transcript.trim();
  if (!t) return null;
  return generateText(RECAP_SYSTEM, `Transcript:\n${t}\n\nWrite the recap:`, {
    temperature: 0.4,
    ...backend,
  });
}

/** Generate ONE short in-character line for a creature to speak. */
export async function creatureLine(
  describe: string,
  backend: GenOpts = {},
): Promise<string | null> {
  const sys =
    'You voice monsters and NPCs in a Dungeons & Dragons game. Given a creature, reply with ONE short spoken line (max ~20 words) it might say in the moment — in character, no quotation marks, no narration or stage directions, just the words.';
  const line = await generateText(sys, describe, { temperature: 0.9, ...backend });
  return line ? line.replace(/^["']|["']$/g, '').split('\n')[0].slice(0, 200).trim() : null;
}
