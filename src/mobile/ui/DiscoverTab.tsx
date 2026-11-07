import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { ShellApi } from './types';
import { BrowseTab } from './BrowseTab';
import { ExtCard } from './ExtRows';
import { catalogGenres, fetchCatalog, homeCatalogs } from '../../extensions/client';
import { useExtensions } from '../../extensions/store';
import { ExtPreview } from '../../extensions/types';

const TYPE_LABEL: Record<string, string> = { movie: 'Movies', series: 'Series', anime: 'Anime', tv: 'TV', channel: 'Channels' };

const chip = (on: boolean) =>
  `shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold ${on ? 'bg-amber-400 text-black' : 'bg-white/10 text-zinc-200'}`;

export const DiscoverTab: React.FC<{ api: ShellApi }> = ({ api }) => {
  const exts = useExtensions();
  const [mode, setMode] = useState<'ext' | 'servers'>('ext');
  const [serverKind, setServerKind] = useState<'movie' | 'series'>('movie');

  const cats = useMemo(
    () => exts.filter((e) => e.enabled).flatMap((e) => homeCatalogs(e).map((c) => ({ ext: e, cat: c }))),
    [exts]
  );
  const types = useMemo(() => [...new Set(cats.map((c) => c.cat.type))], [cats]);
  const [type, setType] = useState<string>('');
  const activeType = type && types.includes(type) ? type : types[0] || '';
  const typeCats = cats.filter((c) => c.cat.type === activeType);
  const [catKey, setCatKey] = useState('');
  const active = typeCats.find((c) => `${c.ext.base}|${c.cat.id}` === catKey) || typeCats[0];
  const genres = active ? catalogGenres(active.cat) : [];
  const [genre, setGenre] = useState('');

  const [items, setItems] = useState<ExtPreview[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setGenre('');
  }, [active?.ext.base, active?.cat.id]);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    setItems([]);
    setDone(false);
    setBusy(true);
    fetchCatalog(active.ext, active.cat, undefined, { genre: genre || undefined })
      .then((r) => alive && (setItems(r), setDone(r.length === 0)))
      .catch(() => alive && setDone(true))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [active?.ext.base, active?.cat.id, genre]);

  const more = async () => {
    if (!active || busy || done) return;
    setBusy(true);
    try {
      const r = await fetchCatalog(active.ext, active.cat, undefined, { genre: genre || undefined, skip: items.length });
      const seen = new Set(items.map((i) => i.id));
      const fresh = r.filter((i) => !seen.has(i.id));
      if (fresh.length === 0) setDone(true);
      setItems((cur) => [...cur, ...fresh]);
    } catch {
      setDone(true);
    } finally {
      setBusy(false);
    }
  };

  const hasServers = api.sources.length > 0;

  return (
    <div className="pb-4">
      <div className="flex items-center justify-between px-4 pt-4">
        <h1 className="text-[22px] font-extrabold tracking-tight text-white">Discover</h1>
        <button onClick={api.openSearch} aria-label="Search" className="rounded-full bg-white/10 p-2.5 active:scale-90">
          <Search className="h-5 w-5 text-white" />
        </button>
      </div>

      {hasServers && (
        <div className="mx-4 mt-3 flex rounded-xl bg-white/[0.07] p-1">
          <button className={`flex-1 rounded-lg py-2 text-[13px] font-semibold ${mode === 'ext' ? 'bg-amber-400 text-black' : 'text-zinc-300'}`} onClick={() => setMode('ext')}>
            Extensions
          </button>
          <button className={`flex-1 rounded-lg py-2 text-[13px] font-semibold ${mode === 'servers' ? 'bg-amber-400 text-black' : 'text-zinc-300'}`} onClick={() => setMode('servers')}>
            My servers
          </button>
        </div>
      )}

      {mode === 'servers' && hasServers ? (
        <>
          <div className="flex gap-2 px-4 pt-3">
            <button className={chip(serverKind === 'movie')} onClick={() => setServerKind('movie')}>Movies</button>
            <button className={chip(serverKind === 'series')} onClick={() => setServerKind('series')}>Series</button>
          </div>
          <BrowseTab api={api} kind={serverKind} />
        </>
      ) : (
        <>
          {types.length === 0 && (
            <p className="px-8 pt-16 text-center text-sm text-zinc-500">
              No extension with catalogs yet. Open Settings → Extensions to install or add one.
            </p>
          )}
          {types.length > 0 && (
            <div className="flex gap-2 overflow-x-auto px-4 pt-3" style={{ scrollbarWidth: 'none' }}>
              {types.map((t) => (
                <button key={t} className={chip(t === activeType)} onClick={() => { setType(t); setCatKey(''); }}>
                  {TYPE_LABEL[t] || t}
                </button>
              ))}
            </div>
          )}
          {typeCats.length > 1 && (
            <div className="flex gap-2 overflow-x-auto px-4 pt-2" style={{ scrollbarWidth: 'none' }}>
              {typeCats.map((c) => {
                const k = `${c.ext.base}|${c.cat.id}`;
                return (
                  <button key={k} className={chip(active === c)} onClick={() => setCatKey(k)}>
                    {c.cat.name || c.cat.id}
                  </button>
                );
              })}
            </div>
          )}
          {genres.length > 0 && (
            <div className="flex gap-2 overflow-x-auto px-4 pt-2" style={{ scrollbarWidth: 'none' }}>
              <button className={chip(!genre)} onClick={() => setGenre('')}>All</button>
              {genres.map((g) => (
                <button key={g} className={chip(genre === g)} onClick={() => setGenre(g)}>{g}</button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-9 gap-x-2.5 md:gap-x-3 gap-y-4 px-3.5 md:px-6 pt-4">
            {items.map((it) => (
              <ExtCard key={`${it.type}:${it.id}`} item={it} onOpen={api.openExt} className="w-full" />
            ))}
          </div>
          <div className="flex justify-center py-6">
            {busy ? (
              <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
            ) : items.length > 0 && !done ? (
              <button onClick={more} className="rounded-full bg-white/10 px-6 py-2.5 text-[13px] font-semibold text-white active:scale-95">
                Load more
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
};
