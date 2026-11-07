import { Capacitor, CapacitorHttp } from '@capacitor/core';

export interface HttpResult {
  status: number;
  url: string;
  headers: Record<string, string>;
  text: string;
}
export interface HttpOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

const isElectron = typeof navigator !== 'undefined' && /Electron\//i.test(navigator.userAgent);

/** One HTTP call that works everywhere: native client on the phone, local relay on PC (no CORS), plain fetch otherwise. */
export async function request(url: string, opt: HttpOptions = {}): Promise<HttpResult> {
  const method = (opt.method || 'GET').toUpperCase();
  const timeoutMs = opt.timeoutMs ?? 20000;
  if (Capacitor.isNativePlatform()) {
    const r: any = await CapacitorHttp.request({
      url,
      method,
      headers: opt.headers || {},
      data: opt.body,
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
      responseType: 'text',
    });
    return {
      status: r.status,
      url: r.url || url,
      headers: r.headers || {},
      text: typeof r.data === 'string' ? r.data : JSON.stringify(r.data),
    };
  }
  const viaRelay = async (): Promise<HttpResult> => {
    const r = await fetch('/api/ext/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, method, headers: opt.headers || {}, body: opt.body }),
      signal: AbortSignal.timeout(timeoutMs + 5000),
    });
    const j = await r.json();
    if (!j || !j.status) throw new Error(j?.error || 'Network error');
    return { status: j.status, url: j.url || url, headers: j.headers || {}, text: j.body ?? '' };
  };
  const direct = async (): Promise<HttpResult> => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { method, headers: opt.headers, body: opt.body, signal: ctl.signal });
      const hdrs: Record<string, string> = {};
      r.headers.forEach((v, k) => (hdrs[k] = v));
      return { status: r.status, url: r.url || url, headers: hdrs, text: await r.text() };
    } finally {
      clearTimeout(t);
    }
  };
  if (isElectron) {
    try {
      return await viaRelay();
    } catch {
      return await direct();
    }
  }
  try {
    return await direct();
  } catch {
    return await viaRelay(); // CORS / network error in the browser: try the relay when there is one
  }
}

const cache = new Map<string, { t: number; v: any }>();

export async function getText(url: string, ttlMs = 0, timeoutMs = 20000): Promise<string> {
  const r = await request(url, { timeoutMs, headers: { Accept: '*/*' } });
  if (r.status >= 400 || r.status === 0) throw new Error(`HTTP ${r.status}`);
  return r.text;
}

export async function getJson<T = any>(url: string, ttlMs = 5 * 60 * 1000, timeoutMs = 15000): Promise<T> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v as T;
  const r = await request(url, { timeoutMs, headers: { Accept: 'application/json' } });
  if (r.status >= 400 || r.status === 0) throw new Error(`HTTP ${r.status}`);
  let data: any;
  try {
    data = JSON.parse(r.text);
  } catch {
    throw new Error('Not a JSON address');
  }
  cache.set(url, { t: Date.now(), v: data });
  return data as T;
}
