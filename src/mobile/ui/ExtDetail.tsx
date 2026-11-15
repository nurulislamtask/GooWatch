import { useContentMode } from '../safety';
import { openTorrentioSetup } from './TorrentioSetup';
import { useGuide } from '../episodeGuide';
import { fmtTime, readGone, readResume } from '../resume';
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bookmark, BookmarkCheck, ExternalLink, Loader2, Play, X } from 'lucide-react';
import { ExtMeta, ExtPreview, ExtVideo, ResolvedStream } from '../../extensions/types';
import { fetchMeta, fetchStreams } from '../../extensions/client';
import { hasConfig, useExtensions } from '../../extensions/store';
import { useRatings } from '../../services/ratings';
import { RatingBadge } from './RatingBadge';
import { isExtSaved, toggleExtSaved, useExtSaved } from '../../extensions/library';
import { ParsedFtpItem } from '../../utils/ftpParser';
import { addonSubtitles, buildExtItem, guideFromVideos } from '../../extensions/play';

interface Target {
  videoId: string;
  season?: number;
  episode?: number;
  epTitle?: string;
}

export const ExtDetail: React.FC<{
  preview: ExtPreview;
  onClose: () => void;
  onPlay: (item: ParsedFtpItem) => void;
}> = ({ preview, onClose, onPlay }) => {
  const exts = useExtensions();
  const [meta, setMeta] = useState<ExtMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [season, setSeason] = useState<number>(1);
  const [target, setTarget] = useState<Target | null>(null);
  const [streams, setStreams] = useState<ResolvedStream[]>([]);
  const [pending, setPending] = useState(0);
  useExtSaved();
  const saved = isExtSaved(preview.id);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchMeta(exts, preview.type, preview.id, preview.addonBase).then((m) => {
      if (!alive) return;
      setMeta(m);
      setLoading(false);
      const seasons = [...new Set((m?.videos || []).map((v) => v.season ?? 1))].filter((n) => n > 0).sort((a, b) => a - b);
      if (seasons.length) setSeason(seasons[0]);
    });
    return () => {
      alive = false;
    };
  }, [preview.id, exts.length]);

  const videos = meta?.videos || [];
  const episodic = preview.type !== 'movie' && videos.length > 0;
  const seasons = useMemo(
    () => [...new Set(videos.map((v) => v.season ?? 1))].sort((a, b) => (a === 0 ? 1 : b === 0 ? -1 : a - b)),
    [videos]
  );
  const eps = useMemo(
    () =>
      videos
        .filter((v) => (v.season ?? 1) === season)
        .sort((a, b) => (a.episode ?? a.number ?? 0) - (b.episode ?? b.number ?? 0)),
    [videos, season]
  );

  // The list never starts anything by itself: you choose a stream (or press "Play best").
  const seq = React.useRef(0);
  const autoOn = React.useRef(false);
  const pickStreams = (t: Target) => {
    const my = ++seq.current;
    autoOn.current = false;
    setTarget(t);
    setStreams([]);
    setPending(1);
    fetchStreams(exts, preview.type, t.videoId, (all, p) => {
      if (seq.current !== my) return;
      setStreams(all);
      setPending(p);
      latest.current = all;
    });
  };
  const latest = React.useRef<ResolvedStream[]>([]);

  const [hintOff, setHintOff] = useState(() => {
    try {
      return localStorage.getItem('gw_hide_torrent_hint') === '1';
    } catch {
      return false;
    }
  });
  const dismissHint = () => {
    try {
      localStorage.setItem('gw_hide_torrent_hint', '1');
    } catch {
      /* ignore */
    }
    setHintOff(true);
  };
  const mode = useContentMode();
  const guide = useGuide(meta?.name || preview.name, String(preview.id).match(/^tt\d{6,}/)?.[0]);
  const [rTick, setRTick] = useState(0);
  useEffect(() => {
    const f = () => setRTick((x) => x + 1);
    window.addEventListener('gw:resume-changed', f);
    window.addEventListener('gw:sync-applied', f);
    return () => {
      window.removeEventListener('gw:resume-changed', f);
      window.removeEventListener('gw:sync-applied', f);
    };
  }, []);
  const resumeMap = useMemo(() => readResume(), [meta, target, rTick]);
  const goneMap = useMemo(() => readGone(), [meta, target, rTick]);
  // where to carry on: an episode that was started, else the one after the last finished, else the first
  const nextUp = useMemo(() => {
    if (!episodic) return null;
    const list = [...videos].sort((a, b) => (a.season ?? 1) - (b.season ?? 1) || (a.episode ?? a.number ?? 0) - (b.episode ?? b.number ?? 0));
    const part = list.find((v) => resumeMap[`ext:${v.id}`]);
    if (part) return { v: part, kind: 'continue' as const };
    let last = -1;
    list.forEach((v, i) => {
      if (goneMap[`ext:${v.id}`]) last = i;
    });
    if (last >= 0 && list[last + 1]) return { v: list[last + 1], kind: 'next' as const };
    return null;
  }, [videos, resumeMap, goneMap, episodic]);

  const playMain = () => {
    if (episodic) {
      const first = nextUp?.v || eps[0] || videos[0];
      if (first) pickStreams({ videoId: first.id, season: first.season ?? 1, episode: first.episode ?? first.number, epTitle: first.title || first.name });
    } else pickStreams({ videoId: preview.id });
  };

  const start = async (s: ResolvedStream, forTarget?: Target) => {
    seq.current++;
    if (s.external) {
      window.open(s.external, '_blank');
      return;
    }
    const tg = forTarget || target;
    if (!s.playable || !s.url || !tg) return;
    const title = meta?.name || preview.name;
    const isEp = tg.episode !== undefined;
    const year = parseInt(String(meta?.year || meta?.releaseInfo || preview.year || ''), 10) || undefined;
    setTarget(null);
    // subtitles from add-ons must never hold the movie back: wait a moment at most
    const extra = await Promise.race([addonSubtitles(preview.type, tg.videoId), new Promise<{ url: string; label: string }[]>((r) => setTimeout(() => r([]), 600))]).catch(() => []);
    onPlay(
      buildExtItem({
        title,
        type: preview.type,
        videoId: tg.videoId,
        season: isEp ? tg.season ?? 1 : undefined,
        episode: tg.episode,
        epTitle: tg.epTitle,
        year,
        poster: meta?.poster || preview.poster,
        background: meta?.background || preview.background,
        stream: s,
        guide: isEp ? guideFromVideos(meta?.videos) : undefined,
        extraSubs: extra,
      })
    );
  };

  const bg = meta?.background || preview.background || meta?.poster || preview.poster;
  const tt = String(preview.id).match(/^tt\d{6,}/)?.[0];
  const rated = useRatings(
    preview.type === 'movie' || preview.type === 'series' || preview.type === 'anime'
      ? { kind: preview.type === 'movie' ? 'movie' : 'series', title: meta?.name || preview.name, year: meta?.year || meta?.releaseInfo || preview.year, imdbId: tt, imdb: meta?.imdbRating ? String(meta.imdbRating) : preview.rating }
      : null,
    true
  );

  return (
    <div className="fixed inset-0 z-[230] overflow-y-auto bg-[#07080C]">
      <div className="relative h-[42vh] min-h-[260px] md:h-[46vh]">
        {bg && <img src={bg} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />}
        <div className="absolute inset-0 bg-gradient-to-t from-[#07080C] via-[#07080C]/50 to-black/30" />
        <button onClick={onClose} aria-label="Back" className="absolute left-3 rounded-full bg-black/50 p-2.5 backdrop-blur active:scale-90" style={{ top: 'max(12px, env(safe-area-inset-top))' }}>
          <ArrowLeft className="h-5 w-5 text-white" />
        </button>
      </div>

      <div className="relative z-10 -mt-20 px-4 pb-10 md:px-10">
        <div className="flex gap-4">
          {(meta?.poster || preview.poster) && (
            <img src={meta?.poster || preview.poster} alt="" className="h-40 w-[107px] shrink-0 rounded-xl object-cover ring-1 ring-white/10 md:h-56 md:w-[150px]" />
          )}
          <div className="min-w-0 self-end">
            <h1 className="text-[22px] font-extrabold leading-tight text-white md:text-4xl">{meta?.name || preview.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-zinc-300">
              {(meta?.releaseInfo || meta?.year || preview.year) && <span>{meta?.releaseInfo || meta?.year || preview.year}</span>}
              <RatingBadge r={rated} big />
              {meta?.runtime && <span>{meta.runtime}</span>}
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10.5px] uppercase">{preview.type}</span>
            </div>
            {meta?.genres && <p className="mt-1.5 text-[12px] text-zinc-400">{meta.genres.slice(0, 4).join(' · ')}</p>}
          </div>
        </div>

        <button
          onClick={playMain}
          disabled={loading}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 py-3 text-[15px] font-bold text-black active:scale-[0.98] disabled:opacity-60 md:max-w-sm"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5 fill-black" />}
          {episodic
            ? nextUp
              ? `${nextUp.kind === 'continue' ? 'Continue' : 'Next:'} S${String(nextUp.v.season ?? 1).padStart(2, '0')}E${String(nextUp.v.episode ?? nextUp.v.number ?? 0).padStart(2, '0')}`
              : 'Play first episode'
            : 'Play'}
        </button>
        <button
          onClick={() => toggleExtSaved({ ...preview, poster: meta?.poster || preview.poster, background: meta?.background || preview.background, name: meta?.name || preview.name })}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-2.5 text-[14px] font-semibold text-white active:scale-[0.98] md:max-w-sm"
        >
          {saved ? <BookmarkCheck className="h-5 w-5 text-amber-400" /> : <Bookmark className="h-5 w-5" />}
          {saved ? 'In My List' : 'Add to My List'}
        </button>

        {loading && <p className="mt-4 text-sm text-zinc-500">Loading details…</p>}
        {!loading && !meta && <p className="mt-4 text-sm text-red-300">No extension could give details for this title. You can still try Play.</p>}
        {meta?.description && <p className="mt-4 max-w-3xl text-[13.5px] leading-relaxed text-zinc-300">{meta.description}</p>}
        {meta?.cast && meta.cast.length > 0 && (
          <p className="mt-3 text-[12.5px] text-zinc-400">
            <span className="text-zinc-500">Starring: </span>
            {meta.cast.slice(0, 5).join(', ')}
          </p>
        )}

        {episodic && (
          <section className="mt-6">
            <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
              {seasons.map((n) => (
                <button
                  key={n}
                  onClick={() => setSeason(n)}
                  className={`shrink-0 rounded-full px-5 py-2 text-[14px] font-bold ${season === n ? 'bg-amber-400 text-black' : 'text-zinc-400 active:bg-white/10'}`}
                >
                  {n === 0 ? 'Specials' : `Season ${n}`}
                </button>
              ))}
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {eps.map((v: ExtVideo) => {
                const num = v.episode ?? v.number;
                const rp = resumeMap[`ext:${v.id}`];
                const pctSeen = rp && rp.d > 0 ? Math.min(100, Math.max(3, (rp.t / rp.d) * 100)) : rp ? 5 : 0;
                const watched = !rp && !!goneMap[`ext:${v.id}`];
                const gi = guide?.[`S${v.season ?? 1}E${num}`];
                const story = (v.overview || gi?.summary || '').trim();
                const score = gi?.rating;
                const when = v.released || gi?.airdate;
                const img = v.thumbnail || gi?.image || meta?.background;
                return (
                  <button
                    key={v.id}
                    onClick={() => pickStreams({ videoId: v.id, season: v.season ?? 1, episode: num, epTitle: v.title || v.name })}
                    className="flex gap-3.5 rounded-2xl bg-[#0F121A] p-2.5 text-left ring-1 ring-white/[0.05] active:bg-white/10"
                  >
                    <div className="relative aspect-video w-[38%] max-w-[190px] shrink-0 self-start overflow-hidden rounded-xl bg-black/40">
                      {img && <img src={img} alt="" loading="lazy" className="h-full w-full object-cover" />}
                      {num !== undefined && <span className="absolute right-0 top-0 rounded-bl-xl bg-black/80 px-2.5 py-1 text-[13px] font-extrabold text-white">{num}</span>}
                      {pctSeen > 0 && (
                        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
                          <div className="h-full bg-amber-400" style={{ width: `${pctSeen}%` }} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 py-0.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-2 text-[14px] font-extrabold leading-tight text-white">{v.title || v.name || `Episode ${num ?? ''}`}</p>
                        {when && <span className="shrink-0 pt-0.5 text-[11px] text-zinc-400">{new Date(when).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {score && <span className="rounded-md bg-amber-400/15 px-1.5 py-0.5 text-[11px] font-extrabold text-amber-300">★ {score}</span>}
                        {(rp || watched) && (
                          <span className="text-[11px] font-bold text-amber-300">{watched ? '✓ Watched' : `Watched ${fmtTime(rp.t)}${rp.d > 0 ? ` of ${fmtTime(rp.d)}` : ''}`}</span>
                        )}
                      </div>
                      {story && <p className="mt-1.5 line-clamp-3 text-[12px] leading-snug text-zinc-400">{story}</p>}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {target && (
        <div className="fixed inset-0 z-[240] flex items-end bg-black/60 md:items-center md:justify-center" onClick={() => { seq.current++; setTarget(null); }}>
          <div
            className="max-h-[78vh] w-full overflow-y-auto overflow-x-hidden rounded-t-3xl bg-[#10131B] p-4 md:max-w-xl md:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="min-w-0">
                <h3 className="text-[16px] font-bold text-white">Choose a stream</h3>
                <p className="truncate text-[12px] text-zinc-500">
                  {target.episode !== undefined ? `S${target.season ?? 1}E${target.episode} ${target.epTitle || ''}` : meta?.name || preview.name}
                </p>
              </div>
              <button onClick={() => { seq.current++; setTarget(null); }} aria-label="Close" className="rounded-full p-2 active:bg-white/10">
                <X className="h-5 w-5 text-zinc-300" />
              </button>
            </div>
            {pending > 0 && (
              <p className="flex items-center gap-2 pb-2 text-[12px] text-zinc-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Asking {pending} extension{pending === 1 ? '' : 's'}…
              </p>
            )}
            {streams.some((s) => s.playable && s.url) && (
              <button
                onClick={() => {
                  const b = streams.find((s) => s.playable && s.url);
                  if (b) void start(b, target || undefined);
                }}
                className="mb-2 w-full rounded-xl bg-emerald-500 py-2.5 text-[13.5px] font-black text-black active:scale-[.98]"
              >
                ▶ Play best stream
              </button>
            )}
            {(() => {
              const playable = streams.filter((s) => s.playable || s.external);
              const torrents = streams.filter((s) => !s.playable && !s.external);
              const row = (s: ResolvedStream) => (
                <button
                  key={s.key}
                  onClick={() => start(s)}
                  disabled={!s.playable && !s.external}
                  className={`mb-2 flex w-full min-w-0 items-start gap-3 rounded-xl p-3 text-left ring-1 ring-white/[0.06] ${
                    s.playable || s.external ? 'bg-white/[0.06] active:bg-white/15' : 'bg-white/[0.02] opacity-50'
                  }`}
                >
                  {s.external ? <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" /> : <Play className={`mt-0.5 h-4 w-4 shrink-0 ${s.playable ? 'fill-amber-400 text-amber-400' : 'text-zinc-600'}`} />}
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-[13px] font-semibold leading-snug text-white [overflow-wrap:anywhere]">{s.label}</p>
                    {s.detail && s.detail !== s.label && <p className="mt-0.5 line-clamp-2 break-words text-[11.5px] text-zinc-400 [overflow-wrap:anywhere]">{s.detail}</p>}
                    <p className="mt-0.5 text-[10.5px] text-zinc-500">{s.reason ? `${s.addon} · ${s.reason}` : s.addon}</p>
                  </div>
                </button>
              );
              return (
                <>
                  {playable.map(row)}
                  {torrents.length > 0 && mode !== 'kids' && hintOff && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[12px] text-zinc-500">{torrents.length} torrent-only streams (not playable without a debrid key)</summary>
                      <div className="mt-2">{torrents.map(row)}</div>
                    </details>
                  )}
                  {torrents.length > 0 && mode !== 'kids' && !hintOff && (() => {
                    const mine = exts.find((e) => /torrentio/i.test(e.base) && e.enabled && hasConfig(e));
                    return mine ? (
                      <div className="mt-2 rounded-2xl bg-amber-400/[0.07] p-3.5 ring-1 ring-amber-400/20">
                        <p className="text-[13.5px] font-bold text-amber-300">{torrents.length} torrent-only streams</p>
                        <p className="mt-1 text-[12px] leading-relaxed text-zinc-300">
                          Your configured Torrentio is installed, but these results came back as plain torrents. That usually means the debrid key is wrong / expired, or the file is not cached on your debrid yet.
                          Check your settings once more.
                        </p>
                        <button
                          onClick={() => openTorrentioSetup()}
                          className="mt-3 rounded-xl bg-white/10 px-4 py-2.5 text-[13px] font-extrabold text-white active:scale-95"
                        >
                          Change my debrid key
                        </button>
                        <button onClick={dismissHint} className="ml-2 mt-3 rounded-xl px-3 py-2.5 text-[12px] font-semibold text-zinc-400 active:scale-95">
                          Don’t show again
                        </button>
                        <details className="mt-3">
                          <summary className="cursor-pointer text-[12px] text-zinc-400">Show the torrent list</summary>
                          <div className="mt-2">{torrents.map(row)}</div>
                        </details>
                      </div>
                    ) : (
                    <div className="mt-2 rounded-2xl bg-amber-400/[0.07] p-3.5 ring-1 ring-amber-400/20">
                      <p className="text-[13.5px] font-bold text-amber-300">{torrents.length} torrent streams found — they can’t be played yet</p>
                      <p className="mt-1 text-[12px] leading-relaxed text-zinc-300">
                        Torrent links need a <b>debrid account</b> (Real-Debrid, AllDebrid, Premiumize…). It turns the torrent into a normal link GooWatch can play.
                      </p>
                      <p className="mt-2 text-[12px] text-zinc-300">Press the button, choose your debrid service, paste its key — GooWatch tests it and sets Torrentio up for you.</p>
                      <button
                        onClick={() => openTorrentioSetup()}
                        className="mt-3 rounded-xl bg-amber-400 px-4 py-2.5 text-[13px] font-extrabold text-black active:scale-95"
                      >
                        Set up debrid key
                      </button>
                      <button onClick={dismissHint} className="ml-2 mt-3 rounded-xl px-3 py-2.5 text-[12px] font-semibold text-zinc-400 active:scale-95">
                        Don’t show again
                      </button>
                      <details className="mt-3">
                        <summary className="cursor-pointer text-[12px] text-zinc-400">Show the torrent list</summary>
                        <div className="mt-2">{torrents.map(row)}</div>
                      </details>
                    </div>
                    );
                  })()}
                </>
              );
            })()}
            {pending === 0 && streams.length === 0 && (
              <p className="py-6 text-center text-[13px] text-zinc-400">
                No stream found. Add an extension that provides streams (Settings → Extensions), then try again.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
