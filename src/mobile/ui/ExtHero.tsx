import React, { useEffect, useState } from 'react';
import { Info, Play } from 'lucide-react';
import { ExtPreview } from '../../extensions/types';
import { catalogGenres, fetchCatalog, homeCatalogs } from '../../extensions/client';
import { allowExt, allowExtItem, useContentMode } from '../safety';
import { useExtensions } from '../../extensions/store';

/** Hero slider built from the first extension catalogs (used when there is no server library). */
export const ExtHero: React.FC<{ onOpen: (p: ExtPreview) => void; auto: boolean }> = ({ onOpen, auto }) => {
  const exts = useExtensions();
  const mode = useContentMode();
  const [slides, setSlides] = useState<ExtPreview[]>([]);
  const [i, setI] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      const out: ExtPreview[] = [];
      for (const e of exts.filter((x) => x.enabled && allowExt(x, mode))) {
        for (const c of homeCatalogs(e).slice(0, 2)) {
          try {
            let genre: string | undefined;
            if (mode === 'kids') {
              const gs = catalogGenres(c);
              genre = gs.find((g) => /^family$/i.test(g)) || gs.find((g) => /^animation$/i.test(g));
              if (!genre) continue;
            }
            const r = await fetchCatalog(e, c, undefined, { genre });
            out.push(...r.filter((x) => (x.background || x.poster) && allowExtItem(x, mode, mode === 'kids')).slice(0, 4));
          } catch {
            /* skip */
          }
          if (out.length >= 8) break;
        }
        if (out.length >= 8) break;
      }
      if (alive) setSlides(out.slice(0, 8));
    })();
    return () => {
      alive = false;
    };
  }, [exts.length, mode]);

  useEffect(() => {
    if (!auto || slides.length < 2) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % slides.length), 6000);
    return () => window.clearInterval(t);
  }, [auto, slides.length]);

  if (slides.length === 0) return <div className="h-[44vh] min-h-[280px] w-full animate-pulse bg-white/[0.03] md:h-[50vh] md:max-h-[540px]" />;
  const s = slides[i % slides.length];
  return (
    <div className="relative h-[66vh] min-h-[420px] w-full overflow-hidden md:h-[58vh] md:max-h-[540px] md:min-h-[380px]">
      {slides.map((x, k) => (
        <img
          key={x.id}
          src={x.background || x.poster}
          alt=""
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${k === i % slides.length ? 'opacity-100' : 'opacity-0'}`}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-t from-[#07080C] via-[#07080C]/40 to-black/30" />
      <div className="absolute inset-x-0 bottom-0 px-4 pb-9 md:px-10 md:pb-12">
        <div className="flex items-center gap-2 text-[12px] text-zinc-300">
          <span className="rounded-md bg-amber-400/90 px-2 py-0.5 text-[11px] font-bold uppercase text-black">{s.type}</span>
          {s.year && <span>{s.year}</span>}
        </div>
        <h2 className="mt-2 text-[28px] font-extrabold leading-tight text-white md:text-[44px]">{s.name}</h2>
        <div className="mt-4 flex items-center gap-2.5 md:max-w-md">
          <button onClick={() => onOpen(s)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-400 py-3 text-[15px] font-bold text-black active:scale-[0.98]">
            <Play className="h-5 w-5 fill-black" /> Play
          </button>
          <button onClick={() => onOpen(s)} className="flex items-center gap-2 rounded-xl bg-white/15 px-4 py-3 text-[14px] font-semibold text-white backdrop-blur active:scale-[0.98]">
            <Info className="h-5 w-5" /> Info
          </button>
        </div>
        <div className="mt-4 flex justify-center gap-1.5">
          {slides.map((_, k) => (
            <button key={k} aria-label={`Slide ${k + 1}`} onClick={() => setI(k)} className={`h-1.5 rounded-full transition-all ${k === i % slides.length ? 'w-5 bg-amber-400' : 'w-1.5 bg-white/40'}`} />
          ))}
        </div>
      </div>
    </div>
  );
};
