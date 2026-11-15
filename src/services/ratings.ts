// Ratings for any title: IMDb score (from Cinemeta, free, no key) and Rotten Tomatoes score (needs a free OMDb key in Settings).
import { useEffect, useState } from 'react';
import { getJson } from '../extensions/http';
import { readPrefs } from '../mobile/prefs';

const CINEMETA = 'https://v3-cinemeta.strem.io';
const KEY = 'gw_ratings_v3';
const HIT_TTL = 14 * 24 * 3600 * 1000;
const MISS_TTL = 2 * 24 * 3600 * 1000;

export interface Rating {
  imdb?: string; // "7.8"
  rt?: string; // "87%"
  id?: string; // tt1234567
  genres?: string[];
  rated?: string; // age rating from OMDb: PG-13, R, TV-MA ...
  t: number;
  rtFor?: string; // OMDb key the Rotten Tomatoes value was looked up with
}
export interface RatingTarget {
  kind: 'movie' | 'series';
  title: string;
  year?: number | string;
  imdbId?: string;
  imdb?: string; // already known (catalog gave it)
}

let cache: Record<string, Rating> | null = null;
let saveTimer: number | undefined;
function load(): Record<string, Rating> {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    cache = {};
  }
  return cache!;
}
function persist() {
  if (saveTimer) return;
  saveTimer = window.setTimeout(() => {
    saveTimer = undefined;
    try {
      const c = load();
      const keys = Object.keys(c);
      if (keys.length > 4000) keys.sort((a, b) => c[a].t - c[b].t).slice(0, keys.length - 4000).forEach((k) => delete c[k]);
      localStorage.setItem(KEY, JSON.stringify(c));
    } catch {
      /* storage full */
    }
  }, 1500);
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const yearOf = (y?: number | string) => {
  const m = String(y ?? '').match(/(19|20)\d{2}/);
  return m ? parseInt(m[0], 10) : 0;
};
const isImdb = (s?: string) => !!s && /^tt\d{6,}$/.test(s);

export function keyOf(t: RatingTarget): string {
  return isImdb(t.imdbId) ? `id:${t.imdbId}` : `t:${t.kind}:${norm(t.title)}:${yearOf(t.year)}`;
}

export function peekRating(t: RatingTarget): Rating | undefined {
  const r = load()[keyOf(t)];
  if (r) return r;
  return t.imdb ? { imdb: t.imdb, t: 0 } : undefined;
}

// ---- small LIFO queue: the cards you just scrolled to are served first, 3 requests at a time ----
const waiting: (() => void)[] = [];
let active = 0;
function pump() {
  while (active < 3 && waiting.length) {
    const job = waiting.pop()!;
    active++;
    job();
  }
}
function schedule<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    waiting.push(() => {
      fn()
        .then(resolve, reject)
        .finally(() => {
          active--;
          pump();
        });
    });
    pump();
  });
}

async function imdbByTitle(t: RatingTarget): Promise<{ id?: string; imdb?: string; genres?: string[] }> {
  const q = norm(t.title);
  if (!q) return {};
  const y = yearOf(t.year);
  const yr = (m: any) => yearOf(m.releaseInfo || m.year);
  // the same name can be filed as a movie or a series (anime, specials): try the stated kind first, then the other one
  for (const kind of [t.kind, t.kind === 'movie' ? 'series' : 'movie'] as const) {
    let metas: any[] = [];
    try {
      const r = await getJson<{ metas?: any[] }>(`${CINEMETA}/catalog/${kind}/top/search=${encodeURIComponent(t.title)}.json`, 24 * 3600 * 1000, 10000);
      metas = (r.metas || []).filter((m) => m && m.id);
    } catch {
      continue;
    }
    const near = (m: any) => !y || !yr(m) || Math.abs(yr(m) - y) <= 1;
    const exact = metas.filter((m) => norm(String(m.name || '')) === q);
    const loose = metas.filter((m) => {
      const n = norm(String(m.name || ''));
      return n && (n.startsWith(q) || q.startsWith(n)) && (!!y ? near(m) && !!yr(m) : metas.length === 1);
    });
    const pick = exact.find((m) => y && yr(m) && Math.abs(yr(m) - y) <= 1) || (!y ? exact[0] : undefined) || (exact.length === 1 ? exact[0] : undefined) || loose[0];
    if (!pick) continue;
    let imdb = pick.imdbRating ? String(pick.imdbRating) : undefined;
    let genres: string[] | undefined = Array.isArray(pick.genres) ? pick.genres.map(String) : undefined;
    if (!imdb || !genres) {
      const m = await imdbById(kind, String(pick.id)).catch(() => ({} as { imdb?: string; genres?: string[] }));
      imdb = imdb || m.imdb;
      genres = genres || m.genres;
    }
    return { id: String(pick.id), imdb, genres };
  }
  return {};
}

async function imdbById(kind: string, id: string): Promise<{ imdb?: string; genres?: string[] }> {
  const r = await getJson<{ meta?: any }>(`${CINEMETA}/meta/${kind}/${id}.json`, 24 * 3600 * 1000, 10000);
  const v = r.meta?.imdbRating;
  return { imdb: v ? String(v) : undefined, genres: Array.isArray(r.meta?.genres) ? r.meta.genres.map(String) : undefined };
}

async function rottenById(id: string, key: string): Promise<{ rt?: string; rated?: string; imdb?: string }> {
  const r = await getJson<any>(`https://www.omdbapi.com/?i=${encodeURIComponent(id)}&apikey=${encodeURIComponent(key)}`, 24 * 3600 * 1000, 10000);
  const row = (r?.Ratings || []).find((x: any) => /rotten/i.test(String(x.Source)));
  const rated = r?.Rated && !/^n\/a$/i.test(String(r.Rated)) ? String(r.Rated) : undefined;
  const imdb = r?.imdbRating && !/^n\/a$/i.test(String(r.imdbRating)) ? String(r.imdbRating) : undefined;
  return { rt: row?.Value ? String(row.Value) : undefined, rated, imdb };
}

const LEVEL: Record<string, number> = { G: 1, 'TV-Y': 1, 'TV-Y7': 1, 'TV-G': 1, PG: 2, 'TV-PG': 2, 'PG-13': 3, 'TV-14': 3, R: 4, 'TV-MA': 4, 'NC-17': 5, X: 5 };
/** True when the title is rated above PG-13 (R, TV-MA, NC-17 ...). Unknown ratings are not judged here. */
export function aboveTeen(r: Rating | undefined): boolean {
  const lv = r?.rated ? LEVEL[r.rated.toUpperCase()] : undefined;
  return !!lv && lv > 3;
}
/** Age limit asked for: 'G' (all ages), 'PG', 'PG-13'. Without an OMDb key the genres are used as a rough guide. */
export function ageOk(r: Rating | undefined, limit: string): boolean {
  if (!limit) return true;
  const max = limit === 'G' ? 1 : limit === 'PG' ? 2 : 3;
  const lv = r?.rated ? LEVEL[r.rated.toUpperCase()] : undefined;
  if (lv) return lv <= max;
  if (/^(approved|passed)$/i.test(r?.rated || '')) return true;
  if (!r?.genres) return false; // not checked yet
  const g = r.genres.map((x) => x.toLowerCase());
  const adult = g.some((x) => ['horror', 'crime', 'thriller', 'war', 'adult'].includes(x));
  return max >= 3 ? !g.includes('adult') && !g.includes('horror') : !adult && (max > 1 || g.some((x) => ['family', 'animation'].includes(x)));
}

const inflight = new Map<string, Promise<Rating | undefined>>();

/** Looks the rating up (once) and remembers it. Never throws. */
export function ensureRating(t: RatingTarget): Promise<Rating | undefined> {
  const k = keyOf(t);
  const omdb = (readPrefs().omdbKey || '').trim();
  const c = load();
  const have = c[k];
  const fresh = have && Date.now() - have.t < (have.imdb ? HIT_TTL : MISS_TTL);
  const needRt = !!omdb && !!(have?.id || t.imdbId) && have?.rtFor !== omdb;
  if (fresh && !needRt) return Promise.resolve(have);
  if (!fresh && t.imdb && isImdb(t.imdbId)) {
    c[k] = { imdb: t.imdb, id: t.imdbId, t: Date.now() };
  }
  const running = inflight.get(k);
  if (running) return running;
  const job = schedule(async () => {
    const cur: Rating = { ...(load()[k] || { t: 0 }) };
    try {
      if (!(Date.now() - cur.t < HIT_TTL && cur.imdb)) {
        if (isImdb(t.imdbId)) {
          cur.id = t.imdbId;
          const m = await imdbById(t.kind, t.imdbId!);
          cur.imdb = t.imdb || m.imdb;
          cur.genres = m.genres;
        } else {
          const f = await imdbByTitle(t);
          cur.id = f.id;
          cur.imdb = f.imdb;
          cur.genres = f.genres;
        }
      }
      if (omdb && cur.id && cur.rtFor !== omdb) {
        const o = await rottenById(cur.id, omdb).catch(() => ({} as { rt?: string; rated?: string }));
        cur.rt = o.rt;
        cur.rated = o.rated;
        if (!cur.imdb && o.imdb) cur.imdb = o.imdb;
        cur.rtFor = omdb;
      }
      cur.t = Date.now();
      load()[k] = cur;
      persist();
      return cur;
    } catch {
      // network problem: do not remember a "no rating" answer
      return load()[k];
    } finally {
      inflight.delete(k);
    }
  });
  inflight.set(k, job);
  return job;
}

/** Rating of a title for a card / detail page. `enabled=false` keeps cards that are far off screen quiet. */
export function useRatings(t: RatingTarget | null, enabled = true): Rating | undefined {
  const [, force] = useState(0);
  const key = t ? keyOf(t) : '';
  const omdb = readPrefs().omdbKey;
  useEffect(() => {
    if (!t || !enabled || !t.title) return;
    let alive = true;
    ensureRating(t).then(() => alive && force((n) => n + 1));
    return () => {
      alive = false;
    };
  }, [key, enabled, omdb]);
  return t ? peekRating(t) : undefined;
}

export const ratingNumber = (r?: string): number => {
  const n = parseFloat(String(r ?? ''));
  return Number.isFinite(n) ? n : 0;
};
