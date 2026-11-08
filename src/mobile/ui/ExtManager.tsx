import React, { useState } from 'react';
import { ArrowLeft, Loader2, Plus, Puzzle, Trash2 } from 'lucide-react';
import { installExtension, removeExtension, setExtensionEnabled, setScraperEnabled, SUGGESTED, useExtensions } from '../../extensions/store';
import { openAddonStore } from '../../extensions/catalog';
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

      <div className="mx-auto max-w-3xl px-4 md:px-6">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-400/20 via-orange-500/10 to-transparent p-5 ring-1 ring-amber-400/20">
          <Puzzle className="absolute -right-4 -top-4 h-28 w-28 rotate-12 text-amber-400/10" />
          <h2 className="text-[20px] font-extrabold text-white">Add more to GooWatch</h2>
          <p className="mt-1 max-w-md text-[13px] leading-relaxed text-zinc-300">
            Extensions bring movies, series, anime, streams and subtitles. Press <b>Install</b> on an add-on website and GooWatch opens by itself
            and asks to confirm — or paste an address below.
          </p>
          <button onClick={openAddonStore} className="mt-3 rounded-xl bg-amber-400 px-4 py-2.5 text-[14px] font-extrabold text-black active:scale-95">
            Browse add-on store
          </button>
          <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-semibold">
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-zinc-200">Stremio add-ons · stremio://</span>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-zinc-200">Nuvio providers · GitHub repo</span>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Add-on or provider repository address"
            inputMode="url"
            autoCapitalize="none"
            className="min-w-0 flex-1 rounded-2xl bg-white/[0.07] px-4 py-3.5 text-[14px] text-white outline-none ring-1 ring-white/[0.06] placeholder:text-zinc-500 focus:ring-amber-400/50"
          />
          <button
            onClick={() => add(url)}
            disabled={busy || !url.trim()}
            className="flex items-center gap-1.5 rounded-2xl bg-amber-400 px-5 text-[14px] font-bold text-black active:scale-95 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
          </button>
        </div>
        {msg && <p className="mt-2 text-[12.5px] text-amber-300">{msg}</p>}

        <h2 className="mb-2 mt-6 text-[11.5px] font-bold uppercase tracking-wider text-zinc-500">Installed</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {exts.length === 0 && <p className="p-4 text-[13px] text-zinc-500">Nothing installed yet — installing the built-in ones…</p>}
          {exts.map((e) => (
            <div key={e.base} className={`overflow-hidden rounded-2xl bg-[#0F121A] ring-1 ${e.enabled ? 'ring-white/[0.07]' : 'opacity-60 ring-white/[0.04]'}`}>
            <div className="flex items-center gap-3 p-3.5">
              {e.manifest.logo ? (
                <img src={e.manifest.logo} alt="" className="h-12 w-12 shrink-0 rounded-xl bg-white/5 object-contain p-0.5" />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400/20 to-white/5">
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
            <div className="grid gap-3 md:grid-cols-2">
              {SUGGESTED.filter((s) => !have.has(s.base)).map((s) => (
                <div key={s.base} className="flex items-center gap-3 rounded-2xl bg-[#0F121A] p-3.5 ring-1 ring-white/[0.07]">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-white">{s.name}</p>
                    <p className="text-[11.5px] text-zinc-500">{s.hint}</p>
                  </div>
                  <button onClick={() => add(s.base)} disabled={busy} className="rounded-xl bg-amber-400 px-4 py-2 text-[13px] font-bold text-black active:scale-95">
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
