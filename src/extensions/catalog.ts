import { getJson } from './http';

export interface CatalogAddon {
  id: string;
  name: string;
  description: string;
  logo?: string;
  types: string[];
  resources: string[];
  manifestUrl: string;
  version?: string;
  /** needs a torrent / debrid service to actually play */
  needsDebrid: boolean;
  note?: string;
  manifest?: any;
}

export const STORE_EVENT = 'goowatch-open-store';
export const openAddonStore = () => window.dispatchEvent(new Event(STORE_EVENT));

/** Hand-picked add-ons shown first (always available, even offline). */
export const RECOMMENDED: (Omit<CatalogAddon, 'id' | 'resources' | 'needsDebrid'> & { why: string; debrid?: boolean })[] = [
  { name: 'Cinemeta', manifestUrl: 'https://v3-cinemeta.strem.io/manifest.json', description: 'Movie & series catalogs, posters, episodes and ratings.', types: ['movie', 'series'], why: 'Built in' },
  { name: 'Kitsu Anime', manifestUrl: 'https://anime-kitsu.strem.fun/manifest.json', description: 'Anime catalogs and episode lists.', types: ['anime'], why: 'Built in' },
  { name: 'OpenSubtitles', manifestUrl: 'https://opensubtitles-v3.strem.io/manifest.json', description: 'Subtitles in many languages for every title.', types: ['subtitles'], why: 'Best subtitles' },
  { name: 'TMDB', manifestUrl: 'https://94c8cb9f702d-tmdb-addon.baby-beamup.club/manifest.json', description: 'Rich TMDB catalogs: trending, popular, by genre.', types: ['movie', 'series'], why: 'More catalogs' },
  { name: 'Streaming Catalogs', manifestUrl: 'https://7a82163c306e-stremio-netflix-catalog-addon.baby-beamup.club/manifest.json', description: 'Browse what is on Netflix, Prime, Disney+ and more.', types: ['movie', 'series'], why: 'Find what to watch' },
  { name: 'Public Domain Movies', manifestUrl: 'https://caching.stremio.net/publicdomainmovies.now.sh/manifest.json', description: 'Free classic movies you can watch right away.', types: ['movie'], why: 'Free & playable' },
  { name: 'WatchHub', manifestUrl: 'https://watchhub.strem.io/manifest.json', description: 'Shows which legal services stream a title.', types: ['movie', 'series'], why: 'Legal links' },
  { name: 'Torrentio', manifestUrl: 'https://torrentio.strem.fun/manifest.json', description: 'Torrent streams. Needs a debrid service to play.', types: ['movie', 'series', 'anime'], why: 'Needs debrid', debrid: true },
];

const DEBRID = /torrent|debrid|real-?debrid|premiumize|all-?debrid|magnet/i;

let memo: { t: number; list: CatalogAddon[] } | null = null;

/** The community add-on collection (the same list the Stremio app shows). */
export async function fetchAddonCollection(): Promise<CatalogAddon[]> {
  if (memo && Date.now() - memo.t < 30 * 60 * 1000) return memo.list;
  const raw = await getJson<any[]>('https://api.strem.io/addonscollection.json', 30 * 60 * 1000, 15000);
  const list: CatalogAddon[] = [];
  const seen = new Set<string>();
  for (const a of Array.isArray(raw) ? raw : []) {
    const m = a?.manifest;
    const url = a?.transportUrl;
    if (!m || !url || !/^https?:\/\//i.test(url) || seen.has(m.id || url)) continue;
    seen.add(m.id || url);
    const resources = ((m.resources || []) as any[]).map((r) => (typeof r === 'string' ? r : r?.name)).filter(Boolean);
    const text = `${m.name} ${m.description || ''}`;
    list.push({
      id: m.id || url,
      name: m.name || 'Add-on',
      description: m.description || '',
      logo: m.logo,
      types: (m.types || []) as string[],
      resources,
      manifestUrl: url,
      version: m.version,
      needsDebrid: DEBRID.test(text) && !resources.includes('catalog'),
      manifest: m,
    });
  }
  memo = { t: Date.now(), list };
  return list;
}
