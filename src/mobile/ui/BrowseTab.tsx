import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { ParsedFtpItem } from '../../utils/ftpParser';
import { displayTitle } from '../../utils/titleClean';
import { MobilePoster } from './MobilePoster';
import { ShellApi } from './types';
import { PickerButton, PickerSheet } from './Pickers';
import { allowLibraryItem, useContentMode } from '../safety';
import { peekRating, ensureRating, ratingNumber } from '../../services/ratings';
import { CATEGORIES } from '../categories';
import { FilterSheet, NO_FILTER, FilterState, filterActive, filterLabel, passFilter } from './Filters';

type Sort = 'latest' | 'oldest' | 'az' | 'za' | 'rating';
const SORTS: { key: Sort; label: string; hint?: string }[] = [
  { key: 'latest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'az', label: 'A – Z' },
  { key: 'za', label: 'Z – A' },
  { key: 'rating', label: 'Top rated (IMDb)', hint: 'Scores load in the background — the order improves as they arrive' },
];
const target = (i: ParsedFtpItem) => ({ kind: (i.mediaKind === 'series' ? 'series' : 'movie') as 'movie' | 'series', title: displayTitle(i.cleanTitle || i.rawName), year: i.year, imdbId: i.imdbId });

/** Movies / Series: filter by source (language / category), sort, and an endless grid. */
export const BrowseTab: React.FC<{ api: ShellApi; kind: 'movie' | 'series'; genre?: string; onGenre?: (g: string) => void }> = ({ api, kind, genre = '', onGenre }) => {
  const [source, setSource] = useState('all');
  const [filter, setFilter] = useState<FilterState>(NO_FILTER);
  const [genreLocal, setGenreLocal] = useState(genre);
  useEffect(() => setGenreLocal(genre), [genre]);
  const setGenre = (g: string) => {
    setGenreLocal(g);
    onGenre?.(g);
  };
  const [sort, setSort] = useState<Sort>('latest');
  const [shown, setShown] = useState(60);
  const [sheet, setSheet] = useState<'' | 'cat' | 'sort' | 'genre' | 'filter'>('');
  const [ratingTick, setRatingTick] = useState(0);
  const mode = useContentMode();
  const sentinel = useRef<HTMLDivElement>(null);

  const all = useMemo(() => api.library.filter((i) => i.mediaKind === kind && allowLibraryItem(i, mode)), [api.library, kind, mode]);
  const sourceNames = useMemo(() => {
    const m = new Map<string, number>();
    all.forEach((i) => m.set(i.sourceServerName || '', (m.get(i.sourceServerName || '') || 0) + 1));
    return [...m.entries()].filter(([n]) => n).sort((a, b) => b[1] - a[1]);
  }, [all]);

  const needLookup = !!genreLocal || filter.minRating > 0;
  const [lookTick, setLookTick] = useState(0);
  // genre / rating filters need the score + genres of each title: look them up in the background
  useEffect(() => {
    if (!needLookup) return;
    let alive = true;
    let n = 0;
    const base = (source === 'all' ? all : all.filter((i) => i.sourceServerName === source)).slice(0, 400);
    base.forEach((i) =>
      ensureRating(target(i)).then(() => {
        if (alive && ++n % 10 === 0) setLookTick((x) => x + 1);
      })
    );
    const t = window.setTimeout(() => alive && setLookTick((x) => x + 1), 3000);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [needLookup, source, all]);

  const list = useMemo(() => {
    let l = source === 'all' ? all : all.filter((i) => i.sourceServerName === source);
    if (genreLocal) {
      const g = genreLocal.toLowerCase();
      l = l.filter((i) => {
        const gs = peekRating(target(i))?.genres;
        return (gs && gs.some((x) => x.toLowerCase() === g)) || (i.sourceServerName || '').toLowerCase().includes(g);
      });
    }
    if (filterActive(filter)) l = l.filter((i) => passFilter(filter, ratingNumber(peekRating(target(i))?.imdb), Number(i.year) || 0));
    l = [...l];
    const t = (i: ParsedFtpItem) => displayTitle(i.cleanTitle);
    if (sort === 'az') l.sort((a, b) => t(a).localeCompare(t(b)));
    else if (sort === 'za') l.sort((a, b) => t(b).localeCompare(t(a)));
    else if (sort === 'oldest') l.sort((a, b) => (a.year || 9999) - (b.year || 9999));
    else if (sort === 'rating') l.sort((a, b) => ratingNumber(peekRating(target(b))?.imdb) - ratingNumber(peekRating(target(a))?.imdb));
    else l.sort((a, b) => (b.year || 0) - (a.year || 0));
    return l;
  }, [all, source, sort, ratingTick, genreLocal, filter, lookTick]);

  // "Top rated": fetch the scores of the first titles in the background and re-sort as they arrive
  useEffect(() => {
    if (sort !== 'rating') return;
    let alive = true;
    const base = (source === 'all' ? all : all.filter((i) => i.sourceServerName === source)).slice(0, 240);
    let n = 0;
    base.forEach((i) =>
      ensureRating(target(i)).then(() => {
        if (alive && ++n % 12 === 0) setRatingTick((x) => x + 1);
      })
    );
    const t = window.setTimeout(() => alive && setRatingTick((x) => x + 1), 4000);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [sort, source, all]);

  useEffect(() => setShown(60), [source, sort, kind]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && setShown((n) => n + 60), { rootMargin: '900px' });
    io.observe(node);
    return () => io.disconnect();
  }, [list.length]);

  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
      active ? 'bg-amber-400 text-black' : 'bg-white/[0.07] text-zinc-300 active:bg-white/15'
    }`;

  return (
    <div className="pb-4">
      <div className="sticky top-0 z-20 bg-[#07080C]/95 pb-2 pt-3 backdrop-blur">
        <div className="flex items-center justify-between px-4 md:px-6">
          <div>
            <h1 className="text-[22px] font-extrabold tracking-tight text-white">{kind === 'movie' ? 'Movies' : 'Series'}</h1>
            <p className="text-[11px] text-zinc-500">{list.length.toLocaleString()} titles</p>
          </div>
          <button onClick={api.openSearch} aria-label="Search" className="rounded-full bg-white/[0.07] p-2.5 active:scale-90">
            <Search className="h-5 w-5 text-white" />
          </button>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto px-4 md:px-6" style={{ scrollbarWidth: 'none' }}>
          <PickerButton label="Categories" value={source === 'all' ? undefined : source} active={source !== 'all'} onClick={() => setSheet('cat')} />
          <PickerButton label="Genre" value={genreLocal || undefined} active={!!genreLocal} onClick={() => setSheet('genre')} />
          <PickerButton label="Filter" value={filterActive(filter) ? filterLabel(filter) : undefined} active={filterActive(filter)} onClick={() => setSheet('filter')} />
          <PickerButton label="Sort" value={SORTS.find((x) => x.key === sort)!.label} onClick={() => setSheet('sort')} />
          {source !== 'all' && (
            <button className={chip(false)} onClick={() => setSource('all')}>
              ✕ {source}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-9 gap-x-2.5 md:gap-x-3 gap-y-4 px-3.5 md:px-6 pt-2">
        {list.slice(0, shown).map((it: ParsedFtpItem) => (
          <MobilePoster
            key={it.id}
            item={it}
            onOpen={api.openDetails}
            saved={api.isSaved(it.id)}
            onToggleSave={api.toggleSave}
          />
        ))}
      </div>
      {shown < list.length && <div ref={sentinel} className="h-16" />}
      {list.length === 0 && <p className="px-6 pt-16 text-center text-sm text-zinc-500">{needLookup ? 'Nothing matches yet — titles are still being checked, or try another filter.' : 'Nothing here yet.'}</p>}
      {sheet === 'cat' && (
        <PickerSheet
          title="Categories"
          value={source}
          options={[{ key: 'all', label: 'All', hint: `${all.length.toLocaleString()} titles` }, ...sourceNames.map(([n, c]) => ({ key: n, label: n, hint: `${c.toLocaleString()} titles` }))]}
          onPick={setSource}
          onClose={() => setSheet('')}
        />
      )}
      {sheet === 'genre' && (
        <PickerSheet
          title="Genre"
          value={genreLocal}
          options={[{ key: '', label: 'All' }, ...CATEGORIES.filter((c) => !c.type && (mode === 'all' || !['Horror', 'Crime', 'War'].includes(c.id))).map((c) => ({ key: c.id, label: c.label }))]}
          onPick={setGenre}
          onClose={() => setSheet('')}
        />
      )}
      {sheet === 'filter' && <FilterSheet value={filter} onChange={setFilter} onClose={() => setSheet('')} />}
      {sheet === 'sort' && <PickerSheet title="Sort by" value={sort} options={SORTS} onPick={(k) => setSort(k as Sort)} onClose={() => setSheet('')} />}
    </div>
  );
};
