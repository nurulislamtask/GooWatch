import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Puzzle, ShieldAlert, X } from 'lucide-react';
import { ExtPreviewInfo, installExtension, previewExtension } from '../../extensions/store';

/** "Install this extension?" popup — shown when a website's Install button opens GooWatch. */
export const InstallPrompt: React.FC<{ address: string; onClose: () => void }> = ({ address, onClose }) => {
  const [info, setInfo] = useState<ExtPreviewInfo | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    setInfo(null);
    setErr('');
    setDone(false);
    previewExtension(address)
      .then((i) => alive && setInfo(i))
      .catch((e) => alive && setErr(e?.message || 'Could not read this extension'));
    return () => {
      alive = false;
    };
  }, [address]);

  const install = async () => {
    setBusy(true);
    setErr('');
    try {
      await installExtension(address);
      setDone(true);
      setTimeout(onClose, 1400);
    } catch (e: any) {
      setErr(e?.message || 'Install failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[600] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-t-3xl bg-[#11141C] p-5 shadow-2xl ring-1 ring-white/10 sm:rounded-3xl"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mb-4 flex items-start justify-between">
          <p className="text-[12px] font-bold uppercase tracking-wider text-amber-400">Install extension</p>
          <button onClick={onClose} aria-label="Close" className="-m-1 rounded-full p-1.5 text-zinc-400 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!info && !err && (
          <div className="flex items-center gap-3 py-8 text-zinc-300">
            <Loader2 className="h-5 w-5 animate-spin text-amber-400" /> Reading extension…
          </div>
        )}

        {info && (
          <>
            <div className="flex items-center gap-4">
              {info.logo ? (
                <img src={info.logo} alt="" className="h-16 w-16 shrink-0 rounded-2xl bg-white/5 object-contain p-1" />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400/25 to-orange-500/10">
                  <Puzzle className="h-8 w-8 text-amber-400" />
                </div>
              )}
              <div className="min-w-0">
                <h2 className="truncate text-[20px] font-extrabold text-white">{info.name}</h2>
                <p className="text-[12px] text-zinc-400">
                  {info.kind === 'nuvio' ? 'Nuvio provider repository' : 'Stremio add-on'}
                  {info.version ? ` · v${info.version}` : ''}
                </p>
              </div>
            </div>
            {info.description && <p className="mt-3 line-clamp-3 text-[13px] leading-relaxed text-zinc-300">{info.description}</p>}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {info.provides.map((p) => (
                <span key={p} className="rounded-full bg-white/[0.08] px-2.5 py-1 text-[11px] font-semibold capitalize text-zinc-200">
                  {p}
                </span>
              ))}
              {info.count ? (
                <span className="rounded-full bg-amber-400/15 px-2.5 py-1 text-[11px] font-semibold text-amber-300">
                  {info.count} {info.kind === 'nuvio' ? 'providers' : 'catalogs'}
                </span>
              ) : null}
            </div>
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-white/[0.04] p-2.5 text-[11.5px] leading-relaxed text-zinc-500">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="break-all">Only install extensions from people you trust. Source: {address}</span>
            </p>
          </>
        )}

        {err && <p className="mb-3 rounded-xl bg-rose-500/10 p-3 text-[13px] text-rose-300">{err}</p>}

        {done ? (
          <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-emerald-500/15 py-3.5 text-[15px] font-bold text-emerald-300">
            <CheckCircle2 className="h-5 w-5" /> Installed
          </div>
        ) : (
          <div className="mt-5 flex gap-2.5">
            <button onClick={onClose} className="flex-1 rounded-2xl bg-white/[0.08] py-3.5 text-[15px] font-semibold text-white active:scale-[0.98]">
              Cancel
            </button>
            <button
              onClick={install}
              disabled={busy || (!info && !err)}
              className="flex flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-amber-400 py-3.5 text-[15px] font-extrabold text-black active:scale-[0.98] disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {info?.installed ? 'Update / reinstall' : err ? 'Try anyway' : 'Install'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
