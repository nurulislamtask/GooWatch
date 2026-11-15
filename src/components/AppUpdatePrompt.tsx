import React, { useEffect, useState } from 'react';
import { IS_CAPACITOR } from '../utils/platform';
import { NativePlayer } from '../mobile/nativePlayer';

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

/** Small card in the corner: tells that a new version exists. Nothing is forced — "Later" hides it until the next start. */
const Card: React.FC<{ title: string; text: string; children?: React.ReactNode; onLater?: () => void }> = ({ title, text, children, onLater }) => (
  <div className="fixed bottom-24 right-4 z-[900] w-[min(92vw,360px)] rounded-2xl bg-[#14171F] p-4 shadow-2xl ring-1 ring-amber-400/30 md:bottom-6">
    <div className="flex items-start gap-3">
      <img src="/icon.png" alt="" className="h-10 w-10 shrink-0 rounded-xl" onError={(e) => (e.currentTarget.style.display = 'none')} />
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-extrabold text-white">{title}</p>
        <p className="mt-0.5 text-[12.5px] leading-snug text-zinc-400">{text}</p>
      </div>
    </div>
    {children && <div className="mt-3">{children}</div>}
    {onLater && (
      <button onClick={onLater} className="mt-2 w-full rounded-xl py-2 text-[12.5px] font-semibold text-zinc-400 active:scale-[0.98]">
        Later
      </button>
    )}
  </div>
);

/** Desktop app: shows the update card; the download starts only when the person presses Update now. */
const DesktopUpdate: React.FC = () => {
  const [s, setS] = useState<DesktopState | null>(null);
  const [hidden, setHidden] = useState('');
  useEffect(() => {
    const d = (window as any).gwDesktop;
    if (!d || !d.onUpdate) return;
    return d.onUpdate((st: DesktopState) => setS(st));
  }, []);
  if (!s || s.state === 'none' || hidden === s.version) return null;
  const go = () => (window as any).gwDesktop?.retryUpdate?.();
  if (s.state === 'available')
    return (
      <Card title={`GooWatch ${s.version} is available`} text="A new version is ready. It installs in a minute and GooWatch restarts by itself." onLater={() => setHidden(s.version)}>
        <button onClick={go} className="w-full rounded-xl bg-amber-400 py-2.5 text-[14px] font-extrabold text-black active:scale-[0.98]">
          Update now
        </button>
      </Card>
    );
  if (s.state === 'error')
    return (
      <Card title="Update did not finish" text={s.message || 'The download failed.'} onLater={() => setHidden(s.version)}>
        <button onClick={go} className="w-full rounded-xl bg-amber-400 py-2.5 text-[14px] font-extrabold text-black active:scale-[0.98]">
          Try again
        </button>
      </Card>
    );
  return (
    <Card title={s.state === 'ready' ? 'Installing…' : `Downloading ${s.version}`} text={s.state === 'ready' ? 'GooWatch will restart by itself.' : `${Math.round(s.percent)}% — you can keep watching.`}>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${s.state === 'ready' ? 100 : Math.max(4, s.percent)}%` }} />
      </div>
    </Card>
  );
};

/** Phone app: checks GitHub for a newer release and shows the update card (Update now / Later). */
const PhoneUpdate: React.FC = () => {
  const [update, setUpdate] = useState<{ version: string; apk: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState('');

  useEffect(() => {
    if (!__APP_VERSION__ || __APP_VERSION__ === '0.0.0') return;
    let alive = true;
    const check = async () => {
      const rel = await fetchLatestRelease();
      if (!alive || !rel) return;
      if (isNewer(rel.version, __APP_VERSION__)) setUpdate(rel);
    };
    const first = window.setTimeout(check, 1500);
    const every = window.setInterval(check, 60 * 60 * 1000);
    return () => {
      alive = false;
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, []);

  if (!update || hidden === update.version) return null;
  return (
    <Card
      title={`GooWatch ${update.version} is available`}
      text={busy ? 'Downloading… the installer opens when it is done. If Android asks, allow “Install unknown apps” for GooWatch.' : `You have ${__APP_VERSION__}. Update takes about a minute.`}
      onLater={busy ? undefined : () => setHidden(update.version)}
    >
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await NativePlayer.installUpdate({ url: update.apk });
          } catch {
            /* ignore */
          }
          window.setTimeout(() => setBusy(false), 20000);
        }}
        className="w-full rounded-xl bg-amber-400 py-2.5 text-[14px] font-extrabold text-black active:scale-[0.98] disabled:opacity-60"
      >
        {busy ? 'Downloading…' : 'Update now'}
      </button>
    </Card>
  );
};

export const AppUpdatePrompt: React.FC = () => (IS_CAPACITOR ? <PhoneUpdate /> : <DesktopUpdate />);
