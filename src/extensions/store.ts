import { useEffect, useState } from 'react';
import { ExtManifest, InstalledExt } from './types';
import { getJson } from './http';
import { loadNuvioRepo, nuvioBaseCandidates } from './nuvio';

const KEY = 'goowatch_extensions_v1';

/** Ready-made extensions the app starts with (users can remove them or add more by address). */
export const BUILTIN: { base: string; name: string }[] = [
  { base: 'https://v3-cinemeta.strem.io', name: 'Cinemeta (movies & series)' },
  { base: 'https://anime-kitsu.strem.fun', name: 'Kitsu (anime)' },
];

export const SUGGESTED: { base: string; name: string; hint: string }[] = [
  { base: 'https://v3-cinemeta.strem.io', name: 'Cinemeta', hint: 'Movies & series catalogs' },
  { base: 'https://anime-kitsu.strem.fun', name: 'Kitsu', hint: 'Anime catalogs' },
  { base: 'https://opensubtitles-v3.strem.io', name: 'OpenSubtitles', hint: 'Subtitles' },
];

export function normalizeBase(input: string): string {
  let u = input.trim();
  if (!u) throw new Error('Paste an extension address');
  u = u.replace(/^stremio:\/\//i, 'https://');
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  u = u.split('?')[0].replace(/\/manifest\.json$/i, '').replace(/\/+$/, '');
  return u;
}

let state: InstalledExt[] | null = null;
const listeners = new Set<() => void>();

function load(): InstalledExt[] {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      state = JSON.parse(raw) as InstalledExt[];
      return state;
    }
  } catch {
    /* ignore */
  }
  state = [];
  return state;
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state || []));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function getExtensions(): InstalledExt[] {
  return load();
}

export async function fetchManifest(base: string): Promise<ExtManifest> {
  const m = await getJson<ExtManifest>(`${base}/manifest.json`, 0, 12000);
  if (!m || !m.id || !m.name) throw new Error('This address is not a valid extension');
  return m;
}

function looksLikeCloudStream(j: any): boolean {
  if (Array.isArray(j)) return j.some((x) => x && (x.internalName || /\.cs3$/i.test(String(x.url || ''))));
  return !!(j && (j.pluginLists || j.manifestVersion));
}

/** Installs a Stremio add-on (manifest.json) or a Nuvio provider repository, from whatever address the user pastes. */
export async function installExtension(input: string, builtin = false): Promise<InstalledExt> {
  const raw = input.trim();
  if (!raw) throw new Error('Paste an extension address');
  const list = load();

  // 1) Nuvio repository (GitHub page / raw folder / manifest.json with "scrapers")
  const isGithubPage = /^https?:\/\/github\.com\//i.test(raw);
  if (!/^stremio:\/\//i.test(raw)) {
    for (const cand of nuvioBaseCandidates(raw)) {
      const repo = await loadNuvioRepo(cand);
      if (repo) {
        const ext: InstalledExt = {
          kind: 'nuvio',
          base: cand,
          manifest: { id: cand, name: repo.name, description: `${repo.scrapers.length} providers`, resources: ['stream'] },
          scrapers: repo.scrapers,
          enabled: true,
          builtin,
        };
        const i = list.findIndex((e) => e.base === cand);
        if (i >= 0) list[i] = { ...ext, scrapers: ext.scrapers!.map((s) => ({ ...s, userEnabled: list[i].scrapers?.find((o) => o.id === s.id)?.userEnabled ?? s.userEnabled })) };
        else list.push(ext);
        save();
        return ext;
      }
    }
    if (isGithubPage) throw new Error('No provider repository (manifest.json with "scrapers") found in this GitHub repo');
  }

  // 2) Stremio add-on
  const base = normalizeBase(raw);
  let manifest: ExtManifest | null = null;
  let probe: any = null;
  try {
    probe = await getJson(`${base}/manifest.json`, 0, 12000);
  } catch {
    try {
      probe = await getJson(raw.replace(/^stremio:\/\//i, 'https://'), 0, 12000);
    } catch (e: any) {
      throw new Error(`Could not open this address (${e?.message || 'network error'})`);
    }
  }
  if (looksLikeCloudStream(probe)) {
    throw new Error(
      'This is a CloudStream repository. CloudStream plugins (.cs3) are native Android code and cannot run inside GooWatch. Use a Stremio add-on or a Nuvio provider repository instead.'
    );
  }
  if (probe && probe.id && probe.name) manifest = probe as ExtManifest;
  if (!manifest) throw new Error('This address is not a Stremio add-on or a Nuvio provider repository');
  const i = list.findIndex((e) => e.base === base || e.manifest.id === manifest!.id);
  const ext: InstalledExt = { kind: 'stremio', base, manifest, enabled: true, builtin };
  if (i >= 0) list[i] = { ...ext, enabled: list[i].enabled };
  else list.push(ext);
  save();
  return ext;
}

export function setScraperEnabled(base: string, id: string, on: boolean) {
  const e = load().find((x) => x.base === base);
  const s = e?.scrapers?.find((x) => x.id === id);
  if (s) s.userEnabled = on;
  save();
}

export function removeExtension(base: string) {
  state = load().filter((e) => e.base !== base);
  try {
    localStorage.setItem(KEY + '_removed', JSON.stringify([...(JSON.parse(localStorage.getItem(KEY + '_removed') || '[]')), base]));
  } catch {
    /* ignore */
  }
  save();
}

export function setExtensionEnabled(base: string, enabled: boolean) {
  const e = load().find((x) => x.base === base);
  if (e) e.enabled = enabled;
  save();
}

let seeded = false;
/** First start: install the built-in extensions in the background. */
export async function seedBuiltins() {
  if (seeded) return;
  seeded = true;
  let removed: string[] = [];
  try {
    removed = JSON.parse(localStorage.getItem(KEY + '_removed') || '[]');
  } catch {
    /* ignore */
  }
  const have = new Set(load().map((e) => e.base));
  for (const b of BUILTIN) {
    if (have.has(b.base) || removed.includes(b.base)) continue;
    try {
      await installExtension(b.base, true);
    } catch {
      /* offline - try again next start */
      seeded = false;
    }
  }
}

export function useExtensions(): InstalledExt[] {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    seedBuiltins();
    return () => {
      listeners.delete(l);
    };
  }, []);
  return load();
}
