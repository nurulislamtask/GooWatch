import React, { useEffect, useMemo, useState } from 'react';
import { Row } from './Row';
import { ExtPreview } from '../../extensions/types';
import { catalogGenres, fetchCatalog, homeCatalogs } from '../../extensions/client';
import { useExtensions } from '../../extensions/store';
import { useRatings } from '../../services/ratings';
import { RatingBadge } from './RatingBadge';
import { allowExt, allowExtItem, useContentMode } from '../safety';
import { usePrefs } from '../prefs';

export const ExtCard: React.FC<{ item: ExtPreview; onOpen: (p: ExtPreview) => void; className?: string; rank?: number }> = ({
  item,
  onOpen,
  className = 'w-[31vw] max-w-[150px] shrink-0 snap-start',
  rank,
}) => {
  const rateable = item.type === 'movie' || item.type === 'series' || item.type === 'anime';
  const tt = item.id.match(/^tt\d{6,}/)?.[0];
  const r = useRatings(
    rateable ? { kind: item.type === 'movie' ? 'movie' : 'series', title: item.name, year: item.year, imdbId: tt, imdb: item.rating } : null,
    true
  );
  return (
    <button onClick={() => onOpen(item)} className={`${className} relative text-left active:scale-[0.97] transition-transform`}>
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-[#12151D] ring-1 ring-white/[0.06]">
        {item.poster ? (
          <img src={item.poster} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center p-2 text-center text-[12px] text-zinc-500">{item.name}</div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent" />
        <RatingBadge r={r} className="absolute bottom-1.5 right-1.5 flex-col items-end gap-0.5" />
        {rank ? (
          <span className="absolute left-1.5 top-1 text-[34px] font-black leading-none text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]" style={{ WebkitTextStroke: '1.5px #fbbf24' }}>
            {rank}
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 truncate text-[12.5px] font-medium text-zinc-100">{item.name}</p>
      {item.year && <p className="text-[11px] text-zinc-500">{item.year}</p>}
    </button>
  );
};

const TYPE_LABEL: Record<string, string> = { movie: 'Movies', series: 'Series', anime: 'Anime', tv: 'TV', channel: 'Channels' };

/** Home page shelves coming from the installed extensions. */
export const ExtRows: React.FC<{ onOpen: (p: ExtPreview) => void }> = ({ onOpen }) => {
  const exts = useExtensions();
  const mode = useContentMode();
  const [prefs] = usePrefs();
  const jobs = useMemo(() => {
    const out: { key: string; title: string; subtitle: string; ext: (typeof exts)[number]; cat: ReturnType<typeof homeCatalogs>[number] }[] = [];
    for (const e of exts) {
      if (!e.enabled || !allowExt(e, mode)) continue;
      for (const c of homeCatalogs(e).slice(0, 3)) {
        out.push({
          key: `${mode}|${e.base}|${c.type}|${c.id}`,
          title: `${c.name || c.id} · ${TYPE_LABEL[c.type] || c.type}`,
          subtitle: e.manifest.name,
          ext: e,
          cat: c,
        });
      }
    }
    return out.slice(0, 10);
  }, [exts, mode]);

  const [data, setData] = useState<Record<string, ExtPreview[]>>({});
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const j of jobs) {
        if (data[j.key]) continue;
        try {
          let genre: string | undefined;
          if (mode === 'kids') {
            const gs = catalogGenres(j.cat);
            genre = gs.find((g) => /^family$/i.test(g)) || gs.find((g) => /^animation$/i.test(g));
            if (!genre) continue; // this list cannot be limited to kid-safe titles
          }
          const items = await fetchCatalog(j.ext, j.cat, undefined, { genre });
          if (alive && items.length) setData((d) => ({ ...d, [j.key]: items.slice(0, 24) }));
        } catch {
          /* skip this shelf */
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [jobs, mode]);

  return (
    <>
      {prefs.extensionsOn && jobs.map((j) => {
        const list = (data[j.key] || []).filter((it) => allowExtItem(it, mode, mode === 'kids'));
        return list.length ? (
          <Row key={j.key} title={j.title} subtitle={`Extension: ${j.subtitle}`}>
            {list.map((it) => (
              <ExtCard key={it.id} item={it} onOpen={onOpen} />
            ))}
          </Row>
        ) : null;
      })}
    </>
  );
};
