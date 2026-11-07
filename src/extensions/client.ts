import { ExtCatalog, ExtManifest, ExtMeta, ExtPreview, ExtStream, InstalledExt, ResolvedStream } from './types';
import { getJson } from './http';
import { imdbToTmdb, NuvioStream, runScraper } from './nuvio';

function resourceEntry(m: ExtManifest, resource: string) {
  return (m.resources || []).find((r) => (typeof r === 'string' ? r === resource : r.name === resource));
}

/** Does this extension offer `resource` for this type / id? */
export function supports(m: ExtManifest, resource: string, type: string, id?: string): boolean {
  const r = resourceEntry(m, resource);
  if (!r) return false;
  const types = (typeof r === 'string' ? undefined : r.types) || m.types || [];
  if (types.length && !types.includes(type)) return false;
  const prefixes = (typeof r === 'string' ? undefined : r.idPrefixes) || m.idPrefixes;
  if (id && prefixes && prefixes.length) return prefixes.some((p) => id.startsWith(p));
  return true;
}

function extraNames(c: ExtCatalog, required: boolean): string[] {
  const out: string[] = [];
  for (const e of c.extra || []) if (!!e.isRequired === required) out.push(e.name);
  if (required) out.push(...(c.extraRequired || []));
  else out.push(...(c.extraSupported || []));
  return out;
}

/** Catalogs that can be shown on the home page (no required search / filter). */
export function homeCatalogs(ext: InstalledExt): ExtCatalog[] {
  if (!resourceEntry(ext.manifest, 'catalog')) return [];
  return (ext.manifest.catalogs || []).filter((c) => extraNames(c, true).length === 0);
}
export function searchCatalogs(ext: InstalledExt): ExtCatalog[] {
  if (!resourceEntry(ext.manifest, 'catalog')) return [];
  return (ext.manifest.catalogs || []).filter((c) => [...extraNames(c, true), ...extraNames(c, false)].includes('search'));
}

function toPreview(o: any, ext: InstalledExt, type: string): ExtPreview | null {
  if (!o || !o.id || !o.name) return null;
  return {
    id: String(o.id),
    type: o.type || type,
    name: String(o.name),
    poster: o.poster,
    background: o.background,
    year: o.releaseInfo || o.year,
    addonBase: ext.base,
  };
}

export function catalogGenres(c: ExtCatalog): string[] {
  return (c.extra || []).find((e) => e.name === 'genre')?.options || [];
}

export async function fetchCatalog(
  ext: InstalledExt,
  c: ExtCatalog,
  search?: string,
  opts?: { genre?: string; skip?: number }
): Promise<ExtPreview[]> {
  const parts: string[] = [];
  if (search) parts.push(`search=${encodeURIComponent(search)}`);
  if (opts?.genre) parts.push(`genre=${encodeURIComponent(opts.genre)}`);
  if (opts?.skip) parts.push(`skip=${opts.skip}`);
  const extra = parts.length ? `/${parts.join('&')}` : '';
  const r = await getJson<{ metas?: any[] }>(`${ext.base}/catalog/${c.type}/${encodeURIComponent(c.id)}${extra}.json`);
  return (r.metas || []).map((o) => toPreview(o, ext, c.type)).filter(Boolean) as ExtPreview[];
}

export async function fetchMeta(exts: InstalledExt[], type: string, id: string, preferBase?: string): Promise<ExtMeta | null> {
  const list = exts
    .filter((e) => e.enabled && supports(e.manifest, 'meta', type, id))
    .sort((a, b) => (a.base === preferBase ? -1 : b.base === preferBase ? 1 : 0));
  for (const e of list) {
    try {
      const r = await getJson<{ meta?: ExtMeta }>(`${e.base}/meta/${type}/${encodeURIComponent(id)}.json`, 10 * 60 * 1000);
      if (r.meta && r.meta.name) return r.meta;
    } catch {
      /* try the next extension */
    }
  }
  return null;
}

function qualityScore(s: string): number {
  const t = s.toLowerCase();
  let sc = 0;
  if (/2160|4k|uhd/.test(t)) sc += 40;
  else if (/1080/.test(t)) sc += 30;
  else if (/720/.test(t)) sc += 20;
  else if (/480/.test(t)) sc += 8;
  if (/hevc|x265|h\.?265/.test(t)) sc -= 3; // older phones struggle more
  if (/cam|hdcam|telesync|\bts\b/.test(t)) sc -= 30;
  return sc;
}

function resolve(ext: InstalledExt, s: ExtStream, i: number): ResolvedStream {
  const label = [s.name, s.title].filter(Boolean).join(' · ').replace(/\n+/g, ' ') || ext.manifest.name;
  const detail = (s.description || s.title || '').replace(/\n+/g, ' · ');
  const headers = s.behaviorHints?.proxyHeaders?.request || s.behaviorHints?.headers || {};
  const get = (k: string) => Object.entries(headers).find(([h]) => h.toLowerCase() === k)?.[1];
  const base: ResolvedStream = {
    key: `${ext.base}#${i}`,
    addon: ext.manifest.name,
    label,
    detail,
    playable: false,
    subtitles: (s.subtitles || []).filter((x) => x.url).map((x) => ({ url: x.url, label: x.lang || x.id || 'Subtitle' })),
    score: qualityScore(`${s.name || ''} ${s.title || ''} ${s.description || ''}`),
  };
  if (s.url && /^https?:\/\//i.test(s.url)) {
    return { ...base, playable: true, url: s.url, referer: get('referer'), userAgent: get('user-agent'), score: base.score + 100 };
  }
  if (s.externalUrl) return { ...base, external: s.externalUrl, reason: 'Opens in your browser / another app' };
  if (s.infoHash) return { ...base, reason: 'Torrent stream - needs a debrid / HTTP-stream extension to play' };
  if (s.ytId) return { ...base, external: `https://www.youtube.com/watch?v=${s.ytId}`, reason: 'YouTube' };
  return { ...base, reason: 'Unsupported stream type' };
}

function qualityOf(st: NuvioStream): string {
  return `${st.quality || ''} ${st.title || ''} ${st.name || ''}`;
}

function resolveNuvio(ext: InstalledExt, scName: string, st: NuvioStream, i: number): ResolvedStream | null {
  if (!st || !st.url || !/^https?:\/\//i.test(st.url)) return null;
  const h = st.headers || {};
  const get = (k: string) => Object.entries(h).find(([x]) => x.toLowerCase() === k)?.[1];
  const label = [st.provider || st.name || scName, st.quality].filter(Boolean).join(' · ');
  return {
    key: `${ext.base}#${scName}#${i}`,
    addon: `${ext.manifest.name} / ${scName}`,
    label: label || scName,
    detail: [st.title, st.size].filter(Boolean).join(' · '),
    playable: true,
    url: st.url,
    referer: get('referer'),
    userAgent: get('user-agent'),
    subtitles: [],
    score: qualityScore(qualityOf(st)) + 100,
  };
}

/** Asks every enabled extension / provider for streams; `onBatch` is called as each one answers. */
export async function fetchStreams(
  exts: InstalledExt[],
  type: string,
  videoId: string,
  onBatch: (all: ResolvedStream[], pending: number) => void
): Promise<void> {
  const stremio = exts.filter((e) => e.enabled && e.kind !== 'nuvio' && supports(e.manifest, 'stream', type, videoId));
  // Nuvio providers need the TMDB id of an IMDb title
  const m = videoId.match(/^(tt\d+)(?::(\d+):(\d+))?/);
  const nuvio: { ext: InstalledExt; sc: NonNullable<InstalledExt['scrapers']>[number] }[] = [];
  const kind: 'movie' | 'tv' = type === 'movie' ? 'movie' : 'tv';
  if (m) {
    for (const e of exts) {
      if (!e.enabled || e.kind !== 'nuvio') continue;
      for (const sc of e.scrapers || []) {
        if (sc.userEnabled === false) continue;
        const types = (sc.supportedTypes || ['movie', 'tv']).map((t) => (t === 'series' ? 'tv' : t));
        if (types.includes(kind)) nuvio.push({ ext: e, sc });
      }
    }
  }
  const all: ResolvedStream[] = [];
  let pending = stremio.length + nuvio.length;
  if (pending === 0) return onBatch([], 0);
  const push = () => onBatch([...all].sort((a, b) => b.score - a.score), pending);

  const jobs: Promise<void>[] = stremio.map(async (e) => {
    try {
      const r = await getJson<{ streams?: ExtStream[] }>(`${e.base}/stream/${type}/${encodeURIComponent(videoId)}.json`, 2 * 60 * 1000, 20000);
      (r.streams || []).forEach((s, i) => all.push(resolve(e, s, i)));
    } catch {
      /* this extension did not answer */
    } finally {
      pending--;
      push();
    }
  });

  if (nuvio.length) {
    const tmdb = await imdbToTmdb(m![1], kind);
    if (!tmdb) {
      // no TMDB key (Settings → Extensions) or title unknown
      all.push({
        key: 'nuvio-needs-tmdb',
        addon: 'Nuvio providers',
        label: 'Provider streams need a TMDB API key',
        detail: 'Settings → Extensions → TMDB API key (free at themoviedb.org)',
        playable: false,
        reason: 'Add your TMDB API key to use Nuvio providers',
        subtitles: [],
        score: -1,
      });
      pending -= nuvio.length;
      push();
    } else {
      const season = m![2] ? parseInt(m![2], 10) : kind === 'tv' ? 1 : null;
      const episode = m![3] ? parseInt(m![3], 10) : kind === 'tv' ? 1 : null;
      let idx = 0;
      const worker = async () => {
        while (idx < nuvio.length) {
          const { ext, sc } = nuvio[idx++];
          try {
            const res = await runScraper(ext.base, sc, tmdb, kind, season, episode);
            res.forEach((st, i) => {
              const r = resolveNuvio(ext, sc.name, st, i);
              if (r) all.push(r);
            });
          } catch {
            /* provider failed */
          } finally {
            pending--;
            push();
          }
        }
      };
      jobs.push(worker(), worker(), worker(), worker());
    }
  }
  await Promise.all(jobs);
}

export async function fetchExtSubtitles(exts: InstalledExt[], type: string, id: string): Promise<{ url: string; label: string }[]> {
  const list = exts.filter((e) => e.enabled && supports(e.manifest, 'subtitles', type, id));
  const out: { url: string; label: string }[] = [];
  await Promise.all(
    list.map(async (e) => {
      try {
        const r = await getJson<{ subtitles?: { url: string; lang?: string; id?: string }[] }>(
          `${e.base}/subtitles/${type}/${encodeURIComponent(id)}.json`, 10 * 60 * 1000, 15000);
        (r.subtitles || []).slice(0, 12).forEach((s) => s.url && out.push({ url: s.url, label: `${s.lang || 'Subtitle'} (${e.manifest.name})` }));
      } catch {
        /* ignore */
      }
    })
  );
  return out;
}
