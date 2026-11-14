// Where the user stopped in each video (written by the players when they close / every few seconds).
// Every entry carries `u` (time of the change) and `by` (which device) so progress can be synced between devices.
const KEY = 'cineftp_resume_v1';
const GONE = 'cineftp_resume_gone_v1'; // finished / removed videos: remembered so another device does not bring them back

export type ResumeEntry = { t: number; d: number; u?: number; by?: string };
export type ResumeMap = Record<string, ResumeEntry>;

export function readResume(): ResumeMap {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

export function readGone(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(GONE) || '{}');
  } catch {
    return {};
  }
}

export function writeResumeAndGone(resume: ResumeMap, gone: Record<string, number>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(resume));
    const keys = Object.keys(gone);
    if (keys.length > 800) keys.sort((a, b) => gone[a] - gone[b]).slice(0, keys.length - 800).forEach((k) => delete gone[k]);
    localStorage.setItem(GONE, JSON.stringify(gone));
  } catch {
    /* ignore */
  }
}

/** "Phone", "Tablet", "PC" — shown as "continue on this device" hints. */
export function deviceLabel(): string {
  try {
    const ua = navigator.userAgent || '';
    if (/Electron\//i.test(ua)) return /Linux/i.test(ua) && !/Windows/i.test(ua) ? 'Linux PC' : 'PC';
    if (/Android|iPhone|iPad/i.test(ua)) return Math.min(window.screen.width, window.screen.height) >= 600 ? 'Tablet' : 'Phone';
    return 'Web';
  } catch {
    return 'Device';
  }
}

/** Saves a playback position. Near the end the video counts as finished (next time it starts from the beginning). */
export function saveResumePoint(id: string, t: number, d: number, finishGap = 45, flush = false) {
  try {
    const all = readResume();
    const gone = readGone();
    const now = Date.now();
    if (d > 0 && t > d - finishGap) {
      delete all[id];
      gone[id] = now;
    } else if (t > 10) {
      all[id] = { t, d, u: now, by: deviceLabel() };
      delete gone[id];
    } else {
      return;
    }
    const keys = Object.keys(all);
    if (keys.length > 600) keys.sort((a, b) => (all[a].u || 0) - (all[b].u || 0)).slice(0, keys.length - 600).forEach((k) => delete all[k]);
    writeResumeAndGone(all, gone);
    window.dispatchEvent(new Event(flush ? 'gw:sync-now' : 'gw:sync-soon'));
  } catch {
    /* ignore */
  }
}

export function clearResume(id?: string) {
  try {
    const all = readResume();
    const gone = readGone();
    const now = Date.now();
    if (!id) {
      Object.keys(all).forEach((k) => (gone[k] = now));
      writeResumeAndGone({}, gone);
    } else {
      delete all[id];
      gone[id] = now;
      writeResumeAndGone(all, gone);
    }
    window.dispatchEvent(new Event('gw:sync-soon'));
  } catch {
    /* ignore */
  }
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
