import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { ParsedFtpItem } from '../utils/ftpParser';
import type { CinemaPlayerProps } from './CinemaPlayer';
import { NativePlayer, NativePlayerItem } from '../mobile/nativePlayer';
import { displayTitle } from '../utils/titleClean';
import { registerBack } from '../mobile/backStack';
import { playerEpisodeTitle } from '../mobile/episodeGuide';
import { buildExtItem, resolveEpisodeItem } from '../extensions/play';
import { fetchStreams } from '../extensions/client';
import { getExtensions } from '../extensions/store';
import type { ResolvedStream } from '../extensions/types';
import { readPrefs } from '../mobile/prefs';
import { withTimeout } from '../utils/withTimeout';
import { resolvePlayableFromFolder, getCachedPlayableUrl, saveCachedPlayableUrl } from '../services/ftpClient';

const DIRECT_VIDEO = /\.(mp4|mkv|webm|avi|mov|ts|m4v|m2ts|wmv|flv)(\?.*)?$/i;
const POS_KEY = 'cineftp_resume_v1';

// Names with spaces / brackets / non-English letters must be percent-encoded for the native player (the web view was forgiving)
function safeUrl(u: string): string {
  try {
    return new URL(u).href;
  } catch {
    return encodeURI(u);
  }
}

function readPositions(): Record<string, { t: number; d: number }> {
  try {
    return JSON.parse(localStorage.getItem(POS_KEY) || '{}');
  } catch {
    return {};
  }
}
function savePosition(id: string, t: number, d: number) {
  try {
    const all = readPositions();
    if (d > 0 && t > d - 60) delete all[id]; // finished: next time start from the beginning
    else if (t > 10) all[id] = { t, d };
    const keys = Object.keys(all);
    if (keys.length > 600) keys.slice(0, keys.length - 600).forEach((k) => delete all[k]);
    localStorage.setItem(POS_KEY, JSON.stringify(all));
  } catch {}
}

function titleOf(p: ParsedFtpItem): string {
  const base = p.cleanTitle || p.rawName;
  if (p.episode === undefined) return base;
  return playerEpisodeTitle(base.split(' · ')[0], p.season, p.episode, base);
}

function metaOf(p: ParsedFtpItem) {
  return {
    query: displayTitle(p.cleanTitle || p.rawName),
    year: p.year,
    season: p.episode !== undefined ? p.season ?? 1 : undefined,
    episode: p.episode,
    referer: p.streamReferer,
    userAgent: p.streamUserAgent,
  };
}

/** Opens the native phone player for the chosen video, then closes this screen when the user leaves it. */
export const NativePlayerLauncher: React.FC<CinemaPlayerProps> = (props) => {
  const { video, playlist, subtitles, initialStartTime = 0, onClose } = props;
  const [failure, setFailure] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState('Opening player…');
  const [picker, setPicker] = useState<null | { streams: ResolvedStream[]; loading: boolean; current: string; done: (s: ResolvedStream | null) => void }>(null);
  const launchedFor = useRef<string | null>(null);
  useEffect(() => registerBack(() => { onClose(); return true; }), []);
  const setFallback = (_startAt: number) =>
    setFailure('This file could not be played. Try again, or use "Open with" inside the player to pick another app.');

  useEffect(() => {
    const key = video.id + '#' + attempt;
    if (launchedFor.current === key) return;
    launchedFor.current = key;
    setFailure(null);
    let alive = true;

    (async () => {
      try {
        // 1. the real file address (a card can point at a folder)
        let url = video.url;
        if (!video.directStream && !DIRECT_VIDEO.test(url)) {
          const cached = getCachedPlayableUrl(video.id) || getCachedPlayableUrl(video.url);
          if (cached && DIRECT_VIDEO.test(cached)) url = cached;
          else {
            setStatus('Finding the video file…');
            const playable = await withTimeout(resolvePlayableFromFolder(video), 30000, 'server timeout');
            const found = playable?.primaryVideo?.url;
            if (!found || !DIRECT_VIDEO.test(found)) throw new Error('no file');
            url = found;
            saveCachedPlayableUrl(video.id, found);
            saveCachedPlayableUrl(video.url, found);
          }
        }

        // 2. queue = this episode + the others (next / previous buttons, "Videos" panel with seasons)
        const toSub = (list: ParsedFtpItem[]) =>
          list.slice(0, 25).map((s) => ({ url: safeUrl(s.url), label: s.cleanTitle || s.rawName }));
        const epRegex = (ep?: number) =>
          ep ? new RegExp(`(?:e|x|ep\\.?\\s*)0*${ep}(?!\\d)`, 'i') : null;

        let cur: ParsedFtpItem = { ...video, url };
        let startAt = (() => {
          const saved = readPositions()[video.id];
          return initialStartTime > 0 ? initialStartTime : saved && readPrefs().resumePlayback ? saved.t : 0;
        })();
        const prefs = readPrefs();

        for (let hop = 0; hop < 60; hop++) {
          const queue: { id: string; item: NativePlayerItem }[] = [];
          const guide = cur.episodeGuide;
          if (guide && cur.extType) {
            // extension series: every episode is listed, only the current one has a stream yet
            const base = (cur.cleanTitle || cur.rawName).split(' · ')[0];
            guide.forEach((g) => {
              const isCur = g.videoId === cur.extVideoId;
              const extra = (cur.streamSubs || []).map((s) => ({ url: s.url, label: s.label }));
              queue.push({
                id: `ext:${g.videoId}`,
                item: {
                  url: isCur ? safeUrl(cur.url) : '',
                  lazy: !isCur,
                  title: playerEpisodeTitle(base, g.season, g.episode, `${base} - ${g.title}`),
                  epTitle: g.title,
                  thumb: g.thumb || cur.backdropUrl || cur.posterUrl,
                  overview: g.overview,
                  released: g.released,
                  query: displayTitle(base),
                  year: cur.year,
                  season: g.season,
                  episode: g.episode,
                  referer: isCur ? cur.streamReferer : undefined,
                  userAgent: isCur ? cur.streamUserAgent : undefined,
                  subtitles: isCur ? extra : [],
                },
              });
            });
          } else {
            for (const p of playlist || []) {
              const thumb = p.backdropUrl || p.posterUrl;
              if (p.id === cur.id) {
                queue.push({
                  id: p.id,
                  item: { url: safeUrl(cur.url), title: titleOf(p), ...metaOf(p), thumb, subtitles: toSub(subtitles || []) },
                });
              } else if (!p.isDirectory && (p.directStream || DIRECT_VIDEO.test(p.url))) {
                const re = epRegex(p.episode);
                const subs = re ? (subtitles || []).filter((s) => re.test(s.rawName)) : [];
                queue.push({ id: p.id, item: { url: safeUrl(p.url), title: titleOf(p), ...metaOf(p), thumb, subtitles: toSub(subs) } });
              }
            }
            if (!queue.some((q) => q.id === cur.id)) {
              queue.splice(0, queue.length, {
                id: cur.id,
                item: { url: safeUrl(cur.url), title: titleOf(cur), ...metaOf(cur), subtitles: toSub(subtitles || []) },
              });
            }
          }
          const index = Math.max(0, queue.findIndex((q) => q.id === cur.id || q.id === `ext:${cur.extVideoId}`));

          setStatus('Starting…');
          const res = await NativePlayer.play({
            items: queue.map((q) => q.item),
            index,
            position: startAt,
            software: prefs.softwareDecoder,
            autoSubs: prefs.autoSubtitles,
            subLang: prefs.subtitleLang,
            quality: !!(cur.extType && cur.extVideoId),
          });
          if (!alive) return;

          const playedId = queue[Math.min(res.index, queue.length - 1)]?.id || cur.id;
          savePosition(playedId, res.position, res.duration);

          if (res.error && res.position < 5) {
            setFallback(startAt);
            return;
          }

          // subtitle size changed in the player: reopen at the same minute
          if (res.request === -3) {
            startAt = res.position;
            continue;
          }
          // Quality: show the other sources of this title, then continue at the same minute
          if (res.request === -2 && cur.extType && cur.extVideoId) {
            startAt = res.position;
            const c0 = cur;
            const chosen = await new Promise<ResolvedStream | null>((resolveP) => {
              const done = (s: ResolvedStream | null) => {
                setPicker(null);
                resolveP(s);
              };
              setPicker({ streams: [], loading: true, current: c0.url, done });
              fetchStreams(getExtensions(), c0.extType!, c0.extVideoId!, (all) => {
                setPicker((p) => (p ? { ...p, streams: all.filter((s) => s.playable && s.url).slice(0, 40) } : p));
              })
                .catch(() => {})
                .finally(() => setPicker((p) => (p ? { ...p, loading: false } : p)));
            });
            if (chosen) {
              cur = buildExtItem({
                title: c0.cleanTitle || c0.rawName, type: c0.extType!, videoId: c0.extVideoId!, season: c0.season, episode: c0.episode,
                epTitle: c0.epTitle, year: c0.year, poster: c0.posterUrl, background: c0.backdropUrl, stream: chosen,
                guide: c0.episodeGuide, extraSubs: c0.streamSubs,
              });
            }
            setStatus('Starting…');
            continue;
          }

          // the viewer picked / auto-advanced to an episode whose stream is not known yet
          if (typeof res.request === 'number' && res.request >= 0 && guide && guide[res.request]) {
            const ep = guide[res.request];
            setStatus(`Finding a stream for ${ep.title}…`);
            try {
              cur = await resolveEpisodeItem(cur, ep);
              startAt = readPositions()[`ext:${ep.videoId}`]?.t || 0;
              continue;
            } catch (e: any) {
              if (alive) setFailure(e?.message || 'No stream found for this episode');
              return;
            }
          }
          break;
        }
        onClose();
      } catch {
        if (alive) setFallback(initialStartTime || 0);
      }
    })();

    return () => {
      alive = false;
    };
  }, [video.id, attempt]);

  return (
    <div className="fixed inset-0 z-[300] bg-black flex flex-col items-center justify-center text-zinc-300 gap-4">
      <button
        onClick={onClose}
        className="absolute top-4 left-4 p-3 rounded-full bg-white/10 text-white"
        aria-label="Back"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>
      {picker && (
        <div className="fixed inset-0 z-[310] flex items-end bg-black/70 md:items-center md:justify-center">
          <div className="max-h-[80vh] w-full overflow-y-auto overflow-x-hidden rounded-t-3xl bg-[#10131B] p-4 md:max-w-xl md:rounded-3xl">
            <h3 className="text-[16px] font-bold text-white">Choose quality / source</h3>
            <p className="mb-3 text-[12px] text-zinc-500">{picker.loading ? 'Searching other sources…' : `${picker.streams.length} playable sources`} · continues at the same minute</p>
            {picker.streams.map((s) => (
              <button
                key={s.key}
                onClick={() => picker.done(s)}
                className={`mb-2 flex w-full min-w-0 items-start gap-3 rounded-xl p-3 text-left ring-1 ring-white/[0.06] ${s.url === picker.current ? 'bg-amber-400/20' : 'bg-white/[0.06] active:bg-white/15'}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[13px] font-semibold text-white [overflow-wrap:anywhere]">{s.label}</p>
                  <p className="mt-0.5 text-[10.5px] text-zinc-500">{s.addon}{s.url === picker.current ? ' · playing now' : ''}</p>
                </div>
              </button>
            ))}
            <button onClick={() => picker.done(null)} className="mt-2 w-full rounded-xl bg-white/10 py-3 text-[14px] font-semibold text-white">
              Keep current and resume
            </button>
          </div>
        </div>
      )}
      {failure ? (
        <>
          <p className="px-8 text-center text-sm text-rose-300 whitespace-pre-wrap break-words">{failure}</p>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-5 py-2.5 rounded-xl bg-white/10 text-white font-semibold">
              Back
            </button>
            <button
              onClick={() => setAttempt((a) => a + 1)}
              className="px-5 py-2.5 rounded-xl bg-[#E5A00D] text-black font-bold"
            >
              Try again
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-[#E5A00D] animate-spin" />
          <p className="text-sm">{status}</p>
        </>
      )}
    </div>
  );
};
