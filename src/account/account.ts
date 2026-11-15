import { useEffect, useState } from 'react';
import { request } from '../extensions/http';
import { GITHUB_CLIENT_ID, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from '../config/oauth';
import { createSync, joinSync, getSyncCfg } from '../sync/sync';

export type Provider = 'github' | 'google';
export interface Account {
  provider: Provider;
  name: string;
  login?: string;
  avatar?: string;
  token?: string; // GitHub token (gist permission) — used for sync
}
const KEY = 'gw_account_v1';
const OVERRIDE = 'gw_oauth_override';
const EVT = 'gw:account';

export function readAccount(): Account | null {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || 'null');
    return a && a.provider ? a : null;
  } catch {
    return null;
  }
}
function writeAccount(a: Account | null) {
  try {
    if (a) localStorage.setItem(KEY, JSON.stringify(a));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVT));
}
export function useAccount(): Account | null {
  const [a, setA] = useState<Account | null>(readAccount);
  useEffect(() => {
    const f = () => setA(readAccount());
    window.addEventListener(EVT, f);
    return () => window.removeEventListener(EVT, f);
  }, []);
  return a;
}
export const signOut = () => writeAccount(null);

function ids() {
  let o: any = {};
  try {
    o = JSON.parse(localStorage.getItem(OVERRIDE) || '{}');
  } catch {
    /* ignore */
  }
  return {
    github: (o.github || GITHUB_CLIENT_ID || '').trim(),
    google: (o.google || GOOGLE_CLIENT_ID || '').trim(),
    googleSecret: (o.googleSecret || GOOGLE_CLIENT_SECRET || '').trim(),
  };
}
export const providerReady = (p: Provider) => (p === 'github' ? !!ids().github : !!ids().google && !!ids().googleSecret);

export interface DeviceCode {
  userCode: string;
  url: string;
  expiresAt: number;
  interval: number;
  deviceCode: string;
  provider: Provider;
}

const form = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
const FORM_HEAD = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };

/** Step 1: ask the provider for a short code the person types on the provider's own page. */
export async function startLogin(p: Provider): Promise<DeviceCode> {
  const c = ids();
  if (!providerReady(p)) throw new Error('This sign-in is not set up in this version of the app yet. Use guest mode for now.');
  const r =
    p === 'github'
      ? await request('https://github.com/login/device/code', { method: 'POST', headers: FORM_HEAD, body: form({ client_id: c.github, scope: 'gist read:user' }) })
      : await request('https://oauth2.googleapis.com/device/code', { method: 'POST', headers: FORM_HEAD, body: form({ client_id: c.google, scope: 'openid email profile' }) });
  let j: any = {};
  try {
    j = JSON.parse(r.text);
  } catch {
    /* handled below */
  }
  if (!j.device_code) throw new Error(j.error_description || j.error || `Sign-in service did not answer (${r.status})`);
  return {
    provider: p,
    deviceCode: j.device_code,
    userCode: j.user_code,
    url: j.verification_uri || j.verification_url,
    interval: Math.max(5, Number(j.interval) || 5),
    expiresAt: Date.now() + (Number(j.expires_in) || 900) * 1000,
  };
}

/** Step 2: wait until the person approves on the provider's page. Resolves with the new account. */
export async function finishLogin(d: DeviceCode, cancelled: () => boolean): Promise<Account> {
  const c = ids();
  let wait = d.interval;
  while (Date.now() < d.expiresAt) {
    await new Promise((r) => setTimeout(r, wait * 1000));
    if (cancelled()) throw new Error('cancelled');
    const r =
      d.provider === 'github'
        ? await request('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: FORM_HEAD,
            body: form({ client_id: c.github, device_code: d.deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }),
          })
        : await request('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: FORM_HEAD,
            body: form({ client_id: c.google, client_secret: c.googleSecret, device_code: d.deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }),
          });
    let j: any = {};
    try {
      j = JSON.parse(r.text);
    } catch {
      /* keep waiting */
    }
    if (j.access_token) return await buildAccount(d.provider, String(j.access_token));
    if (j.error === 'slow_down') wait += 5;
    else if (j.error && j.error !== 'authorization_pending') throw new Error(j.error === 'access_denied' ? 'Sign-in was cancelled on the website.' : j.error_description || j.error);
  }
  throw new Error('The code expired. Start again.');
}

async function buildAccount(p: Provider, token: string): Promise<Account> {
  if (p === 'github') {
    const r = await request('https://api.github.com/user', { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
    const u = JSON.parse(r.text || '{}');
    const a: Account = { provider: 'github', name: u.name || u.login || 'GitHub user', login: u.login, avatar: u.avatar_url, token };
    writeAccount(a);
    return a;
  }
  const r = await request('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${token}` } });
  const u = JSON.parse(r.text || '{}');
  const a: Account = { provider: 'google', name: u.name || u.email || 'Google user', login: u.email, avatar: u.picture };
  writeAccount(a);
  return a;
}

/** After a GitHub sign-in: find this person's sync note (made on another device) or create it, so progress follows the account. */
export async function autoSync(a: Account): Promise<'joined' | 'created' | 'already' | 'none'> {
  if (a.provider !== 'github' || !a.token) return 'none';
  if (getSyncCfg()) return 'already';
  const r = await request('https://api.github.com/gists?per_page=100', { headers: { Authorization: `Bearer ${a.token}`, Accept: 'application/vnd.github+json' } });
  let list: any[] = [];
  try {
    list = JSON.parse(r.text);
  } catch {
    /* ignore */
  }
  const mine = Array.isArray(list) ? list.find((g) => g?.files && g.files['goowatch-sync.json']) : null;
  if (mine?.id) {
    await joinSync(`${mine.id}~${a.token}`);
    return 'joined';
  }
  await createSync(a.token);
  return 'created';
}
