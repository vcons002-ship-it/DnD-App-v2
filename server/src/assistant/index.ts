import { retrieve } from './corpus.js';
import { getRulebook } from './rulebook.js';
import { generateText, type GenOpts } from '../ai/gateway.js';

export { rulebookInfo, setRulebookFromPdf, clearRulebook } from './rulebook.js';
export { assistantConfigured } from './llm.js';

const SYSTEM = `You are a Dungeons & Dragons 5e (2024 rules) assistant helping the Dungeon Master adjudicate rules at the table. Answer the DM's question using ONLY the rules context provided. Be concise and practical — give the ruling first, then a brief why, and cite the relevant numbers (DCs, distances, bonuses). If the context doesn't cover the question, say so plainly and suggest where to look rather than inventing a rule. When the context includes excerpts from the DM's uploaded rulebook, treat those as AUTHORITATIVE and prefer them over the generic SRD digest if they disagree.`;

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

  const chunks = retrieve(q, 6);
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

  const answer = await generateText(SYSTEM, user, backend);
  return { answer, pages };
}
