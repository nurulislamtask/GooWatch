import React, { useEffect, useMemo, useState } from 'react';
import { Row } from './Row';
import { ExtPreview } from '../../extensions/types';
import { fetchCatalog, homeCatalogs } from '../../extensions/client';
import { useExtensions } from '../../extensions/store';

export const ExtCard: React.FC<{ item: ExtPreview; onOpen: (p: ExtPreview) => void; className?: string }> = ({
  item,
  onOpen,
  className = 'w-[31vw] max-w-[150px] shrink-0 snap-start',
}) => (
  <button onClick={() => onOpen(item)} className={`${className} text-left active:scale-[0.97] transition-transform`}>
    <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-[#12151D] ring-1 ring-white/[0.06]">
      {item.poster ? (
        <img src={item.poster} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center p-2 text-center text-[12px] text-zinc-500">{item.name}</div>
      )}
    </div>
    <p className="mt-1.5 truncate text-[12.5px] font-medium text-zinc-100">{item.name}</p>
    {item.year && <p className="text-[11px] text-zinc-500">{item.year}</p>}
  </button>
);

const TYPE_LABEL: Record<string, string> = { movie: 'Movies', series: 'Series', anime: 'Anime', tv: 'TV', channel: 'Channels' };

/** Home page shelves coming from the installed extensions. */
export const ExtRows: React.FC<{ onOpen: (p: ExtPreview) => void }> = ({ onOpen }) => {
  const exts = useExtensions();
  const jobs = useMemo(() => {
    const out: { key: string; title: string; subtitle: string; ext: (typeof exts)[number]; cat: ReturnType<typeof homeCatalogs>[number] }[] = [];
    for (const e of exts) {
      if (!e.enabled) continue;
      for (const c of homeCatalogs(e).slice(0, 3)) {
        out.push({
          key: `${e.base}|${c.type}|${c.id}`,
          title: `${c.name || c.id} · ${TYPE_LABEL[c.type] || c.type}`,
          subtitle: e.manifest.name,
          ext: e,
          cat: c,
        });
      }
    }
    return out.slice(0, 10);
  }, [exts]);

  const [data, setData] = useState<Record<string, ExtPreview[]>>({});
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const j of jobs) {
        if (data[j.key]) continue;
        try {
          const items = await fetchCatalog(j.ext, j.cat);
          if (alive && items.length) setData((d) => ({ ...d, [j.key]: items.slice(0, 24) }));
        } catch {
          /* skip this shelf */
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [jobs]);

  return (
    <>
      {jobs.map((j) =>
        data[j.key] ? (
          <Row key={j.key} title={j.title} subtitle={`Extension: ${j.subtitle}`}>
            {data[j.key].map((it) => (
              <ExtCard key={it.id} item={it} onOpen={onOpen} />
            ))}
          </Row>
        ) : null
      )}
    </>
  );
};
