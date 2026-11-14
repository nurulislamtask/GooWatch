import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Search, X } from 'lucide-react';
import { ShellApi } from './types';
import { MobilePoster } from './MobilePoster';
import { ExtPreview } from '../../extensions/types';
import { fetchCatalog, searchCatalogs } from '../../extensions/client';
import { useExtensions } from '../../extensions/store';
import { ExtCard } from './ExtRows';
import { displayTitle } from '../../utils/titleClean';
import { allowExt, allowExtItem, allowLibraryItem, useContentMode } from '../safety';
import { usePrefs } from '../prefs';

export const SearchOverlay: React.FC<{ api: ShellApi; onClose: () => void }> = ({ api, onClose }) => {
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const exts = useExtensions();
  const mode = useContentMode();
  const [prefs] = usePrefs();
  const [extResults, setExtResults] = useState<ExtPreview[]>([]);
  const [extBusy, setExtBusy] = useState(false);
  useEffect(() => {
    const s = q.trim();
    if (s.length < 2 || !prefs.extensionsOn) { setExtResults([]); return; }
    let alive = true;
    setExtBusy(true);
    const t = window.setTimeout(async () => {
      const out: ExtPreview[] = [];
      const seen = new Set<string>();
      await Promise.all(
        exts.filter((e) => e.enabled && allowExt(e, mode)).flatMap((e) => searchCatalogs(e).slice(0, 3).map(async (c) => {
          try {
            for (const it of await fetchCatalog(e, c, s)) {
              const k = `${it.type}:${it.id}`;
              if (!seen.has(k) && allowExtItem(it, mode)) { seen.add(k); out.push(it); }
            }
          } catch { /* ignore */ }
        }))
      );
      if (alive) { setExtResults(out.slice(0, 60)); setExtBusy(false); }
    }, 450);
    return () => { alive = false; window.clearTimeout(t); };
  }, [q, exts.length, mode, prefs.extensionsOn]);
  useEffect(() => input.current?.focus(), []);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return api.library
      .filter(
        (i) =>
          allowLibraryItem(i, mode) &&
          (displayTitle(i.cleanTitle).toLowerCase().includes(s) ||
          i.rawName.toLowerCase().includes(s) ||
          (i.year && String(i.year) === s))
      )
      .slice(0, 90);
  }, [q, api.library, mode]);

  return (
    <div className="fixed inset-0 z-[220] overflow-y-auto bg-[#07080C]">
      <div className="sticky top-0 z-10 flex items-center gap-2 bg-[#07080C]/95 px-3 py-3 backdrop-blur">
        <button onClick={onClose} aria-label="Back" className="rounded-full p-2 active:bg-white/10">
          <ArrowLeft className="h-5 w-5 text-white" />
        </button>
        <div className="flex flex-1 items-center gap-2 rounded-xl bg-white/[0.08] px-3">
          <Search className="h-4 w-4 text-zinc-400" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search movies & series"
            className="w-full bg-transparent py-2.5 text-[15px] text-white outline-none placeholder:text-zinc-500"
          />
          {q && (
            <button onClick={() => setQ('')} aria-label="Clear">
              <X className="h-4 w-4 text-zinc-400" />
            </button>
          )}
        </div>
      </div>
      {q.trim().length >= 2 && (
        <p className="px-4 pb-2 text-[12px] text-zinc-500">{results.length} result{results.length === 1 ? '' : 's'}</p>
      )}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-9 gap-x-2.5 md:gap-x-3 gap-y-4 px-3.5 md:px-6 pb-10">
        {results.map((it) => (
          <MobilePoster
            key={it.id}
            item={it}
            onOpen={(i, m) => {
              onClose();
              api.openDetails(i, m);
            }}
            saved={api.isSaved(it.id)}
            onToggleSave={api.toggleSave}
          />
        ))}
      </div>
      {(extBusy || extResults.length > 0) && q.trim().length >= 2 && (
        <>
          <p className="px-4 pb-2 pt-2 text-[12px] text-zinc-500">{extBusy ? 'Searching extensions…' : `From extensions · ${extResults.length}`}</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-9 gap-x-2.5 md:gap-x-3 gap-y-4 px-3.5 md:px-6 pb-10">
            {extResults.map((it) => (
              <ExtCard key={`${it.type}:${it.id}`} item={it} onOpen={api.openExt} className="w-full" />
            ))}
          </div>
        </>
      )}
      {q.trim().length < 2 && <p className="px-8 pt-20 text-center text-sm text-zinc-500">Type at least 2 letters</p>}
    </div>
  );
};
