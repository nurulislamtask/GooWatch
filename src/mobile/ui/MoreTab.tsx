import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Database,
  Download,
  Eye,
  EyeOff,
  Loader2,
  PlayCircle,
  Plus,
  RefreshCw,
  Trash2,
  Info,
  Puzzle,
} from 'lucide-react';
import { AppSource } from '../../types/cineftp';
import { MobilePrefs } from '../prefs';
import { clearCatalog } from '../catalogCache';
import { clearResume } from '../resume';
import { ExtManager } from './ExtManager';
import { SourceCatalog } from './SourceCatalog';
import { fetchLatestRelease, isNewer } from '../../components/AppUpdatePrompt';
import { NativePlayer } from '../nativePlayer';
import { AboutPanel } from '../../components/AboutPanel';
import { SyncPanel } from './SyncPanel';
import { changeMode, checkPin } from '../safety';
import { openAddonStore } from '../../extensions/catalog';
import { IS_CAPACITOR } from '../../utils/platform';

interface Props {
  sources: AppSource[];
  prefs: MobilePrefs;
  setPrefs: (p: Partial<MobilePrefs>) => void;
  libraryCount: number;
  updatedAt: number;
  scanning: boolean;
  progress: string;
  onRefresh: () => void;
  onAddSource: (s: { name: string; url: string; type: 'movies' | 'series' }) => Promise<void>;
  onRemoveSource: (id: string) => void;
  onActivateSource: (s: { id: string; name: string; url: string; type: 'movies' | 'series' }) => void;
  onSyncSource: (id: string) => Promise<void>;
  onClearHistory: () => void;
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mt-6">
    <h2 className="mb-2 px-5 text-[11.5px] font-bold uppercase tracking-wider text-zinc-500">{title}</h2>
    <div className="mx-4 divide-y divide-white/[0.05] overflow-hidden rounded-2xl bg-[#0F121A] ring-1 ring-white/[0.05]">{children}</div>
  </section>
);

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void }> = ({ on, onChange }) => (
  <button
    role="switch"
    aria-checked={on}
    onClick={() => onChange(!on)}
    className={`relative h-[26px] w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-amber-400' : 'bg-white/15'}`}
  >
    <span className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-[3px]'}`} />
  </button>
);

const Line: React.FC<{
  title: string;
  hint?: string;
  right?: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  icon?: React.ReactNode;
}> = ({ title, hint, right, onClick, danger, icon }) => (
  <div
    onClick={onClick}
    className={`flex items-center gap-3 px-4 py-3.5 ${onClick ? 'active:bg-white/[0.04]' : ''}`}
  >
    {icon && <span className="text-zinc-400">{icon}</span>}
    <div className="min-w-0 flex-1">
      <p className={`text-[14px] font-medium ${danger ? 'text-rose-400' : 'text-zinc-100'}`}>{title}</p>
      {hint && <p className="mt-0.5 text-[11.5px] leading-snug text-zinc-500">{hint}</p>}
    </div>
    {right}
  </div>
);

function ago(ts: number) {
  if (!ts) return 'never';
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

export const MoreTab: React.FC<Props> = (p) => {
  const [showExt, setShowExt] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [type, setType] = useState<'movies' | 'series'>('movies');
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [upd, setUpd] = useState<string>('');
  const [updApk, setUpdApk] = useState<string | null>(null);
  const [done, setDone] = useState('');

  const flash = (t: string) => {
    setDone(t);
    window.setTimeout(() => setDone(''), 2500);
  };

  const hiddenSet = new Set(p.prefs.homeHidden.length ? p.prefs.homeHidden : p.sources.filter((s) => /wwe|wrestl|aew/i.test(s.name)).map((s) => s.id));
  const toggleHome = (id: string) => {
    const next = new Set(hiddenSet);
    next.has(id) ? next.delete(id) : next.add(id);
    p.setPrefs({ homeHidden: [...next].length ? [...next] : ['__none__'] });
  };

  const checkUpdate = async () => {
    setUpd('Checking…');
    setUpdApk(null);
    const rel = await fetchLatestRelease();
    if (!rel) return setUpd('Could not reach the update server');
    if (typeof __APP_VERSION__ !== 'undefined' && isNewer(rel.version, __APP_VERSION__)) {
      setUpd(`Version ${rel.version} is available`);
      setUpdApk(rel.apk);
    } else setUpd("You're up to date");
  };

  return (
    <div className="pb-6">
      <div className="px-5 pt-5">
        <h1 className="text-[22px] font-extrabold tracking-tight text-white">Settings</h1>
        <p className="text-[12px] text-zinc-500">
          GooWatch {typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__ !== '0.0.0' ? `v${__APP_VERSION__}` : ''}
        </p>
      </div>
      {done && (
        <div className="fixed left-1/2 top-4 z-[300] -translate-x-1/2 rounded-full bg-emerald-500 px-4 py-2 text-[13px] font-semibold text-black shadow-lg">
          {done}
        </div>
      )}

      {showExt && <ExtManager onClose={() => setShowExt(false)} />}
      <Section title="Who is watching">
        <div className="px-4 py-4">
          <div className="flex rounded-xl bg-white/[0.07] p-1">
            {([['all', 'Normal'], ['family', 'Family'], ['kids', 'Kids']] as const).map(([m, label]) => (
              <button
                key={m}
                onClick={() => void changeMode(m)}
                className={`flex-1 rounded-lg py-2 text-[13px] font-bold ${p.prefs.contentMode === m ? (m === 'all' ? 'bg-amber-400 text-black' : 'bg-emerald-400 text-black') : 'text-zinc-300'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2.5 text-[12px] leading-relaxed text-zinc-500">
            <b className="text-zinc-300">Family</b> hides adult and horror titles. <b className="text-zinc-300">Kids</b> shows only cartoons / family titles and asks for a 4-digit PIN to leave (you set it the first time).
            Titles are judged by their genre and name, so it is a helpful filter, not a guarantee.
          </p>
          {p.prefs.contentMode !== 'all' && p.prefs.kidsPin && (
            <button
              onClick={async () => {
                if (await checkPin('Enter the current PIN to remove it')) p.setPrefs({ kidsPin: '' });
              }}
              className="mt-2 text-[12px] font-semibold text-zinc-400 underline"
            >
              Remove PIN
            </button>
          )}
        </div>
      </Section>

      <Section title="Extensions">
        <Line
          icon={<Puzzle className="h-5 w-5" />}
          title="Use extensions"
          hint="On: Discover, Home shelves, Top 10 and search use your add-ons. Off: only My servers are shown."
          right={<Toggle on={p.prefs.extensionsOn} onChange={(v) => p.setPrefs({ extensionsOn: v })} />}
        />
        {p.prefs.extensionsOn && p.prefs.contentMode !== 'kids' && (
          <>
            <Line title="Manage extensions" hint="Add movies, series, anime & streams from extensions" onClick={() => setShowExt(true)} right={<ChevronRight className="h-4 w-4 text-zinc-500" />} />
            <Line title="Add-on store" hint="Recommended add-ons, one tap to install" onClick={openAddonStore} right={<ChevronRight className="h-4 w-4 text-zinc-500" />} />
          </>
        )}
      </Section>

      <Section title="Sync across devices">
        <SyncPanel />
      </Section>

      <Section title="Ratings">
        <div className="px-4 py-3.5">
          <p className="text-[14px] font-medium text-zinc-100">Rotten Tomatoes score (optional)</p>
          <p className="mt-0.5 text-[11.5px] leading-snug text-zinc-500">
            IMDb scores show on every title automatically. For Rotten Tomatoes, paste a free key from omdbapi.com (it takes a minute, 1,000 lookups a day).
          </p>
          <input
            defaultValue={p.prefs.omdbKey}
            onBlur={(e) => p.setPrefs({ omdbKey: e.target.value.trim() })}
            placeholder="OMDb key, e.g. a1b2c3d4"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="mt-2 w-full rounded-xl bg-white/[0.07] px-3.5 py-2.5 text-[13px] text-white outline-none ring-1 ring-white/[0.06] placeholder:text-zinc-500 focus:ring-amber-400/50"
          />
        </div>
      </Section>

      {IS_CAPACITOR && (
        <Section title="Display">
          <Line
            title="Full screen"
            hint="Hide the status bar and navigation bar. Swipe from the edge to show them for a moment."
            right={<Toggle on={p.prefs.fullscreen} onChange={(v) => p.setPrefs({ fullscreen: v })} />}
          />
        </Section>
      )}

      <Section title="Library">
        <Line
          icon={<Database className="h-5 w-5" />}
          title="My servers (optional)"
          hint={`${p.sources.length} servers · ${p.libraryCount.toLocaleString()} titles`}
          onClick={() => setShowSources((v) => !v)}
          right={showSources ? <ChevronDown className="h-4 w-4 text-zinc-500" /> : <ChevronRight className="h-4 w-4 text-zinc-500" />}
        />
        {showSources && (
          <div className="bg-black/20">
            <SourceCatalog sources={p.sources} onActivate={p.onActivateSource} onDeactivate={p.onRemoveSource} />
            <button onClick={() => setShowAdd((v) => !v)} className="flex w-full items-center gap-2 px-4 py-3 text-[13.5px] font-semibold text-amber-400 active:bg-white/[0.04]">
              <Plus className="h-4 w-4" /> Add a source
            </button>
            {showAdd && (
              <form
                className="space-y-2.5 px-4 pb-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!url.trim()) return;
                  setAdding(true);
                  await p.onAddSource({ name: name.trim() || url.trim(), url: url.trim(), type });
                  setAdding(false);
                  setName('');
                  setUrl('');
                  setShowAdd(false);
                  flash('Source added');
                  p.onRefresh();
                }}
              >
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Hindi Movies)" className="w-full rounded-xl bg-white/[0.07] px-3 py-3 text-[14px] text-white outline-none placeholder:text-zinc-500" />
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://172.16.50.x/…/" inputMode="url" autoCapitalize="none" className="w-full rounded-xl bg-white/[0.07] px-3 py-3 text-[14px] text-white outline-none placeholder:text-zinc-500" />
                <div className="flex rounded-xl bg-white/[0.07] p-1">
                  {(['movies', 'series'] as const).map((t) => (
                    <button type="button" key={t} onClick={() => setType(t)} className={`flex-1 rounded-lg py-2 text-[13px] font-semibold ${type === t ? 'bg-amber-400 text-black' : 'text-zinc-300'}`}>
                      {t === 'movies' ? 'Movies' : 'Series'}
                    </button>
                  ))}
                </div>
                <button disabled={adding} className="w-full rounded-xl bg-amber-400 py-3 text-[14px] font-bold text-black active:scale-[0.98]">
                  {adding ? 'Scanning…' : 'Add & scan'}
                </button>
              </form>
            )}
          </div>
        )}
        <Line
          icon={<RefreshCw className={`h-5 w-5 ${p.scanning ? 'animate-spin' : ''}`} />}
          title="Refresh library now"
          hint={p.scanning ? `Updating… ${p.progress}` : `Last updated ${ago(p.updatedAt)}. It also refreshes by itself every 6 hours.`}
          onClick={() => !p.scanning && p.onRefresh()}
        />
      </Section>

      <Section title="Home page">
        <Line title="Auto-slide the top banner" right={<Toggle on={p.prefs.heroAutoSlide} onChange={(v) => p.setPrefs({ heroAutoSlide: v })} />} />
        <Line title="Show Continue Watching" right={<Toggle on={p.prefs.showContinue} onChange={(v) => p.setPrefs({ showContinue: v })} />} />
      </Section>

      <Section title="Playback">
        <Line
          icon={<PlayCircle className="h-5 w-5" />}
          title="Resume where I stopped"
          hint="Start movies from the last position."
          right={<Toggle on={p.prefs.resumePlayback} onChange={(v) => p.setPrefs({ resumePlayback: v })} />}
        />
        <Line
          title="Software video decoder"
          hint="Turn on only if some movies show a black screen or fail. Slower, but plays more files."
          right={<Toggle on={p.prefs.softwareDecoder} onChange={(v) => p.setPrefs({ softwareDecoder: v })} />}
        />
        <Line
          title="Auto subtitles"
          hint="When a movie has no subtitles, find and add one online automatically."
          right={<Toggle on={p.prefs.autoSubtitles} onChange={(v) => p.setPrefs({ autoSubtitles: v })} />}
        />
        <Line
          title={`Subtitle language: ${({ eng: 'English', ben: 'Bangla', hin: 'Hindi', ara: 'Arabic', spa: 'Spanish' } as Record<string, string>)[p.prefs.subtitleLang] || p.prefs.subtitleLang}`}
          hint="Tap to change"
          onClick={() => {
            const order = ['eng', 'ben', 'hin', 'ara', 'spa'];
            p.setPrefs({ subtitleLang: order[(order.indexOf(p.prefs.subtitleLang) + 1) % order.length] });
          }}
        />
        <Line title="Player gestures" hint="Swipe left side = brightness · right side = volume · swipe across = seek · double-tap sides = ∓10 s · hold = 2x speed · pinch = zoom." />
      </Section>

      <Section title="Storage">
        <Line
          title="Clear picture cache"
          hint="Posters are looked up again"
          onClick={() => {
            try {
              localStorage.removeItem('cineftp_meta_cache_v1');
            } catch {}
            flash('Picture cache cleared');
          }}
        />
        <Line
          title="Clear library cache"
          hint="The full list is scanned again from the servers"
          onClick={async () => {
            await clearCatalog();
            try {
              localStorage.removeItem('cineftp_indexed_cache_v3');
            } catch {}
            flash('Library cache cleared');
            p.onRefresh();
          }}
        />
        <Line
          title="Clear watch history"
          danger
          onClick={() => {
            if (!window.confirm('Remove history and Continue Watching?')) return;
            p.onClearHistory();
            clearResume();
            flash('History cleared');
          }}
        />
      </Section>

      <Section title="App">
        <Line
          icon={<Download className="h-5 w-5" />}
          title="Check for updates"
          hint={upd || 'Looks for a newer version of GooWatch'}
          onClick={checkUpdate}
          right={
            updApk ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  NativePlayer.installUpdate({ url: updApk }).catch(() => {});
                }}
                className="rounded-lg bg-amber-400 px-3 py-1.5 text-[12.5px] font-bold text-black"
              >
                Update
              </button>
            ) : null
          }
        />
        <Line
          icon={<Info className="h-5 w-5" />}
          title="About"
          onClick={() => setShowAbout((v) => !v)}
          right={showAbout ? <ChevronDown className="h-4 w-4 text-zinc-500" /> : <ChevronRight className="h-4 w-4 text-zinc-500" />}
        />
        {showAbout && (
          <div className="p-3">
            <AboutPanel />
          </div>
        )}
      </Section>
    </div>
  );
};
