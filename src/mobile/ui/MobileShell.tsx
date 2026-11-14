import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ParsedFtpItem } from '../../utils/ftpParser';
import { AppSource, RecentlyPlayedEntry } from '../../types/cineftp';
import { EnrichedMetadata } from '../../services/ftpClient';
import { MediaDetailView } from '../../components/MediaDetailView';
import { registerBack } from '../backStack';
import { useLibrary } from '../useLibrary';
import { readPrefs, usePrefs } from '../prefs';
import { BottomNav } from './BottomNav';
import { HomeTab } from './HomeTab';
import { DiscoverTab } from './DiscoverTab';
import { ListTab } from './ListTab';
import { MoreTab } from './MoreTab';
import { ExtDetail } from './ExtDetail';
import { ExtPreview } from '../../extensions/types';
import { SearchOverlay } from './SearchOverlay';
import { InstallPrompt } from './InstallPrompt';
import { AddonStore } from './AddonStore';
import { STORE_EVENT } from '../../extensions/catalog';
import { CATEGORY_EVENT } from '../categories';
import { IS_CAPACITOR } from '../../utils/platform';
import { NativePlayer } from '../nativePlayer';
import { useInstallLinks } from '../../extensions/deepLink';
import { ShellApi, Tab } from './types';

export interface MobileShellProps {
  sources: AppSource[];
  watchlist: ParsedFtpItem[];
  recentlyPlayed: RecentlyPlayedEntry[];
  watchlistSet: Set<string>;
  onToggleWatchlist: (item: ParsedFtpItem) => void;
  selected: { item: ParsedFtpItem; meta?: EnrichedMetadata | null } | null;
  setSelected: (s: { item: ParsedFtpItem; meta?: EnrichedMetadata | null } | null) => void;
  onPlayDirect: (item: ParsedFtpItem, meta?: EnrichedMetadata | null) => void;
  onDetailPlay: React.ComponentProps<typeof MediaDetailView>['onPlayItem'];
  playerOpen: boolean;
  busy: boolean;
  onAddSource: (s: { name: string; url: string; type: 'movies' | 'series' }) => Promise<void>;
  onRemoveSource: (id: string) => void;
  onActivateSource: (s: { id: string; name: string; url: string; type: 'movies' | 'series' }) => void;
  onSyncSource: (id: string) => Promise<void>;
  onClearHistory: () => void;
}

/** The phone app's own interface (the PC app keeps its original layout). */
export const MobileShell: React.FC<MobileShellProps> = (props) => {
  const [tab, setTab] = useState<Tab>('home');
  const [searchOpen, setSearchOpen] = useState(false);
  const [ext, setExt] = useState<ExtPreview | null>(null);
  const [installAddr, setInstallAddr] = useState<string | null>(null);
  useInstallLinks((a) => {
    if (readPrefs().contentMode !== 'kids') setInstallAddr(a); // no add-on installs in Kids mode
  });
  const [storeOpen, setStoreOpen] = useState(false);
  useEffect(() => {
    const f = () => setStoreOpen(true);
    window.addEventListener(STORE_EVENT, f);
    return () => window.removeEventListener(STORE_EVENT, f);
  }, []);
  useEffect(() => {
    const f = () => setTab('discover'); // a category was picked (sidebar): Discover reads it when it opens
    window.addEventListener(CATEGORY_EVENT, f);
    return () => window.removeEventListener(CATEGORY_EVENT, f);
  }, []);
  const [prefs, setPrefs] = usePrefs();
  const lib = useLibrary(props.sources);
  useEffect(() => {
    if (IS_CAPACITOR) NativePlayer.setImmersive({ on: prefs.fullscreen }).catch(() => {});
  }, [prefs.fullscreen]);
  const [resumeTick, setResumeTick] = useState(0);

  // progress arrived from another device
  useEffect(() => {
    const f = () => setResumeTick((n) => n + 1);
    window.addEventListener('gw:resume-changed', f);
    return () => window.removeEventListener('gw:resume-changed', f);
  }, []);

  // refresh "Continue watching" every time the player closes
  useEffect(() => {
    if (!props.playerOpen) setResumeTick((n) => n + 1);
  }, [props.playerOpen]);

  // Back button / Esc: close the top layer first (search, details, other tab), leave the app only from Home
  const live = useRef({ tab, searchOpen, ext, selected: props.selected, setSelected: props.setSelected });
  live.current = { tab, searchOpen, ext, selected: props.selected, setSelected: props.setSelected };
  useEffect(
    () =>
      registerBack(() => {
        const L = live.current;
        if (L.ext) { setExt(null); return true; }
        if (L.searchOpen) { setSearchOpen(false); return true; }
        if (L.selected) { L.setSelected(null); return true; }
        if (L.tab !== 'home') { setTab('home'); return true; }
        return false;
      }),
    []
  );

  const api: ShellApi = useMemo(
    () => ({
      library: lib.items,
      sources: props.sources,
      watchlist: props.watchlist,
      recent: props.recentlyPlayed,
      isSaved: (id) => props.watchlistSet.has(id),
      toggleSave: props.onToggleWatchlist,
      openDetails: (item, meta) => props.setSelected({ item, meta }),
      play: (item, meta) => props.onPlayDirect(item, meta),
      goTab: setTab,
      openSearch: () => setSearchOpen(true),
      openExt: setExt,
      resumeTick,
    }),
    [lib.items, props.sources, props.watchlist, props.recentlyPlayed, props.watchlistSet, resumeTick]
  );

  const changeTab = useCallback((t: Tab) => {
    setTab(t);
    window.scrollTo({ top: 0 });
  }, []);

  return (
    <div className="h-screen w-screen overflow-y-auto overflow-x-hidden bg-[#07080C] pb-24 text-zinc-100 md:pb-10 md:pl-[232px]" style={{ WebkitOverflowScrolling: 'touch', paddingTop: 'env(safe-area-inset-top)' }}>
      {tab === 'home' && <HomeTab api={api} prefs={prefs} scanning={lib.scanning} progress={lib.progress} />}
      {tab === 'discover' && <DiscoverTab api={api} />}
      {tab === 'list' && <ListTab api={api} />}
      {tab === 'more' && (
        <MoreTab
          sources={props.sources}
          prefs={prefs}
          setPrefs={setPrefs}
          libraryCount={lib.items.length}
          updatedAt={lib.updatedAt}
          scanning={lib.scanning}
          progress={lib.progress}
          onRefresh={lib.refresh}
          onAddSource={props.onAddSource}
          onRemoveSource={props.onRemoveSource}
          onActivateSource={props.onActivateSource}
          onSyncSource={props.onSyncSource}
          onClearHistory={props.onClearHistory}
        />
      )}

      {!lib.ready && tab !== 'more' && (
        <div className="fixed inset-x-0 top-20 z-10 flex justify-center">
          <span className="flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-[12px] text-zinc-300 backdrop-blur">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading library… {lib.progress}
          </span>
        </div>
      )}

      {searchOpen && <SearchOverlay api={api} onClose={() => setSearchOpen(false)} />}

      {props.selected && (
        <div className="fixed inset-0 z-[200] overflow-y-auto bg-[#07080C]">
          <MediaDetailView
            item={props.selected.item}
            enrichedMeta={props.selected.meta}
            onBack={() => props.setSelected(null)}
            onPlayItem={props.onDetailPlay}
            isSaved={props.watchlistSet.has(props.selected.item.id)}
            onToggleWatchlist={props.onToggleWatchlist}
          />
        </div>
      )}

      {ext && (
        <ExtDetail
          preview={ext}
          onClose={() => setExt(null)}
          onPlay={(it) => props.onPlayDirect(it)}
        />
      )}

      {storeOpen && <AddonStore onClose={() => setStoreOpen(false)} />}
      {installAddr && <InstallPrompt address={installAddr} onClose={() => setInstallAddr(null)} />}

      {props.busy && (
        <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/50">
          <Loader2 className="h-9 w-9 animate-spin text-amber-400" />
        </div>
      )}

      {!props.playerOpen && <BottomNav tab={tab} onChange={changeTab} />}
    </div>
  );
};
