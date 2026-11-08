import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Download, Loader2, Puzzle, Search, Sparkles } from 'lucide-react';
import { CatalogAddon, fetchAddonCollection, RECOMMENDED } from '../../extensions/catalog';
import { installExtension, normalizeBase, useExtensions } from '../../extensions/store';

const FILTERS: [string, string][] = [
  ['all', 'All'],
  ['movie', 'Movies'],
  ['series', 'Series'],
  ['anime', 'Anime'],
  ['subtitles', 'Subtitles'],
  ['tv', 'Live TV'],
];

const matches = (a: CatalogAddon, f: string) => {
  if (f === 'all') return true;
  if (f === 'subtitles') return a.resources.includes('subtitles') || a.types.includes('subtitles');
  return a.types.includes(f) || (f === 'anime' && /anime/i.test(a.name + a.description));
};

/** In-app add-on store: recommended add-ons + the full community collection, one tap to install. */
export const AddonStore: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const exts = useExtensions();
  const [all, setAll] = useState<CatalogAddon[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [showDebrid, setShowDebrid] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchAddonCollection()
      .then((l) => alive && setAll(l))
      .catch(() => alive && setErr('Could not load the online add-on list. Check your internet — the recommended ones below still work.'));
    return () => {
      alive = false;
    };
  }, []);

  const installedBases = useMemo(() => new Set(exts.map((e) => e.base)), [exts]);
  const isInstalled = (url: string) => {
    try {
      return installedBases.has(normalizeBase(url));
    } catch {
      return false;
    }
  };

  const install = async (name: string, url: string, manifest?: any) => {
    setBusy(url);
    setMsg(null);
    try {
      await installExtension(url, false, manifest);
      setMsg({ ok: true, text: `${name} installed` });
      setTimeout(() => setMsg((m) => (m && m.ok ? null : m)), 2500);
    } catch (e: any) {
      setMsg({ ok: false, text: `${name}: ${e?.message || 'install failed'}` });
    } finally {
      setBusy(null);
    }
  };

  const installPack = async () => {
    for (const r of RECOMMENDED.filter((x) => !x.debrid && !isInstalled(x.manifestUrl))) await install(r.name, r.manifestUrl);
  };

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (all || [])
      .filter((a) => matches(a, filter) && (showDebrid || !a.needsDebrid) && (!t || (a.name + ' ' + a.description).toLowerCase().includes(t)))
      .sort((a, b) => Number(a.needsDebrid) - Number(b.needsDebrid));
  }, [all, q, filter, showDebrid]);

  const Btn: React.FC<{ name: string; url: string; manifest?: any }> = ({ name, url, manifest }) =>
    isInstalled(url) ? (
      <span className="flex shrink-0 items-center gap-1 rounded-xl bg-emerald-500/15 px-3 py-2 text-[12.5px] font-bold text-emerald-300">
        <Check className="h-4 w-4" /> Installed
      </span>
    ) : (
      <button
        onClick={() => install(name, url, manifest)}
        disabled={busy === url}
        className="flex shrink-0 items-center gap-1.5 rounded-xl bg-amber-400 px-3.5 py-2 text-[13px] font-extrabold text-black active:scale-95 disabled:opacity-60"
      >
        {busy === url ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Install
      </button>
    );

  const Logo: React.FC<{ src?: string }> = ({ src }) =>
    src ? (
      <img src={src} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-xl bg-white/5 object-contain p-0.5" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
    ) : (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400/20 to-white/5">
        <Puzzle className="h-6 w-6 text-amber-400" />
      </div>
    );

  return (
    <div className="fixed inset-0 z-[260] overflow-y-auto overflow-x-hidden bg-[#07080C] pb-24">
      <div className="sticky top-0 z-10 bg-[#07080C]/95 px-3 pb-2 pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <button onClick={onClose} aria-label="Back" className="rounded-full p-2 active:bg-white/10">
            <ArrowLeft className="h-5 w-5 text-white" />
          </button>
          <h1 className="text-[18px] font-extrabold text-white">Add-on store</h1>
        </div>
      </div>

      <div className="mx-auto w-full min-w-0 max-w-3xl px-4 md:px-6">

        {/* recommended */}
        <div className="mb-2 mt-1 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-amber-400">
            <Sparkles className="h-3.5 w-3.5" /> Recommended
          </h2>
          <button onClick={installPack} disabled={!!busy} className="rounded-full bg-white/10 px-3 py-1.5 text-[12px] font-bold text-white active:scale-95 disabled:opacity-50">
            Install all recommended
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {RECOMMENDED.map((r) => (
            <div key={r.manifestUrl} className="flex min-w-0 items-center gap-3 rounded-2xl bg-[#0F121A] p-3.5 ring-1 ring-white/[0.07]">
              <Logo />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-bold text-white">
                  {r.name} <span className="ml-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">{r.why}</span>
                </p>
                <p className="line-clamp-2 text-[12px] text-zinc-400">{r.description}</p>
              </div>
              <Btn name={r.name} url={r.manifestUrl} />
            </div>
          ))}
        </div>

        {/* full collection */}
        <h2 className="mb-2 mt-7 text-[12px] font-bold uppercase tracking-wider text-zinc-500">All add-ons{all ? ` · ${list.length}` : ''}</h2>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search add-ons"
            className="w-full rounded-2xl bg-white/[0.07] py-3.5 pl-10 pr-4 text-[14px] text-white outline-none ring-1 ring-white/[0.06] placeholder:text-zinc-500 focus:ring-amber-400/50"
          />
        </div>
        <div className="mt-3 flex max-w-full gap-2 overflow-x-auto pb-1">
          {FILTERS.map(([id, label]) => (
            <button key={id} onClick={() => setFilter(id)} className={`shrink-0 rounded-full px-4 py-1.5 text-[13px] font-semibold ${filter === id ? 'bg-amber-400 text-black' : 'bg-white/[0.08] text-zinc-300'}`}>
              {label}
            </button>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 text-[12.5px] text-zinc-400">
          <input type="checkbox" checked={showDebrid} onChange={(e) => setShowDebrid(e.target.checked)} className="accent-amber-400" />
          Also show torrent / debrid add-ons (they need a debrid account to play)
        </label>

        {!all && !err && (
          <div className="flex items-center gap-3 py-10 text-zinc-400">
            <Loader2 className="h-5 w-5 animate-spin text-amber-400" /> Loading add-ons…
          </div>
        )}
        {err && <p className="mt-4 rounded-xl bg-white/5 p-3 text-[13px] text-zinc-400">{err}</p>}

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          {list.map((a) => (
            <div key={a.id} className="flex min-w-0 items-center gap-3 rounded-2xl bg-[#0F121A] p-3.5 ring-1 ring-white/[0.06]">
              <Logo src={a.logo} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold text-white">{a.name}</p>
                <p className="line-clamp-2 text-[12px] text-zinc-400">{a.description || a.resources.join(' · ')}</p>
                <p className="mt-0.5 truncate text-[10.5px] capitalize text-zinc-600">{[...new Set([...a.types, ...a.resources])].slice(0, 5).join(' · ')}</p>
              </div>
              <Btn name={a.name} url={a.manifestUrl} manifest={a.manifest} />
            </div>
          ))}
        </div>
        {all && list.length === 0 && <p className="py-8 text-center text-[13px] text-zinc-500">No add-ons match.</p>}
      </div>
      {busy && !msg && (
        <div className="fixed inset-x-4 bottom-6 z-[270] mx-auto flex max-w-md items-center gap-2 rounded-2xl bg-[#1A1D27] px-4 py-3 text-[13px] text-zinc-200 shadow-2xl ring-1 ring-white/10">
          <Loader2 className="h-4 w-4 animate-spin text-amber-400" /> Installing…
        </div>
      )}
      {msg && (
        <div
          onClick={() => setMsg(null)}
          className={`fixed inset-x-4 bottom-6 z-[270] mx-auto max-w-md rounded-2xl px-4 py-3 text-[13px] font-medium shadow-2xl ring-1 ${msg.ok ? 'bg-emerald-600 text-white ring-emerald-400/40' : 'bg-rose-600 text-white ring-rose-400/40'}`}
        >
          {msg.ok ? '✓ ' : '✕ '}
          {msg.text}
        </div>
      )}
    </div>
  );
};
