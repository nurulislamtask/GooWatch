import { useCallback, useEffect, useState } from 'react';

const KEY = 'cineftp_mobile_prefs_v1';

export interface MobilePrefs {
  heroAutoSlide: boolean;
  showContinue: boolean;
  resumePlayback: boolean;
  softwareDecoder: boolean;
  autoSubtitles: boolean;
  subtitleLang: string; // opensubtitles code: eng, ben, hin ...
  homeHidden: string[]; // source ids that are not shown on Home
  extensionsOn: boolean; // use add-ons (Stremio / Nuvio) for Discover, Home rows and search
  contentMode: 'all' | 'family' | 'kids';
  kidsPin: string; // optional 4-digit PIN needed to leave Kids / Family mode
  fullscreen: boolean; // Android: hide the status bar and navigation bar
  omdbKey: string; // optional free OMDb key -> Rotten Tomatoes scores
}

const DEFAULTS: MobilePrefs = {
  heroAutoSlide: true,
  showContinue: true,
  resumePlayback: true,
  softwareDecoder: false,
  autoSubtitles: true,
  subtitleLang: 'eng',
  homeHidden: [],
  extensionsOn: true,
  contentMode: 'all',
  kidsPin: '',
  fullscreen: true,
  omdbKey: '',
};

export function readPrefs(): MobilePrefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Changes settings from outside a component (add-on install, mode switch…). */
export function writePrefs(patch: Partial<MobilePrefs>) {
  const next = { ...readPrefs(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  window.dispatchEvent(new Event('cineftp:prefs'));
}

export function usePrefs(): [MobilePrefs, (patch: Partial<MobilePrefs>) => void] {
  const [prefs, setPrefs] = useState<MobilePrefs>(readPrefs);
  useEffect(() => {
    const on = () => setPrefs(readPrefs());
    window.addEventListener('cineftp:prefs', on);
    return () => window.removeEventListener('cineftp:prefs', on);
  }, []);
  const update = useCallback((patch: Partial<MobilePrefs>) => {
    const next = { ...readPrefs(), ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
    setPrefs(next);
    window.dispatchEvent(new Event('cineftp:prefs'));
  }, []);
  return [prefs, update];
}
