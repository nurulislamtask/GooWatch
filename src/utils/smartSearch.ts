/** Smart search: short forms (AOT), initials, spelling slips and word order all find the right title. */

const ALIASES: Record<string, string[]> = {
  aot: ['attack on titan'], snk: ['attack on titan'],
  mha: ['my hero academia'], bnha: ['my hero academia'],
  jjk: ['jujutsu kaisen'], kny: ['demon slayer'], ds: ['demon slayer'],
  hxh: ['hunter x hunter'], fma: ['fullmetal alchemist'], fmab: ['fullmetal alchemist brotherhood'],
  opm: ['one punch man'], op: ['one piece'], dbz: ['dragon ball z'], dbs: ['dragon ball super'], db: ['dragon ball'],
  sao: ['sword art online'], csm: ['chainsaw man'], mob: ['mob psycho 100'], nge: ['neon genesis evangelion'],
  got: ['game of thrones'], hotd: ['house of the dragon'], lotr: ['the lord of the rings'], hp: ['harry potter'],
  bb: ['breaking bad'], bcs: ['better call saul'], tbbt: ['the big bang theory'], himym: ['how i met your mother'],
  tlou: ['the last of us'], tww: ['the witcher'], st: ['stranger things'], tvd: ['the vampire diaries'],
  pb: ['peaky blinders'], lcdp: ['money heist'], mcu: ['avengers'], dc: ['justice league'],
  jw: ['jurassic world', 'john wick'], jp: ['jurassic park'], ff: ['fast and furious', 'fast furious'],
  mi: ['mission impossible'], potc: ['pirates of the caribbean'], sw: ['star wars'], stt: ['star trek'],
  tdk: ['the dark knight'], rrr: ['rrr'], kgf: ['kgf'],
  naruto: ['naruto shippuden'], bleach: ['bleach thousand year blood war'], dn: ['death note'],
  tpn: ['the promised neverland'], hh: ['hells paradise'], spy: ['spy x family'],
};

const norm = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'on', 'in', 'to']);
const words = (s: string) => norm(s).split(' ').filter(Boolean);

/** All queries worth sending to a catalog for what was typed (typed text first). */
export function expandQuery(q: string): string[] {
  const n = norm(q);
  const out = [q.trim()];
  const al = ALIASES[n.replace(/ /g, '')];
  if (al) out.push(...al);
  return [...new Set(out.filter(Boolean))].slice(0, 3);
}

function lev1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
}

/** Does this title answer the search? (all words, initials like "aot", alias, or one-letter slip) */
export function titleMatches(title: string, q: string): boolean {
  const t = norm(title);
  if (!t) return false;
  const qs = expandQuery(q).map(norm);
  const tw = words(title);
  const initials = tw.filter((w) => !STOP.has(w)).map((w) => w[0]).join('');
  const initialsAll = tw.map((w) => w[0]).join('');
  for (const s of qs) {
    if (!s) continue;
    if (t.includes(s)) return true;
    const compact = s.replace(/ /g, '');
    if (compact.length >= 2 && (initials === compact || initialsAll === compact || t.replace(/ /g, '').includes(compact))) return true;
    const sw = s.split(' ');
    if (sw.every((w) => tw.some((x) => x.startsWith(w) || (w.length >= 4 && lev1(x, w))))) return true;
  }
  return false;
}
