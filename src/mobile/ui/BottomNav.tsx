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
  const cats = CATEGORIES.filter((c) => allowed.has(c.id) || (c.type && prefs.contentMode !== 'kids'));
  const main = TABS.filter((t) => t.id !== 'more');
  const settings = TABS.find((t) => t.id === 'more')!;
  const navBtn = (t: (typeof TABS)[number], desktop: boolean) => {
    const { id, label, Icon } = t;
    const active = tab === id;
    return (
      <button
        key={id}
        onClick={() => onChange(id)}
        className={
          desktop
            ? `flex w-full items-center gap-3.5 rounded-xl px-4 py-2.5 text-left transition-colors ${active ? 'bg-amber-400/12' : 'hover:bg-white/5'}`
            : 'flex flex-1 flex-col items-center gap-0.5 py-2 active:scale-95'
        }
      >
        <span className={desktop ? '' : `rounded-full px-4 py-1 transition-colors ${active ? 'bg-amber-400/15' : ''}`}>
          <Icon className={`h-[22px] w-[22px] ${active ? 'text-amber-400' : 'text-zinc-500'}`} />
        </span>
        <span className={desktop ? `text-[15px] font-semibold ${active ? 'text-amber-400' : 'text-zinc-300'}` : `text-[10.5px] font-semibold ${active ? 'text-amber-400' : 'text-zinc-500'}`}>{label}</span>
      </button>
    );
  };
  return (
    <>
      {/* Phone: bottom bar */}
      <nav className="fixed inset-x-0 bottom-0 z-[150] border-t border-white/[0.06] bg-[#0B0D13]/92 backdrop-blur-xl md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto flex max-w-xl items-stretch justify-around px-1">{TABS.map((t) => navBtn(t, false))}</div>
      </nav>

      {/* Computer: sidebar — logo, menu, categories (scrolls), who is watching, Settings at the bottom */}
      <nav className="fixed inset-y-0 left-0 z-[150] hidden w-[232px] flex-col border-r border-white/[0.06] bg-[#0A0C12] md:flex">
        <div className="flex items-center gap-3 px-7 pb-5 pt-7">
          <img src="/icon.png" alt="" className="h-9 w-9 rounded-xl" onError={(e) => ((e.currentTarget.style.display = 'none'))} />
          <span className="text-[22px] font-extrabold tracking-tight text-white">
            Goo<span className="text-amber-400">Watch</span>
          </span>
        </div>
        <div className="space-y-1 px-3">{main.map((t) => navBtn(t, true))}</div>

        <div className="mt-4 flex min-h-0 flex-1 flex-col px-3">
          <p className="px-4 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-500">Categories</p>
          <div className="min-h-0 flex-1 overflow-y-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
            {cats.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  onChange('discover');
                  openCategory(c);
                }}
                className="block w-full rounded-lg py-2 pl-[54px] pr-3 text-left text-[14px] text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-white/[0.06] px-3 pb-3 pt-3">
          <p className="px-4 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-500">Who is watching</p>
          <div className="mx-1 flex rounded-xl bg-white/[0.07] p-1">
            {([['all', 'Normal'], ['family', 'Family'], ['kids', 'Kids']] as const).map(([m, label]) => (
              <button
                key={m}
                onClick={() => void changeMode(m)}
                className={`flex-1 rounded-lg py-1.5 text-[12px] font-bold ${prefs.contentMode === m ? (m === 'all' ? 'bg-amber-400 text-black' : 'bg-emerald-400 text-black') : 'text-zinc-300 hover:bg-white/5'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-2">{navBtn(settings, true)}</div>
        </div>
      </nav>
    </>
  );
};
