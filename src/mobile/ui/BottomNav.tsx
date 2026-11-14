import React from 'react';
import { Home, Compass, Bookmark, Settings } from 'lucide-react';
import { Tab } from './types';
import { CATEGORIES, openCategory } from '../categories';
import { usePrefs } from '../prefs';
import { changeMode, genresFor } from '../safety';

const TABS: { id: Tab; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'home', label: 'Home', Icon: Home },
  { id: 'discover', label: 'Discover', Icon: Compass },
  { id: 'list', label: 'Library', Icon: Bookmark },
  { id: 'more', label: 'Settings', Icon: Settings },
];

/** Phone: bottom bar. Computer (md+): left sidebar with the logo. */
export const BottomNav: React.FC<{ tab: Tab; onChange: (t: Tab) => void }> = ({ tab, onChange }) => {
  const [prefs] = usePrefs();
  const allowed = new Set(genresFor(prefs.contentMode, CATEGORIES.map((c) => c.id)));
  const cats = prefs.extensionsOn ? CATEGORIES.filter((c) => allowed.has(c.id) || (c.type && prefs.contentMode !== 'kids')) : [];
  return (
  <nav
    className="md:flex md:flex-col fixed inset-x-0 bottom-0 z-[150] border-t border-white/[0.06] bg-[#0B0D13]/92 backdrop-blur-xl md:inset-y-0 md:right-auto md:w-[232px] md:border-r md:border-t-0 md:bg-[#0A0C12]"
    style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
  >
    <div className="hidden items-center gap-3 px-6 pb-6 pt-7 md:flex">
      <img src="/icon.png" alt="" className="h-9 w-9 rounded-xl" onError={(e) => ((e.currentTarget.style.display = 'none'))} />
      <span className="text-[22px] font-extrabold tracking-tight text-white">
        Goo<span className="text-amber-400">Watch</span>
      </span>
    </div>
    <div className="mx-auto flex max-w-xl items-stretch justify-around px-1 md:max-w-none md:flex-col md:justify-start md:gap-1 md:px-3">
      {TABS.map(({ id, label, Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 active:scale-95 md:flex-none md:flex-row md:gap-3.5 md:rounded-xl md:px-4 md:py-3 md:transition-colors ${
              active ? 'md:bg-amber-400/12' : 'md:hover:bg-white/5'
            }`}
          >
            <span className={`rounded-full px-4 py-1 transition-colors md:p-0 ${active ? 'bg-amber-400/15 md:bg-transparent' : ''}`}>
              <Icon className={`h-[22px] w-[22px] ${active ? 'text-amber-400' : 'text-zinc-500'}`} />
            </span>
            <span className={`text-[10.5px] font-semibold md:text-[15px] ${active ? 'text-amber-400' : 'text-zinc-500 md:text-zinc-300'}`}>{label}</span>
          </button>
        );
      })}
    </div>

    {cats.length > 0 && (
      <div className="hidden min-h-0 flex-1 flex-col px-3 pt-4 md:flex">
        <p className="px-4 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-500">Categories</p>
        <div className="min-h-0 flex-1 overflow-y-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
          {cats.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                onChange('discover');
                openCategory(c);
              }}
              className="block w-full rounded-lg px-4 py-2 text-left text-[14px] text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
    )}

    <div className="hidden border-t border-white/[0.06] p-3 md:block">
      <p className="px-1 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-500">Who is watching</p>
      <div className="flex rounded-xl bg-white/[0.07] p-1">
        {([['all', 'Normal'], ['family', 'Family'], ['kids', 'Kids']] as const).map(([m, label]) => (
          <button
            key={m}
            onClick={() => changeMode(m)}
            className={`flex-1 rounded-lg py-1.5 text-[12px] font-bold ${prefs.contentMode === m ? (m === 'all' ? 'bg-amber-400 text-black' : 'bg-emerald-400 text-black') : 'text-zinc-300 hover:bg-white/5'}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  </nav>
  );
};
