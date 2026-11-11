import React, { useEffect, useState } from 'react';
import { IS_CAPACITOR } from '../utils/platform';
import { NativePlayer } from '../mobile/nativePlayer';
import { registerBack } from '../mobile/backStack';

const REPO = 'nurulislamtask/GooWatch';

export function num(v: string): number[] {
  return v.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
}
export function isNewer(a: string, b: string): boolean {
  const x = num(a);
  const y = num(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  }
  return false;
}

export async function fetchLatestRelease(): Promise<{ version: string; apk: string } | null> {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!r.ok) return null;
    const rel = await r.json();
    const apk = (rel.assets || []).find((a: any) => /\.apk$/i.test(a.name));
    if (!apk) return null;
    return { version: String(rel.tag_name || '').replace(/^v/i, ''), apk: apk.browser_download_url };
  } catch {
    return null;
  }
}

type DesktopState = { state: 'none' | 'available' | 'downloading' | 'ready' | 'error'; version: string; percent: number; message: string };

/** Full-screen, un-skippable screen: while a newer version exists nobody can use the app. */
const Blocker: React.FC<{ version: string; current: string; children: React.ReactNode }> = ({ version, current, children }) => (
  <div className="fixed inset-0 z-[900] flex items-center justify-center bg-[#07080C] p-6 text-center" onContextMenu={(e) => e.preventDefault()}>
    <div className="w-full max-w-sm">
      <img src="/icon.png" alt="" className="mx-auto mb-5 h-20 w-20 rounded-3xl" onError={(e) => (e.currentTarget.style.display = 'none')} />
      <h2 className="text-[22px] font-extrabold text-white">Update required</h2>
      <p className="mt-2 text-[13.5px] leading-relaxed text-zinc-400">
        GooWatch <b className="text-amber-400">{version}</b> is out{current ? ` (you have ${current})` : ''}. You need to update before you can keep watching.
      </p>
      <div className="mt-6">{children}</div>
    </div>
  </div>
);

/** Desktop app: the main process downloads the update by itself; this screen shows the progress. */
const DesktopUpdate: React.FC = () => {
  const [s, setS] = useState<DesktopState | null>(null);
  useEffect(() => {
    const d = (window as any).gwDesktop;
    if (!d || !d.onUpdate) return;
    return d.onUpdate((st: DesktopState) => setS(st));
  }, []);
  if (!s || s.state === 'none') return null;
  return (
    <Blocker version={s.version} current={__APP_VERSION__ !== '0.0.0' ? __APP_VERSION__ : ''}>
      {s.state === 'error' ? (
        <>
          <p className="mb-3 break-words text-[12.5px] text-rose-300">{s.message || 'The download failed.'}</p>
          <button onClick={() => (window as any).gwDesktop?.retryUpdate?.()} className="w-full rounded-2xl bg-amber-400 py-3.5 text-[15px] font-extrabold text-black active:scale-[0.98]">
            Try again
          </button>
        </>
      ) : (
        <>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${s.state === 'ready' ? 100 : Math.max(4, s.percent)}%` }} />
          </div>
          <p className="mt-3 text-[13px] text-zinc-300">
            {s.state === 'ready' ? 'Installing… GooWatch will restart by itself.' : s.state === 'available' ? 'Starting download…' : `Downloading… ${Math.round(s.percent)}%`}
          </p>
        </>
      )}
    </Blocker>
  );
};

/** Phone app: checks GitHub for a newer release; the update cannot be skipped. */
const PhoneUpdate: React.FC = () => {
  const [update, setUpdate] = useState<{ version: string; apk: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!__APP_VERSION__ || __APP_VERSION__ === '0.0.0') return;
    let alive = true;
    const check = async () => {
      const rel = await fetchLatestRelease();
      if (!alive || !rel) return;
      if (isNewer(rel.version, __APP_VERSION__)) setUpdate(rel);
    };
    const first = window.setTimeout(check, 1500);
    const every = window.setInterval(check, 20 * 60 * 1000);
    const vis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', vis);
    return () => {
      alive = false;
      window.clearTimeout(first);
      window.clearInterval(every);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);

  // the phone's Back button must not get around the update screen
  useEffect(() => {
    if (!update) return;
    return registerBack(() => true);
  }, [update]);

  if (!update) return null;
  return (
    <Blocker version={update.version} current={__APP_VERSION__}>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await NativePlayer.installUpdate({ url: update.apk });
          } catch {
            /* ignore */
          }
          window.setTimeout(() => setBusy(false), 20000); // allow another try if the installer did not open
        }}
        className="w-full rounded-2xl bg-amber-400 py-3.5 text-[15px] font-extrabold text-black active:scale-[0.98] disabled:opacity-60"
      >
        {busy ? 'Downloading… the installer opens when it is done' : 'Update now'}
      </button>
      {busy && <p className="mt-3 text-[12px] text-zinc-500">Progress is in the notification bar. If Android asks, allow “Install unknown apps” for GooWatch, then press Install.</p>}
    </Blocker>
  );
};

export const AppUpdatePrompt: React.FC = () => (IS_CAPACITOR ? <PhoneUpdate /> : <DesktopUpdate />);
