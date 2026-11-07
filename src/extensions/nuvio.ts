import { getJson, getText, request } from './http';

/** Nuvio-style local scrapers: a repository with manifest.json + provider JS files exposing getStreams(). */
export interface NuvioScraper {
  id: string;
  name: string;
  description?: string;
  version?: string;
  filename: string;
  logo?: string;
  supportedTypes?: string[];
  enabled?: boolean;
  userEnabled?: boolean;
}
export interface NuvioStream {
  name?: string;
  title?: string;
  url?: string;
  quality?: string;
  size?: string;
  headers?: Record<string, string>;
  provider?: string;
}

const TMDB_KEY = 'goowatch_tmdb_key';
export function getTmdbKey(): string {
  try {
    return localStorage.getItem(TMDB_KEY) || '';
  } catch {
    return '';
  }
}
export function setTmdbKey(k: string) {
  try {
    localStorage.setItem(TMDB_KEY, k.trim());
  } catch {
    /* ignore */
  }
}

/** Repo address (GitHub page, raw folder or manifest.json) → candidates for the raw base folder. */
export function nuvioBaseCandidates(input: string): string[] {
  const s = input.trim().split('#')[0];
  const gh = s.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/]+)(?:\/.*)?)?\/?$/i);
  if (gh) {
    const [, o, r, br] = gh;
    return (br ? [br] : ['main', 'master']).map((b) => `https://raw.githubusercontent.com/${o}/${r}/refs/heads/${b}/`);
  }
  if (/manifest\.json$/i.test(s)) return [s.replace(/manifest\.json$/i, '')];
  return [s.endsWith('/') ? s : s + '/'];
}

export async function loadNuvioRepo(base: string): Promise<{ name: string; scrapers: NuvioScraper[] } | null> {
  try {
    const m: any = await getJson(`${base}manifest.json`, 0, 15000);
    const list: any[] = Array.isArray(m?.scrapers) ? m.scrapers : [];
    if (!list.length) return null;
    return {
      name: String(m.name || base.split('/').filter(Boolean).slice(-3, -2)[0] || 'Provider repository'),
      scrapers: list
        .filter((x) => x && x.filename)
        .map((x) => ({
          id: String(x.id || x.filename),
          name: String(x.name || x.id || x.filename),
          description: x.description,
          version: x.version,
          filename: String(x.filename),
          logo: x.logo,
          supportedTypes: x.supportedTypes || ['movie', 'tv'],
          enabled: x.enabled !== false,
          userEnabled: x.enabled !== false,
        })),
    };
  } catch {
    return null;
  }
}

const tmdbCache = new Map<string, string | null>();
export async function imdbToTmdb(imdb: string, kind: 'movie' | 'tv'): Promise<string | null> {
  const key = getTmdbKey();
  if (!key) return null;
  const ck = `${imdb}|${kind}`;
  if (tmdbCache.has(ck)) return tmdbCache.get(ck)!;
  try {
    const j: any = await getJson(`https://api.themoviedb.org/3/find/${imdb}?external_source=imdb_id&api_key=${encodeURIComponent(key)}`, 24 * 3600 * 1000);
    const hit = (kind === 'movie' ? j.movie_results : j.tv_results)?.[0];
    const id = hit ? String(hit.id) : null;
    tmdbCache.set(ck, id);
    return id;
  } catch {
    return null;
  }
}

function makeResponse(r: { status: number; url: string; headers: Record<string, string>; text: string }) {
  const lower: Record<string, string> = {};
  Object.entries(r.headers || {}).forEach(([k, v]) => (lower[k.toLowerCase()] = String(v)));
  return {
    ok: r.status >= 200 && r.status < 300,
    status: r.status,
    statusText: '',
    url: r.url,
    headers: { get: (k: string) => lower[k.toLowerCase()] ?? null, has: (k: string) => k.toLowerCase() in lower },
    text: async () => r.text,
    json: async () => JSON.parse(r.text),
    clone() {
      return makeResponse(r);
    },
  };
}

async function providerFetch(url: any, init: any = {}) {
  const u = typeof url === 'string' ? url : String(url?.url || url);
  let body = init.body;
  if (body && typeof body !== 'string') {
    body = body instanceof URLSearchParams ? body.toString() : JSON.stringify(body);
  }
  const r = await request(u, { method: init.method || 'GET', headers: init.headers || {}, body, timeoutMs: 25000 });
  return makeResponse(r);
}

const codeCache = new Map<string, string>();

async function makeRequire() {
  let cheerioMod: any = null;
  let cryptoMod: any = null;
  const need = async (name: string) => {
    if (/cheerio/i.test(name)) {
      if (!cheerioMod) cheerioMod = await import('cheerio/slim');
      return cheerioMod;
    }
    if (/crypto-js/i.test(name)) {
      if (!cryptoMod) cryptoMod = (await import('crypto-js')).default;
      return cryptoMod;
    }
    return null;
  };
  return need;
}

/** Runs one provider and returns its streams. */
export async function runScraper(
  repoBase: string,
  sc: NuvioScraper,
  tmdbId: string,
  mediaType: 'movie' | 'tv',
  season: number | null,
  episode: number | null
): Promise<NuvioStream[]> {
  const file = /^https?:\/\//i.test(sc.filename) ? sc.filename : sc.filename.startsWith('providers/') ? repoBase + sc.filename : `${repoBase}providers/${sc.filename}`;
  let code = codeCache.get(file);
  if (!code) {
    code = await getText(file, 0, 25000);
    codeCache.set(file, code);
  }
  const need = await makeRequire();
  // pre-load libraries the provider asks for (require() has to answer synchronously)
  const libs: Record<string, any> = {};
  if (/cheerio/i.test(code)) libs.cheerio = await need('cheerio');
  const needsCrypto = /crypto-js|CryptoJS/i.test(code);
  if (needsCrypto) libs['crypto-js'] = await need('crypto-js');
  const requireShim = (name: string) => {
    if (/cheerio/i.test(name)) return libs.cheerio;
    if (/crypto-js/i.test(name)) return libs['crypto-js'];
    throw new Error(`Module not available: ${name}`);
  };
  const module: any = { exports: {} };
  const g: any = {};
  const consoleShim = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
  const fn = new Function(
    'module',
    'exports',
    'require',
    'global',
    'globalThis',
    'self',
    'fetch',
    'console',
    'CryptoJS',
    'cheerio',
    code + '\n;return typeof getStreams==="function"?getStreams:undefined;'
  );
  const bare = fn(module, module.exports, requireShim, g, g, g, providerFetch, consoleShim, libs['crypto-js'], libs.cheerio);
  const holder: any =
    (module.exports && typeof module.exports.getStreams === 'function' && module.exports) ||
    (typeof g.getStreams === 'function' && g) ||
    Object.values(g).find((v: any) => v && typeof v.getStreams === 'function');
  const getStreams: any = holder ? holder.getStreams.bind(holder) : bare;
  if (typeof getStreams !== 'function') throw new Error('Provider has no getStreams');
  const res = await Promise.race([
    Promise.resolve(getStreams(tmdbId, mediaType, season, episode)),
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('provider timeout')), 40000)),
  ]);
  return Array.isArray(res) ? (res as NuvioStream[]) : [];
}
