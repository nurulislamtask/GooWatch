import React, { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { getJson } from '../../extensions/http';
import { installExtension, removeExtension, getExtensions } from '../../extensions/store';
import { writePrefs } from '../prefs';

const EVENT = 'gw:torrentio-setup';
export const openTorrentioSetup = () => window.dispatchEvent(new Event(EVENT));

const PROVIDERS = [
  { id: 'realdebrid', name: 'Real-Debrid', where: 'real-debrid.com/apitoken' },
  { id: 'alldebrid', name: 'AllDebrid', where: 'alldebrid.com/apikeys' },
  { id: 'premiumize', name: 'Premiumize', where: 'premiumize.me/account' },
  { id: 'debridlink', name: 'Debrid-Link', where: 'debrid-link.com/webapp/apikey' },
  { id: 'offcloud', name: 'Offcloud', where: 'offcloud.com/#/account' },
];
const BASE = 'https://torrentio.strem.fun';

/** Sets Torrentio up inside the app: choose the debrid service, paste the key, done. No web page to open, nothing to copy back. */
export const TorrentioSetupHost: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [prov, setProv] = useState('realdebrid');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const f = () => {
      setMsg(null);
      setOpen(true);
    };
    window.addEventListener(EVENT, f);
    return () => window.removeEventListener(EVENT, f);
  }, []);
  if (!open) return null;
  const p = PROVIDERS.find((x) => x.id === prov)!;

  const save = async () => {
    const k = key.trim();
    if (k.length < 8) return setMsg({ ok: false, text: 'Paste the full key first.' });
    setBusy(true);
    setMsg(null);
    try {
      const base = `${BASE}/qualityfilter=scr,cam|${prov}=${k}`;
      // 1) does Torrentio accept this key? ask it for a famous movie
      const r: any = await getJson(`${base}/stream/movie/tt0111161.json`, 0, 20000);
      const list: any[] = r?.streams || [];
      const playable = list.filter((s) => s && s.url).length;
      if (!playable) {
        setMsg({ ok: false, text: `${p.name} did not accept this key (or your account is not active). Copy the key again from ${p.where} and retry.` });
        return;
      }
      // 2) replace the old Torrentio copies with this configured one
      for (const e of getExtensions()) if (/torrentio\.strem\.fun/i.test(e.base)) removeExtension(e.base);
      await installExtension(`${base}/manifest.json`);
      writePrefs({ extensionsOn: true });
      setMsg({ ok: true, text: `Done — ${playable} playable streams found. Movies and series now play directly.` });
      setKey('');
    } catch (e: any) {
      setMsg({ ok: false, text: `Could not reach Torrentio (${String(e?.message || e)}). Check the internet and try again.` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[450] flex items-end justify-center bg-black/70 backdrop-blur-sm md:items-center" onClick={() => setOpen(false)}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-t-3xl bg-[#14161E] p-5 ring-1 ring-white/10 md:rounded-3xl">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-extrabold text-white">Set up Torrentio</h2>
          <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-full bg-white/10 p-2">
            <X className="h-4 w-4 text-white" />
          </button>
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-zinc-400">
          Torrentio plays directly only with a debrid account (Real-Debrid etc.). Choose yours, paste its key, and press Save — it is tested at once.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {PROVIDERS.map((x) => (
            <button key={x.id} onClick={() => setProv(x.id)} className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-bold ${prov === x.id ? 'bg-amber-400 text-black' : 'bg-white/10 text-zinc-200'}`}>
              {x.name}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11.5px] text-zinc-500">Your {p.name} key is on: {p.where}</p>
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={`${p.name} API key`}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="mt-3 w-full rounded-xl bg-white/[0.08] px-4 py-3 text-[14px] text-white outline-none ring-1 ring-white/10 placeholder:text-zinc-500 focus:ring-amber-400/60"
        />
        {msg && <p className={`mt-3 text-[12.5px] leading-snug ${msg.ok ? 'text-emerald-400' : 'text-rose-400'}`}>{msg.text}</p>}
        <button onClick={save} disabled={busy} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 py-3 text-[14px] font-extrabold text-black active:scale-[0.98] disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {busy ? 'Testing…' : 'Save & test'}
        </button>
        <p className="mt-3 text-[11px] leading-snug text-zinc-600">The key stays on this device (and in your own sync note if sync is on).</p>
      </div>
    </div>
  );
};
