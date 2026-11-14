import React, { useEffect, useMemo, useState } from 'react';
import { Row } from './Row';
import { ExtCard } from './ExtRows';
import { catalogGenres, fetchCatalog, homeCatalogs } from '../../extensions/client';
import { useExtensions } from '../../extensions/store';
import { ExtPreview } from '../../extensions/types';
import { allowExt, allowExtItem, useContentMode } from '../safety';
import { ratingNumber } from '../../services/ratings';

interface Job {
  key: string;
  title: string;
  subtitle: string;
  type: 'movie' | 'series';
  ids: string[]; // preferred catalog ids (Cinemeta: top = most popular, imdbRating = best rated)
  ranked: boolean;
  count: number;
  byRating?: boolean;
}

const JOBS: Job[] = [
  { key: 'top-series', title: 'Top 10 Series', subtitle: 'Most watched right now', type: 'series', ids: ['top'], ranked: true, count: 10 },
  { key: 'top-movie', title: 'Top 10 Movies', subtitle: 'Most watched right now', type: 'movie', ids: ['top'], ranked: true, count: 10 },
  { key: 'rated-series', title: 'Top rated series', subtitle: 'Highest IMDb score', type: 'series', ids: ['imdbRating'], ranked: false, count: 20, byRating: true },
  { key: 'rated-movie', title: 'Top rated movies', subtitle: 'Highest IMDb score', type: 'movie', ids: ['imdbRating'], ranked: false, count: 20, byRating: true },
];

/** Netflix-style shelves: Top 10 (numbered) and best rated, built from whatever catalogs the installed add-ons offer. */
export const TopRows: React.FC<{ onOpen: (p: ExtPreview) => void }> = ({ onOpen }) => {
  const exts = useExtensions();
  const mode = useContentMode();
  const [data, setData] = useState<Record<string, ExtPreview[]>>({});

  const plan = useMemo(
    () =>
      JOBS.map((j) => {
        for (const id of [...j.ids, '*']) {
          for (const e of exts) {
            if (!e.enabled || !allowExt(e, mode)) continue;
            const c = homeCatalogs(e).find((x) => x.type === j.type && (id === '*' ? !j.byRating : x.id === id));
            if (c) return { job: j, ext: e, cat: c };
          }
        }
        return null;
      }).filter(Boolean) as { job: Job; ext: (typeof exts)[number]; cat: ReturnType<typeof homeCatalogs>[number] }[],
    [exts, mode]
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      for (const p of plan) {
        const k = `${mode}|${p.job.key}|${p.ext.base}|${p.cat.id}`;
        if (data[k]) continue;
        try {
          let genre: string | undefined;
          if (mode === 'kids') {
            const gs = catalogGenres(p.cat);
            genre = gs.find((g) => /^family$/i.test(g)) || gs.find((g) => /^animation$/i.test(g));
            if (!genre) continue;
          }
          const items = await fetchCatalog(p.ext, p.cat, undefined, { genre });
          if (alive && items.length) setData((d) => ({ ...d, [k]: items }));
        } catch {
          /* skip this shelf */
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [plan, mode]);

  return (
    <>
      {plan.map((p) => {
        const k = `${mode}|${p.job.key}|${p.ext.base}|${p.cat.id}`;
        let list = (data[k] || []).filter((it) => allowExtItem(it, mode, mode === 'kids'));
        if (p.job.byRating && list.some((it) => it.rating)) list = [...list].sort((a, b) => ratingNumber(b.rating) - ratingNumber(a.rating));
        list = list.slice(0, p.job.count);
        if (!list.length) return null;
        return (
          <Row key={k} title={p.job.title} subtitle={p.job.subtitle}>
            {list.map((it, i) => (
              <ExtCard
                key={it.id}
                item={it}
                onOpen={onOpen}
                rank={p.job.ranked ? i + 1 : undefined}
                className="w-[31vw] max-w-[150px] shrink-0 snap-start"
              />
            ))}
          </Row>
        );
      })}
    </>
  );
};
