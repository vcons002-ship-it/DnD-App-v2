import type { ReactNode } from 'react';

// Highlights the advantage/disadvantage breakdown the server writes into a roll
// detail: `→adv N` (kept-higher) in green, `→dis N` (kept-lower) in red, the
// rolled `[a,b]` pair dimmed so the chosen face stands out, and `· adv: ...` /
// `· dis: ...` explanations in green/red. Everything else is returned verbatim.
const TOKEN = /→adv \d+|→dis \d+|\[\d+,\d+\]|· adv: [^·]+|· dis: [^·]+/g;

/** Render a roll detail string with the adv/dis d20 breakdown colour-coded. */
export function renderRollDetail(detail: string): ReactNode {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(detail))) {
    if (m.index > last) nodes.push(detail.slice(last, m.index));
    const tok = m[0];
    const cls = tok.startsWith('→adv') || tok.startsWith('· adv:')
      ? 'adv-up'
      : tok.startsWith('→dis') || tok.startsWith('· dis:')
        ? 'adv-down'
        : 'adv-pair';
    nodes.push(
      <span key={key++} className={cls}>
        {tok}
      </span>,
    );
    last = m.index + tok.length;
  }
  if (last < detail.length) nodes.push(detail.slice(last));
  return nodes;
}
