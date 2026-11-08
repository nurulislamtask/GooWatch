import React from 'react';
import { Server } from 'lucide-react';
import { AppSource } from '../../types/cineftp';
import { SOURCE_CATALOG } from '../../utils/sourceCatalog';

/** Ready-made servers: all OFF by default, one tap switches a server on (and off again). */
export const SourceCatalog: React.FC<{
  sources: AppSource[];
  onActivate: (s: { id: string; name: string; url: string; type: 'movies' | 'series' }) => void;
  onDeactivate: (id: string) => void;
}> = ({ sources, onActivate, onDeactivate }) => {
  const active = new Set(sources.map((s) => s.id));
  const groups = Array.from(new Set(SOURCE_CATALOG.map((c) => c.group)));
  return (
    <div className="px-4 pb-3 pt-2">
      <p className="mb-1 flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wider text-zinc-500">
        <Server className="h-3.5 w-3.5" /> Source catalog
      </p>
      <p className="mb-2 text-[11.5px] leading-relaxed text-zinc-500">
        Ready-made BDIX / DhakaFlix servers. They stay off until you switch them on — works only when your network can reach the server.
      </p>
      {groups.map((g) => (
        <div key={g} className="mb-2">
          <p className="mb-1 text-[11px] font-semibold text-zinc-400">{g}</p>
          <div className="overflow-hidden rounded-xl bg-white/[0.04]">
            {SOURCE_CATALOG.filter((c) => c.group === g).map((c) => {
              const on = active.has(c.id);
              return (
                <div key={c.id} className="flex items-center gap-3 border-b border-white/[0.04] px-3 py-2.5 last:border-0">
                  <p className="min-w-0 flex-1 truncate text-[13px] text-zinc-100">{c.name}</p>
                  <button
                    role="switch"
                    aria-checked={on}
                    aria-label={on ? `Turn off ${c.name}` : `Turn on ${c.name}`}
                    onClick={() => (on ? onDeactivate(c.id) : onActivate(c))}
                    className={`relative h-[24px] w-[42px] shrink-0 rounded-full transition-colors ${on ? 'bg-amber-400' : 'bg-white/15'}`}
                  >
                    <span className={`absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all ${on ? 'left-[21px]' : 'left-[3px]'}`} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
