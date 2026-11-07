import { Capacitor, CapacitorHttp } from '@capacitor/core';

const cache = new Map<string, { t: number; v: any }>();

/** JSON GET. On the phone it uses the native HTTP client (no CORS); on PC the browser fetch. */
export async function getJson<T = any>(url: string, ttlMs = 5 * 60 * 1000, timeoutMs = 15000): Promise<T> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v as T;
  let data: any;
  if (Capacitor.isNativePlatform()) {
    const r: any = await CapacitorHttp.request({
      url,
      method: 'GET',
      headers: { Accept: 'application/json' },
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
      responseType: 'json',
    });
    if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
    data = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
  } else {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      data = await r.json();
    } finally {
      clearTimeout(t);
    }
  }
  cache.set(url, { t: Date.now(), v: data });
  return data as T;
}
