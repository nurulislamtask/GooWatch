import React, { useState } from 'react';
import { ArrowLeft, Loader2, Plus, Puzzle, Trash2 } from 'lucide-react';
import { installExtension, removeExtension, setExtensionEnabled, setScraperEnabled, SUGGESTED, useExtensions } from '../../extensions/store';
import { getTmdbKey, setTmdbKey } from '../../extensions/nuvio';

export const ExtManager: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const exts = useExtensions();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [tmdb, setTmdb] = useState(getTmdbKey());
  const [open, setOpen] = useState<string | null>(null);

  const add = async (address: string) => {
    setBusy(true);
    setMsg('');
    try {
      const e = await installExtension(address);
      setMsg(`Installed: ${e.manifest.name}`);
      setUrl('');
    } catch (err: any) {
      setMsg(err?.message || 'Could not install this extension');
    } finally {
      setBusy(false);
    }
  };

  const have = new Set(exts.map((e) => e.base));

  return (
    <div className="fixed inset-0 z-[250] overflow-y-auto bg-[#07080C] pb-10">
      <div className="sticky top-0 z-10 flex items-center gap-2 bg-[#07080C]/95 px-3 py-3 backdrop-blur">
        <button onClick={onClose} aria-label="Back" className="rounded-full p-2 active:bg-white/10">
          <ArrowLeft className="h-5 w-5 text-white" />
        </button>
        <h1 className="text-[18px] font-extrabold text-white">Extensions</h1>
      </div>

      <div className="mx-auto max-w-2xl px-4">
        <p className="text-[12.5px] leading-relaxed text-zinc-400">
          Extensions bring movies, series, anime, streams and subtitles into GooWatch. Paste the address of:
        </p>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[12.5px] text-zinc-400">
          <li><span className="text-zinc-200">Stremio add-on</span> – <span className="text-zinc-300">…/manifest.json</span> or <span className="text-zinc-300">stremio://…</span></li>
          <li><span className="text-zinc-200">Nuvio provider repository</span> – its GitHub page or raw folder address</li>
        </ul>

        <div className="mt-4 flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Add-on or provider repository address"
            inputMode="url"
            autoCapitalize="none"
            className="min-w-0 flex-1 rounded-xl bg-white/[0.08] px-3 py-3 text-[14px] text-white outline-none placeholder:text-zinc-500"
          />
          <button
            onClick={() => add(url)}
            disabled={busy || !url.trim()}
            className="flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 text-[14px] font-bold text-black disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
          </button>
        </div>
        {msg && <p className="mt-2 text-[12.5px] text-amber-300">{msg}</p>}

        <h2 className="mb-2 mt-6 text-[11.5px] font-bold uppercase tracking-wider text-zinc-500">Installed</h2>
        <div className="divide-y divide-white/[0.05] overflow-hidden rounded-2xl bg-[#0F121A] ring-1 ring-white/[0.05]">
          {exts.length === 0 && <p className="p-4 text-[13px] text-zinc-500">Nothing installed yet — installing the built-in ones…</p>}
          {exts.map((e) => (
            <div key={e.base}>
            <div className="flex items-center gap-3 p-3">
              {e.manifest.logo ? (
                <img src={e.manifest.logo} alt="" className="h-10 w-10 shrink-0 rounded-lg bg-white/5 object-contain" />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5">
                  <Puzzle className="h-5 w-5 text-zinc-400" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-white">
                  {e.manifest.name} <span className="text-[11px] font-normal text-zinc-500">{e.kind === 'nuvio' ? 'Nuvio' : 'Stremio'} {e.manifest.version || ''}</span>
                </p>
                <p className="line-clamp-2 text-[11.5px] text-zinc-500">
                  {(e.manifest.resources || []).map((r) => (typeof r === 'string' ? r : r.name)).filter((v, i, a) => a.indexOf(v) === i).join(' · ')}
                  {e.manifest.description ? ` — ${e.manifest.description}` : ''}
                </p>
              </div>
              <button
                role="switch"
                aria-checked={e.enabled}
                onClick={() => setExtensionEnabled(e.base, !e.enabled)}
                className={`relative h-[26px] w-11 shrink-0 rounded-full transition-colors ${e.enabled ? 'bg-amber-400' : 'bg-white/15'}`}
              >
                <span className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-all ${e.enabled ? 'left-[22px]' : 'left-[3px]'}`} />
              </button>
              {e.kind === 'nuvio' && (
                <button onClick={() => setOpen(open === e.base ? null : e.base)} className="rounded-lg bg-white/10 px-2 py-1 text-[11px] font-semibold text-zinc-200">
                  {open === e.base ? 'Hide' : `${e.scrapers?.length || 0} providers`}
                </button>
              )}
              <button onClick={() => removeExtension(e.base)} aria-label="Remove" className="rounded-full p-2 text-zinc-400 active:bg-white/10">
                <Trash2 className="h-4.5 w-4.5" />
              </button>
            </div>
            {e.kind === 'nuvio' && open === e.base && (
              <div className="bg-black/25 px-3 pb-2">
                {(e.scrapers || []).map((sc) => (
                  <div key={sc.id} className="flex items-center gap-3 border-t border-white/[0.04] py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-zinc-100">{sc.name}</p>
                      <p className="truncate text-[11px] text-zinc-500">{(sc.supportedTypes || []).join(' · ')}{sc.description ? ` — ${sc.description}` : ''}</p>
                    </div>
                    <button
                      role="switch"
                      aria-checked={sc.userEnabled !== false}
                      onClick={() => setScraperEnabled(e.base, sc.id, sc.userEnabled === false)}
                      className={`relative h-[22px] w-10 shrink-0 rounded-full transition-colors ${sc.userEnabled !== false ? 'bg-amber-400' : 'bg-white/15'}`}
                    >
                      <span className={`absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all ${sc.userEnabled !== false ? 'left-[21px]' : 'left-[3px]'}`} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            </div>
          ))}
        </div>

        <h2 className="mb-2 mt-6 text-[11.5px] font-bold uppercase tracking-wider text-zinc-500">TMDB API key (for Nuvio providers)</h2>
        <input
          value={tmdb}
          onChange={(e) => { setTmdb(e.target.value); setTmdbKey(e.target.value); }}
          placeholder="Paste your free TMDB API key (v3)"
          autoCapitalize="none"
          className="w-full rounded-xl bg-white/[0.08] px-3 py-3 text-[14px] text-white outline-none placeholder:text-zinc-500"
        />
        <p className="mt-1.5 text-[11.5px] text-zinc-500">Nuvio providers look titles up by TMDB id. Get a free key at themoviedb.org → Settings → API.</p>

        {SUGGESTED.some((s) => !have.has(s.base)) && (
          <>
            <h2 className="mb-2 mt-6 text-[11.5px] font-bold uppercase tracking-wider text-zinc-500">Suggested</h2>
            <div className="divide-y divide-white/[0.05] overflow-hidden rounded-2xl bg-[#0F121A] ring-1 ring-white/[0.05]">
              {SUGGESTED.filter((s) => !have.has(s.base)).map((s) => (
                <div key={s.base} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-white">{s.name}</p>
                    <p className="text-[11.5px] text-zinc-500">{s.hint}</p>
                  </div>
                  <button onClick={() => add(s.base)} disabled={busy} className="rounded-lg bg-white/10 px-3 py-1.5 text-[13px] font-semibold text-white">
                    Install
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="mt-6 text-[11.5px] leading-relaxed text-zinc-500">
          GooWatch plays what extensions offer. Torrent-only streams need a debrid-style extension. CloudStream plugins (.cs3) are
          native Android code and cannot be loaded here.
        </p>
      </div>
    </div>
  );
};
