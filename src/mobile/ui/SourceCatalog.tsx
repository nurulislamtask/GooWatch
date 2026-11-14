import React from 'react';
import { Server } from 'lucide-react';
import { AppSource } from '../../types/cineftp';
import { SOURCE_CATALOG } from '../../utils/sourceCatalog';

interface Off {
  id: string;
  name: string;
  url: string;
  type: 'movies' | 'series';
}
const OFF_KEY = 'gw_off_sources_v1';
const readOff = (): Off[] => {
  try {
    const v = JSON.parse(localStorage.getItem(OFF_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const writeOff = (l: Off[]) => {
  try {
    localStorage.setItem(OFF_KEY, JSON.stringify(l));
  } catch {
    /* ignore */
  }
};

/** Ready-made servers: all OFF by default, one tap switches a server on (and off again). */
export const SourceCatalog: React.FC<{
  sources: AppSource[];
  onActivate: (s: { id: string; name: string; url: string; type: 'movies' | 'series' }) => void;
  onDeactivate: (id: string) => void;
}> = ({ sources, onActivate, onDeactivate }) => {
  const [off, setOff] = React.useState<Off[]>(readOff);
  const active = new Set(sources.map((s) => s.id));
  const catalogIds = new Set(SOURCE_CATALOG.map((c) => c.id));
  // servers the person added by hand: shown in the same list, off = remembered here so it can be switched on again
  const mine: (Off & { on: boolean })[] = [
    ...sources.filter((s) => !catalogIds.has(s.id)).map((s) => ({ id: s.id, name: s.name, url: s.url, type: s.type as 'movies' | 'series', on: true })),
    ...off.filter((o) => !catalogIds.has(o.id) && !active.has(o.id)).map((o) => ({ ...o, on: false })),
  ];
  const flip = (c: Off, on: boolean) => {
    if (on) {
      if (!catalogIds.has(c.id)) {
        const l = off.filter((o) => o.id !== c.id);
        writeOff(l);
        setOff(l);
      }
      onActivate(c);
    } else {
      if (!catalogIds.has(c.id)) {
        const l = [...off.filter((o) => o.id !== c.id), c];
        writeOff(l);
        setOff(l);
      }
      onDeactivate(c.id);
    }
  };
  const Switch: React.FC<{ on: boolean; name: string; onClick: () => void }> = ({ on, name, onClick }) => (
    <button
      role="switch"
      aria-checked={on}
      aria-label={on ? `Turn off ${name}` : `Turn on ${name}`}
      onClick={onClick}
      className={`relative h-[24px] w-[42px] shrink-0 rounded-full transition-colors ${on ? 'bg-amber-400' : 'bg-white/15'}`}
    >
      <span className={`absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all ${on ? 'left-[21px]' : 'left-[3px]'}`} />
    </button>
  );
  const groups = Array.from(new Set(SOURCE_CATALOG.map((c) => c.group)));
  return (
    <div className="px-4 pb-3 pt-2">
      <p className="mb-1 flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wider text-zinc-500">
        <Server className="h-3.5 w-3.5" /> Servers
      </p>
      <p className="mb-2 text-[11.5px] leading-relaxed text-zinc-500">
        One switch per server. Ready-made BDIX / DhakaFlix servers stay off until you switch them on — they work only when your network can reach the server.
      </p>
      {mine.length > 0 && (
        <div className="mb-2">
          <p className="mb-1 text-[11px] font-semibold text-zinc-400">Added by you</p>
          <div className="overflow-hidden rounded-xl bg-white/[0.04]">
            {mine.map((c) => (
              <div key={c.id} className="flex items-center gap-3 border-b border-white/[0.04] px-3 py-2.5 last:border-0">
                <p className="min-w-0 flex-1 truncate text-[13px] text-zinc-100">{c.name}</p>
                <Switch on={c.on} name={c.name} onClick={() => flip(c, !c.on)} />
              </div>
            ))}
          </div>
        </div>
      )}
      {groups.map((g) => (
        <div key={g} className="mb-2">
          <p className="mb-1 text-[11px] font-semibold text-zinc-400">{g}</p>
          <div className="overflow-hidden rounded-xl bg-white/[0.04]">
            {SOURCE_CATALOG.filter((c) => c.group === g).map((c) => {
              const on = active.has(c.id);
              return (
                <div key={c.id} className="flex items-center gap-3 border-b border-white/[0.04] px-3 py-2.5 last:border-0">
                  <p className="min-w-0 flex-1 truncate text-[13px] text-zinc-100">{c.name}</p>
                  <Switch on={on} name={c.name} onClick={() => flip(c, !on)} />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
