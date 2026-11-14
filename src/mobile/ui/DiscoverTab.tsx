import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { ShellApi } from './types';
import { BrowseTab } from './BrowseTab';
import { ExtCard } from './ExtRows';
import { PickerButton, PickerSheet } from './Pickers';
import { catalogGenres, fetchCatalog, homeCatalogs } from '../../extensions/client';
import { useExtensions } from '../../extensions/store';
import { ExtCatalog, ExtPreview } from '../../extensions/types';
import { usePrefs } from '../prefs';
import { allowExt, allowExtItem, genresFor } from '../safety';
import { CATEGORY_EVENT, Category, takePendingCategory } from '../categories';
import { ratingNumber } from '../../services/ratings';

const TYPE_LABEL: Record<string, string> = { movie: 'Movies', series: 'Series', anime: 'Anime', tv: 'TV', channel: 'Channels' };

type Sort = 'popular' | 'rating' | 'newest' | 'az';
const SORTS: { key: Sort; label: string; hint: string }[] = [
  { key: 'popular', label: 'Most popular', hint: 'What most people watch right now' },
  { key: 'rating', label: 'Top rated', hint: 'Highest IMDb score first' },
  { key: 'newest', label: 'Newest', hint: 'Latest releases first' },
  { key: 'az', label: 'A – Z', hint: 'By title' },
];
// Cinemeta-style catalogs that already come sorted this way from the add-on
const SORT_IDS: Record<Sort, string> = { popular: 'top', rating: 'imdbRating', newest: 'year', az: '' };
const SORTED_CATALOG_IDS = new Set(['top', 'imdbRating', 'year']);

const chip = (on: boolean) =>
  `shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold ${on ? 'bg-amber-400 text-black' : 'bg-white/10 text-zinc-200'}`;

const yearNum = (y: unknown) => {
  const m = String(y ?? '').match(/(19|20)\d{2}/);
  return m ? parseInt(m[0], 10) : 0;
};

export const DiscoverTab: React.FC<{ api: ShellApi }> = ({ api }) => {
  const [prefs] = usePrefs();
  const mode = prefs.contentMode;
  const extOn = prefs.extensionsOn;
  const allExts = useExtensions();
  const exts = useMemo(() => allExts.filter((e) => allowExt(e, mode)), [allExts, mode]);
  const hasServers = api.sources.length > 0;
  const [serverKind, setServerKind] = useState<'movie' | 'series'>('movie');

  const cats = useMemo(() => exts.filter((e) => e.enabled).flatMap((e) => homeCatalogs(e).map((c) => ({ ext: e, cat: c }))), [exts]);
  const types = useMemo(() => [...new Set(cats.map((c) => c.cat.type))], [cats]);

  const [view, setView] = useState<'ext' | 'servers' | null>(null); // null = decide automatically
  const showServers = !extOn || (hasServers && (view ? view === 'servers' : types.length === 0));

  const [type, setType] = useState('');
  const activeType = type && types.includes(type) ? type : types[0] || '';
  const typeCats = cats.filter((c) => c.cat.type === activeType);
  const [catKey, setCatKey] = useState('');
  const [genre, setGenre] = useState('');
  const [sort, setSort] = useState<Sort>('popular');
  const [sheet, setSheet] = useState<'' | 'cat' | 'sort'>('');

  // ---- which catalog + genre is really loaded ----
  const kidsWanted = mode === 'kids' ? ['Family', 'Animation'] : [];
  const pickGenre = (c: ExtCatalog): string => {
    const gs = catalogGenres(c);
    if (genre) return gs.find((g) => g.toLowerCase() === genre.toLowerCase()) || '';
    for (const w of kidsWanted) {
      const m = gs.find((g) => g.toLowerCase() === w.toLowerCase());
      if (m) return m;
    }
    return '';
  };
  const chipCat = typeCats.find((c) => `${c.ext.base}|${c.cat.id}` === catKey);
  const sortCat = SORT_IDS[sort] ? typeCats.find((c) => c.cat.id === SORT_IDS[sort]) : undefined;
  let eff = chipCat || sortCat || typeCats[0];
  if (eff && (genre || mode === 'kids') && !pickGenre(eff.cat)) eff = typeCats.find((c) => pickGenre(c.cat)) || (mode === 'kids' ? undefined : eff);
  const effGenre = eff ? pickGenre(eff.cat) : '';
  const kidsBlocked = mode === 'kids' && typeCats.length > 0 && !effGenre;

  const allGenres = useMemo(() => {
    const s = new Set<string>();
    typeCats.forEach((c) => catalogGenres(c.cat).forEach((g) => s.add(g)));
    return genresFor(mode, [...s]);
  }, [typeCats, mode]);

  const [items, setItems] = useState<ExtPreview[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const loadKey = `${eff?.ext.base}|${eff?.cat.id}|${effGenre}`;

  useEffect(() => {
    if (!eff || kidsBlocked) {
      setItems([]);
      setDone(true);
      return;
    }
    let alive = true;
    setItems([]);
    setDone(false);
    setBusy(true);
    fetchCatalog(eff.ext, eff.cat, undefined, { genre: effGenre || undefined })
      .then((r) => alive && (setItems(r), setDone(r.length === 0)))
      .catch(() => alive && setDone(true))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [loadKey, kidsBlocked]);

  const more = async () => {
    if (!eff || busy || done) return;
    setBusy(true);
    try {
      const r = await fetchCatalog(eff.ext, eff.cat, undefined, { genre: effGenre || undefined, skip: items.length });
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

  const shown = useMemo(() => {
    let l = items.filter((it) => allowExtItem(it, mode, mode === 'kids' && !!effGenre));
    if (sort === 'rating') l = [...l].sort((a, b) => ratingNumber(b.rating) - ratingNumber(a.rating));
    else if (sort === 'newest') l = [...l].sort((a, b) => yearNum(b.year) - yearNum(a.year));
    else if (sort === 'az') l = [...l].sort((a, b) => a.name.localeCompare(b.name));
    return l;
  }, [items, sort, mode, effGenre]);

  // ---- a category picked in the PC sidebar / category list ----
  const applyCategory = (c: Category) => {
    setView('ext');
    setCatKey('');
    if (c.type && types.includes(c.type)) {
      setType(c.type);
      setGenre('');
      return;
    }
    const g = c.type ? 'Animation' : c.id;
    const t = types.find((tt) => cats.some((x) => x.cat.type === tt && catalogGenres(x.cat).some((o) => o.toLowerCase() === g.toLowerCase()))) || activeType;
    if (t) setType(t);
    setGenre(g);
  };
  useEffect(() => {
    const take = () => {
      const c = takePendingCategory();
      if (c) applyCategory(c);
    };
    take();
    window.addEventListener(CATEGORY_EVENT, take);
    return () => window.removeEventListener(CATEGORY_EVENT, take);
  });

  const chips = typeCats.filter((c) => !SORTED_CATALOG_IDS.has(c.cat.id));
  const sortLabel = SORTS.find((s) => s.key === sort)!.label;

  return (
    <div className="pb-4">
      <div className="flex items-center justify-between px-4 pt-4 md:px-6">
        <div className="flex items-center gap-2.5">
          <h1 className="text-[22px] font-extrabold tracking-tight text-white">Discover</h1>
          {mode !== 'all' && (
            <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-[11px] font-extrabold text-emerald-300">{mode === 'kids' ? 'Kids mode' : 'Family mode'}</span>
          )}
        </div>
        <button onClick={api.openSearch} aria-label="Search" className="rounded-full bg-white/10 p-2.5 active:scale-90">
          <Search className="h-5 w-5 text-white" />
        </button>
      </div>

      {extOn && hasServers && (
        <div className="mx-4 mt-3 flex rounded-xl bg-white/[0.07] p-1 md:mx-6">
          <button className={`flex-1 rounded-lg py-2 text-[13px] font-semibold ${!showServers ? 'bg-amber-400 text-black' : 'text-zinc-300'}`} onClick={() => setView('ext')}>
            Extensions
          </button>
          <button className={`flex-1 rounded-lg py-2 text-[13px] font-semibold ${showServers ? 'bg-amber-400 text-black' : 'text-zinc-300'}`} onClick={() => setView('servers')}>
            My servers
          </button>
        </div>
      )}

      {showServers ? (
        hasServers ? (
          <>
            <div className="flex gap-2 px-4 pt-3 md:px-6">
              <button className={chip(serverKind === 'movie')} onClick={() => setServerKind('movie')}>Movies</button>
              <button className={chip(serverKind === 'series')} onClick={() => setServerKind('series')}>Series</button>
            </div>
            <BrowseTab api={api} kind={serverKind} />
          </>
        ) : (
          <p className="px-8 pt-16 text-center text-sm text-zinc-500">No server added yet. Open Settings → My servers, or turn on Extensions.</p>
        )
      ) : (
        <>
          {types.length === 0 && (
            <p className="px-8 pt-16 text-center text-sm text-zinc-500">No extension with catalogs yet. Open Settings → Extensions to install or add one.</p>
          )}
          {types.length > 0 && (
            <div className="flex gap-2 overflow-x-auto px-4 pt-3 md:px-6" style={{ scrollbarWidth: 'none' }}>
              {types.map((t) => (
                <button
                  key={t}
                  className={chip(t === activeType)}
                  onClick={() => {
                    setType(t);
                    setCatKey('');
                    setGenre('');
                  }}
                >
                  {TYPE_LABEL[t] || t}
                </button>
              ))}
            </div>
          )}
          {types.length > 0 && (
            <div className="flex gap-2 overflow-x-auto px-4 pt-2 md:px-6" style={{ scrollbarWidth: 'none' }}>
              <PickerButton label="Categories" value={effGenre || undefined} active={!!genre} onClick={() => setSheet('cat')} />
              <PickerButton label="Sort" value={sortLabel} onClick={() => setSheet('sort')} />
              {chips.length > 1 &&
                chips.map((c) => {
                  const k = `${c.ext.base}|${c.cat.id}`;
                  return (
                    <button key={k} className={chip(eff === c && !!chipCat)} onClick={() => setCatKey(catKey === k ? '' : k)}>
                      {c.cat.name || c.cat.id}
                    </button>
                  );
                })}
            </div>
          )}

          {kidsBlocked && (
            <p className="px-8 pt-12 text-center text-sm text-zinc-500">
              Kids mode needs an add-on that has Family / Animation categories (Cinemeta has them). Install one from the add-on store.
            </p>
          )}

          <div className="grid grid-cols-3 gap-x-2.5 gap-y-4 px-3.5 pt-4 sm:grid-cols-4 md:grid-cols-5 md:gap-x-3 md:px-6 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-9">
            {shown.map((it) => (
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

      {sheet === 'cat' && (
        <PickerSheet
          title="Categories"
          value={genre}
          options={[...(mode === 'kids' ? [] : [{ key: '', label: 'All' }]), ...allGenres.map((g) => ({ key: g, label: g }))]}
          onPick={(g) => {
            setGenre(g);
            setCatKey('');
          }}
          onClose={() => setSheet('')}
        />
      )}
      {sheet === 'sort' && (
        <PickerSheet
          title="Sort by"
          value={sort}
          options={SORTS.map((s) => ({ key: s.key, label: s.label, hint: s.hint }))}
          onPick={(k) => {
            setSort(k as Sort);
            setCatKey('');
          }}
          onClose={() => setSheet('')}
        />
      )}
    </div>
  );
};
