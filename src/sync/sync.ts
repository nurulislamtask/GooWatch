// Sync between devices (phone, tablet, PC): watch progress, "Continue watching", My List.
// Every device keeps its own copy; copies are merged through one small shared JSON document that is identified by a sync code.
// Merge rule: for every title the newest change wins (finished / removed titles are remembered so they do not come back).
import { useEffect, useState } from 'react';
import { request } from '../extensions/http';
import { deviceLabel, readGone, readResume, ResumeMap, writeResumeAndGone } from '../mobile/resume';

const CFG_KEY = 'gw_sync_v1';
const DEV_KEY = 'gw_device_id_v1';
const RECENT_KEY = 'cineftp_recent_v6';
const WATCH_KEY = 'cineftp_watchlist_v6';
const EXT_KEY = 'goowatch_ext_list_v1';
const STAMPS: Record<StoreName, string> = { watch: 'gw_watch_stamps_v1', ext: 'gw_ext_stamps_v1' };
const POLL_MS = 30_000;
const SOON_MS = 12_000;

type StoreName = 'watch' | 'ext';
type Stamp = { u: number; del?: 1 };
type ListDoc = Record<string, Stamp & { item?: any }>;
interface RecentLite {
  id: string;
  at: number;
  video: any;
  seriesItem?: any;
}
interface Doc {
  v: 1;
  resume: ResumeMap;
  gone: Record<string, number>;
  recent: RecentLite[];
  watch: ListDoc;
  ext: ListDoc;
  dev: Record<string, { n: string; u: number }>;
}
export interface SyncCfg {
  id: string; // gist id
  token: string; // the user's GitHub key (permission: gist only)
  last?: number;
}
export interface SyncStatus {
  state: 'idle' | 'syncing' | 'ok' | 'error';
  last?: number;
  error?: string;
  devices: { name: string; at: number; me: boolean }[];
}

// ---------- small helpers ----------
const readJson = <T,>(k: string, fb: T): T => {
  try {
    const v = JSON.parse(localStorage.getItem(k) || 'null');
    return v ?? fb;
  } catch {
    return fb;
  }
};
const writeJson = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage full */
  }
};

function deviceId(): string {
  let d = '';
  try {
    d = localStorage.getItem(DEV_KEY) || '';
    if (!d) {
      d = Math.random().toString(36).slice(2, 10);
      localStorage.setItem(DEV_KEY, d);
    }
  } catch {
    d = 'dev';
  }
  return d;
}

/** Keep documents small: the episode guide only keeps what the player needs, big lists are dropped. */
function slim(item: any, keepGuide: boolean): any {
  if (!item || typeof item !== 'object') return item;
  const o = { ...item };
  if (Array.isArray(o.episodeGuide)) {
    if (keepGuide && o.episodeGuide.length <= 300) {
      o.episodeGuide = o.episodeGuide.map((g: any) => ({ videoId: g.videoId, season: g.season, episode: g.episode, title: g.title, released: g.released }));
    } else delete o.episodeGuide;
  }
  delete o.playlist;
  return o;
}

export function stampItem(store: StoreName, id: string, removed: boolean) {
  const m = readJson<Record<string, Stamp>>(STAMPS[store], {});
  m[id] = removed ? { u: Date.now(), del: 1 } : { u: Date.now() };
  const keys = Object.keys(m);
  if (keys.length > 1500) keys.sort((a, b) => m[a].u - m[b].u).slice(0, keys.length - 1500).forEach((k) => delete m[k]);
  writeJson(STAMPS[store], m);
  window.dispatchEvent(new Event('gw:sync-soon'));
}

// ---------- local snapshot <-> document ----------
function listDoc(store: StoreName, items: any[]): ListDoc {
  const stamps = readJson<Record<string, Stamp>>(STAMPS[store], {});
  const out: ListDoc = {};
  const keep = store === 'watch' ? 150 : 150;
  items.slice(0, keep).forEach((it) => {
    if (!it?.id) return;
    out[it.id] = { u: stamps[it.id]?.u || 1, item: slim(it, false) };
  });
  for (const [id, s] of Object.entries(stamps)) if (s.del) out[id] = { u: s.u, del: 1 };
  return out;
}

function localDoc(): Doc {
  const recentFull = readJson<any[]>(RECENT_KEY, []);
  const recent: RecentLite[] = recentFull.slice(0, 20).map((r, i) => ({
    id: r.id,
    at: r.updatedAt || 0,
    video: slim(r.video, i < 12),
    seriesItem: r.seriesItem ? slim(r.seriesItem, false) : undefined,
  }));
  return {
    v: 1,
    resume: readResume(),
    gone: readGone(),
    recent,
    watch: listDoc('watch', readJson<any[]>(WATCH_KEY, [])),
    ext: listDoc('ext', readJson<any[]>(EXT_KEY, [])),
    dev: {},
  };
}

function mergeLists(a: ListDoc, b: ListDoc): ListDoc {
  const out: ListDoc = {};
  for (const id of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    const x = a?.[id];
    const y = b?.[id];
    out[id] = !x ? y : !y ? x : y.u > x.u ? y : x;
  }
  return out;
}

function merge(l: Doc, r: Doc): Doc {
  const resume: ResumeMap = {};
  const gone: Record<string, number> = {};
  const cutoff = Date.now() - 90 * 24 * 3600 * 1000;
  const ids = new Set([...Object.keys(l.resume || {}), ...Object.keys(r.resume || {}), ...Object.keys(l.gone || {}), ...Object.keys(r.gone || {})]);
  for (const id of ids) {
    const le = l.resume?.[id];
    const re = r.resume?.[id];
    const lu = le ? le.u || 1 : 0;
    const ru = re ? re.u || 1 : 0;
    const best = lu >= ru ? le : re;
    const bu = Math.max(lu, ru);
    const g = Math.max(l.gone?.[id] || 0, r.gone?.[id] || 0);
    if (g > bu) {
      if (g > cutoff) gone[id] = g;
    } else if (best) {
      resume[id] = best;
      if (g) gone[id] = g;
    }
  }
  const rec = new Map<string, RecentLite>();
  for (const x of [...(l.recent || []), ...(r.recent || [])]) {
    const cur = rec.get(x.id);
    if (!cur || x.at > cur.at) rec.set(x.id, x);
  }
  const recent = [...rec.values()].sort((a, b) => b.at - a.at).slice(0, 30);
  return { v: 1, resume, gone, recent, watch: mergeLists(l.watch, r.watch), ext: mergeLists(l.ext, r.ext), dev: { ...(r.dev || {}), ...(l.dev || {}) } };
}

const core = (d: Doc) => JSON.stringify({ r: d.resume, g: d.gone, c: d.recent.map((x) => [x.id, x.at]), w: Object.entries(d.watch).map(([k, v]) => [k, v.u, v.del || 0]).sort(), e: Object.entries(d.ext).map(([k, v]) => [k, v.u, v.del || 0]).sort() });

function activeItems(l: ListDoc): { id: string; u: number; item: any }[] {
  return Object.entries(l)
    .filter(([, v]) => !v.del && v.item)
    .map(([id, v]) => ({ id, u: v.u, item: v.item }))
    .sort((a, b) => b.u - a.u);
}

/** Writes the merged result into this device's own storage and tells the screens to refresh. */
function applyLocal(m: Doc) {
  writeResumeAndGone({ ...m.resume }, { ...m.gone });

  // Continue watching entries
  const localRecent = readJson<any[]>(RECENT_KEY, []);
  const byId = new Map(localRecent.map((r) => [r.id, r]));
  const recent = m.recent.map((x) => {
    const mine = byId.get(x.id);
    if (mine && (mine.updatedAt || 0) >= x.at) return mine;
    return { id: x.id, video: x.video, seriesItem: x.seriesItem, playlist: mine?.playlist || [], subtitles: mine?.subtitles || [], currentTime: 0, duration: 0, updatedAt: x.at };
  });
  writeJson(RECENT_KEY, recent);

  for (const store of ['watch', 'ext'] as StoreName[]) {
    const doc = m[store];
    const stamps: Record<string, Stamp> = {};
    for (const [id, v] of Object.entries(doc)) stamps[id] = v.del ? { u: v.u, del: 1 } : { u: v.u };
    writeJson(STAMPS[store], stamps);
    const items = activeItems(doc).map((x) => x.item);
    writeJson(store === 'watch' ? WATCH_KEY : EXT_KEY, items);
  }
  window.dispatchEvent(new CustomEvent('gw:sync-applied', { detail: { recent, watch: readJson<any[]>(WATCH_KEY, []) } }));
}

// ---------- transport: one private GitHub Gist per user (free, reliable, owned by the user) ----------
const GH = 'https://api.github.com';
const FILE = 'goowatch-sync.json';
const ghHeaders = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
});
const ghFail = (status: number): Error =>
  status === 401 || status === 403
    ? new Error('GitHub did not accept this key. Create a new one with the "gist" permission and try again.')
    : status === 404
    ? new Error('Sync not found. Check the sync code (copy it completely).')
    : new Error(`Sync server error (${status})`);

async function httpGet(cfg: SyncCfg): Promise<Doc> {
  const r = await request(`${GH}/gists/${cfg.id}`, { headers: ghHeaders(cfg.token), timeoutMs: 20000 });
  if (r.status >= 400 || r.status === 0) throw ghFail(r.status);
  let f: any;
  try {
    f = JSON.parse(r.text)?.files?.[FILE];
  } catch {
    f = null;
  }
  if (!f) throw new Error('This code does not belong to a GooWatch sync');
  let text: string = f.content || '';
  if (f.truncated && f.raw_url) text = (await request(f.raw_url, { timeoutMs: 20000 })).text;
  let d: any;
  try {
    d = JSON.parse(text);
  } catch {
    throw new Error('This code does not belong to a GooWatch sync');
  }
  if (!d || d.v !== 1) throw new Error('This code does not belong to a GooWatch sync');
  return d as Doc;
}
async function httpPut(cfg: SyncCfg, d: Doc): Promise<void> {
  const r = await request(`${GH}/gists/${cfg.id}`, {
    method: 'PATCH',
    headers: ghHeaders(cfg.token),
    body: JSON.stringify({ files: { [FILE]: { content: JSON.stringify(d) } } }),
    timeoutMs: 25000,
  });
  if (r.status >= 400 || r.status === 0) throw ghFail(r.status);
}
async function httpCreate(token: string, d: Doc): Promise<string> {
  const r = await request(`${GH}/gists`, {
    method: 'POST',
    headers: ghHeaders(token),
    body: JSON.stringify({ description: 'GooWatch sync (do not edit)', public: false, files: { [FILE]: { content: JSON.stringify(d) } } }),
    timeoutMs: 25000,
  });
  if (r.status >= 400 || r.status === 0) throw ghFail(r.status);
  let id = '';
  try {
    id = String(JSON.parse(r.text).id || '');
  } catch {
    /* handled below */
  }
  if (!/^[0-9a-f]{6,64}$/i.test(id)) throw new Error('GitHub did not return a sync id. Try again.');
  return id;
}

// ---------- state ----------
export function getSyncCfg(): SyncCfg | null {
  const c = readJson<SyncCfg | null>(CFG_KEY, null);
  return c && c.id && c.token ? c : null;
}
let status: SyncStatus = { state: 'idle', devices: [] };
const subs = new Set<() => void>();
const setStatus = (p: Partial<SyncStatus>) => {
  status = { ...status, ...p };
  subs.forEach((f) => f());
};
export function useSyncStatus(): { status: SyncStatus; cfg: SyncCfg | null } {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  }, []);
  return { status, cfg: getSyncCfg() };
}

let running = false;
let again = false;

/** One round: download, merge, save locally, upload when something changed. */
export async function syncNow(): Promise<void> {
  const cfg = getSyncCfg();
  if (!cfg) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  setStatus({ state: 'syncing', error: undefined });
  try {
    const remote = await httpGet(cfg);
    const me = deviceId();
    const l = localDoc();
    const m = merge(l, remote);
    const now = Date.now();
    const myDev = remote.dev?.[me];
    const heartbeat = !myDev || now - myDev.u > 10 * 60 * 1000 || myDev.n !== deviceLabel();
    m.dev = { ...(remote.dev || {}), [me]: { n: deviceLabel(), u: heartbeat ? now : myDev.u } };
    // forget devices that were not seen for 60 days
    for (const [k, v] of Object.entries(m.dev)) if (now - v.u > 60 * 24 * 3600 * 1000) delete m.dev[k];

    if (core(m) !== core(l)) applyLocal(m);
    if (core(m) !== core(remote) || heartbeat) {
      let out = m;
      if (JSON.stringify(out).length > 800_000) out = { ...m, recent: m.recent.map((x) => ({ ...x, video: slim({ ...x.video, episodeGuide: undefined }, false) })) };
      await httpPut(cfg, out);
    }
    writeJson(CFG_KEY, { ...cfg, last: now });
    setStatus({
      state: 'ok',
      last: now,
      devices: Object.entries(m.dev).map(([k, v]) => ({ name: v.n, at: v.u, me: k === me })).sort((a, b) => b.at - a.at),
    });
  } catch (e: any) {
    setStatus({ state: 'error', error: String(e?.message || e) });
  } finally {
    running = false;
    if (again) {
      again = false;
      setTimeout(syncNow, 800);
    }
  }
}

/** The text to type on the other devices (gist id + key). */
export const syncCode = (c: SyncCfg) => `${c.id}~${c.token}`;

/** Turns sync on for this device with a GitHub key and returns the code to type on the other devices. */
export async function createSync(token: string): Promise<string> {
  const tk = token.trim();
  if (!tk) throw new Error('Paste your GitHub key first');
  setStatus({ state: 'syncing', error: undefined });
  try {
    const d = localDoc();
    d.dev = { [deviceId()]: { n: deviceLabel(), u: Date.now() } };
    const id = await httpCreate(tk, d);
    const cfg: SyncCfg = { id, token: tk };
    writeJson(CFG_KEY, cfg);
    setStatus({ state: 'ok', last: Date.now() });
    syncNow();
    return syncCode(cfg);
  } catch (e: any) {
    setStatus({ state: 'error', error: String(e?.message || e) });
    throw e;
  }
}

export function parseCode(input: string): SyncCfg | null {
  const t = input.trim();
  const i = t.indexOf('~');
  if (i < 6) return null;
  const id = t.slice(0, i).trim();
  const token = t.slice(i + 1).trim();
  return /^[0-9a-f]{6,64}$/i.test(id) && token.length > 10 ? { id, token } : null;
}

/** Joins the sync of another device with its code; everything on this device is kept and merged. */
export async function joinSync(input: string): Promise<void> {
  const cfg = parseCode(input);
  if (!cfg) throw new Error('That does not look like a sync code. Copy the whole code from your other device.');
  setStatus({ state: 'syncing', error: undefined });
  try {
    await httpGet(cfg); // proves the code works
    writeJson(CFG_KEY, cfg);
    running = false;
    await syncNow();
    if (status.state === 'error') throw new Error(status.error || 'Sync failed');
  } catch (e: any) {
    try {
      if (status.state === 'error') localStorage.removeItem(CFG_KEY);
    } catch {
      /* ignore */
    }
    setStatus({ state: 'error', error: String(e?.message || e) });
    throw e;
  }
}

export function leaveSync() {
  try {
    localStorage.removeItem(CFG_KEY);
  } catch {
    /* ignore */
  }
  setStatus({ state: 'idle', error: undefined, last: undefined, devices: [] });
}

let started = false;
/** Starts the background loop: pulls every 30 s, pushes soon after you watch something, and when the app comes back to the screen. */
export function startSyncLoop() {
  if (started || typeof window === 'undefined') return;
  started = true;
  let soon: number | undefined;
  window.addEventListener('gw:sync-now', () => syncNow());
  window.addEventListener('gw:sync-soon', () => {
    if (!getSyncCfg() || soon) return;
    soon = window.setTimeout(() => {
      soon = undefined;
      syncNow();
    }, SOON_MS);
  });
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && syncNow());
  window.addEventListener('online', () => syncNow());
  window.setInterval(() => document.visibilityState !== 'hidden' && syncNow(), POLL_MS);
  setTimeout(syncNow, 1500);
}
