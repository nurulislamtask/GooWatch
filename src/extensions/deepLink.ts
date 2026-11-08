import { useEffect, useRef } from 'react';
import { IS_CAPACITOR } from '../utils/platform';
import { NativePlayer } from '../mobile/nativePlayer';

/** stremio://host/x/manifest.json · nuvio://install?url=… · goowatch://install?url=… · goowatch://github.com/… → an https address (or null). */
export function parseInstallLink(link: string): string | null {
  const s = (link || '').trim();
  const m = s.match(/^(stremio|nuvio|goowatch):\/\/(.*)$/i);
  if (!m) return null;
  const scheme = m[1].toLowerCase();
  let rest = m[2];
  // ?url=… / ?repo=… / ?addon=… form
  const q = rest.match(/[?&](?:url|repo|addon|manifest|u)=([^&#]+)/i);
  if (q) {
    let v = q[1];
    try {
      v = decodeURIComponent(v);
    } catch {
      /* keep */
    }
    if (/^(stremio|nuvio|goowatch):\/\//i.test(v)) return parseInstallLink(v);
    return /^https?:\/\//i.test(v) ? v : `https://${v}`;
  }
  rest = rest.replace(/^install\/?/i, '').replace(/^\/+/, '');
  if (!rest) return null;
  // Stremio add-ons on a local computer use plain http
  const local = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(rest);
  void scheme;
  return `${local ? 'http' : 'https'}://${rest}`;
}

/** Calls onLink with the address whenever a website / the system opens GooWatch with an install link. */
export function useInstallLinks(onLink: (address: string) => void) {
  const cb = useRef(onLink);
  cb.current = onLink;
  useEffect(() => {
    let alive = true;
    const take = (raw?: string | null) => {
      if (!alive || !raw) return;
      const a = parseInstallLink(raw);
      if (a) cb.current(a);
    };
    const fromWeb = (e?: any) => {
      const w: any = window;
      const u = (e && e.detail) || w.__gwPendingLink;
      w.__gwPendingLink = null;
      take(u);
    };
    const fromNative = async () => {
      try {
        const r = await NativePlayer.getLaunchUrl();
        take(r && r.url);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('goowatch-link', fromWeb);
    window.addEventListener('goowatchlink', fromNative);
    if (IS_CAPACITOR) fromNative();
    else fromWeb();
    return () => {
      alive = false;
      window.removeEventListener('goowatch-link', fromWeb);
      window.removeEventListener('goowatchlink', fromNative);
    };
  }, []);
}
