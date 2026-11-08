import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bookmark, BookmarkCheck, ExternalLink, Loader2, Play, Star, X } from 'lucide-react';
import { ExtMeta, ExtPreview, ExtVideo, ResolvedStream } from '../../extensions/types';
import { fetchMeta, fetchStreams } from '../../extensions/client';
import { useExtensions } from '../../extensions/store';
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

  const pickStreams = (t: Target) => {
    setTarget(t);
    setStreams([]);
    setPending(1);
    fetchStreams(exts, preview.type, t.videoId, (all, p) => {
      setStreams(all);
      setPending(p);
    });
  };

  const playMain = () => {
    if (episodic) {
      const first = eps[0] || videos[0];
      if (first) pickStreams({ videoId: first.id, season: first.season ?? 1, episode: first.episode ?? first.number, epTitle: first.title || first.name });
    } else pickStreams({ videoId: preview.id });
  };

  const start = async (s: ResolvedStream) => {
    if (s.external) {
      window.open(s.external, '_blank');
      return;
    }
    if (!s.playable || !s.url || !target) return;
    const tg = target;
    const title = meta?.name || preview.name;
    const isEp = tg.episode !== undefined;
    const year = parseInt(String(meta?.year || meta?.releaseInfo || preview.year || ''), 10) || undefined;
    setTarget(null);
    const extra = await addonSubtitles(preview.type, tg.videoId);
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
  const rating = meta?.imdbRating;

  return (
    <div className="fixed inset-0 z-[230] overflow-y-auto bg-[#07080C]">
      <div className="relative h-[42vh] min-h-[260px] md:h-[46vh]">
        {bg && <img src={bg} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />}
        <div className="absolute inset-0 bg-gradient-to-t from-[#07080C] via-[#07080C]/50 to-black/30" />
        <button onClick={onClose} aria-label="Back" className="absolute left-3 top-3 rounded-full bg-black/50 p-2.5 backdrop-blur active:scale-90">
          <ArrowLeft className="h-5 w-5 text-white" />
        </button>
      </div>

      <div className="-mt-24 px-4 pb-10 md:px-10">
        <div className="flex gap-4">
          {(meta?.poster || preview.poster) && (
            <img src={meta?.poster || preview.poster} alt="" className="h-40 w-[107px] shrink-0 rounded-xl object-cover ring-1 ring-white/10 md:h-56 md:w-[150px]" />
          )}
          <div className="min-w-0 self-end">
            <h1 className="text-[22px] font-extrabold leading-tight text-white md:text-4xl">{meta?.name || preview.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-zinc-300">
              {(meta?.releaseInfo || meta?.year || preview.year) && <span>{meta?.releaseInfo || meta?.year || preview.year}</span>}
              {rating && (
                <span className="flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  {rating}
                </span>
              )}
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
          {episodic ? 'Play first episode' : 'Play'}
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
                  className={`shrink-0 rounded-full px-4 py-1.5 text-[13px] font-semibold ${season === n ? 'bg-amber-400 text-black' : 'bg-white/10 text-zinc-200'}`}
                >
                  {n === 0 ? 'Specials' : `Season ${n}`}
                </button>
              ))}
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {eps.map((v: ExtVideo) => {
                const num = v.episode ?? v.number;
                return (
                  <button
                    key={v.id}
                    onClick={() => pickStreams({ videoId: v.id, season: v.season ?? 1, episode: num, epTitle: v.title || v.name })}
                    className="flex gap-3 rounded-xl bg-[#0F121A] p-2 text-left ring-1 ring-white/[0.05] active:bg-white/10"
                  >
                    <div className="relative h-[68px] w-[120px] shrink-0 overflow-hidden rounded-lg bg-black/40">
                      {(v.thumbnail || meta?.background) && <img src={v.thumbnail || meta?.background} alt="" loading="lazy" className="h-full w-full object-cover" />}
                      <Play className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 fill-white/90 text-white/90" />
                    </div>
                    <div className="min-w-0 py-0.5">
                      <p className="truncate text-[13.5px] font-semibold text-white">
                        {num !== undefined ? `${num}. ` : ''}
                        {v.title || v.name || `Episode ${num ?? ''}`}
                      </p>
                      {(v.released || v.overview) && (
                        <p className="mt-0.5 line-clamp-2 text-[11.5px] text-zinc-500">
                          {v.released ? new Date(v.released).toLocaleDateString() : ''} {v.overview || ''}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {target && (
        <div className="fixed inset-0 z-[240] flex items-end bg-black/60 md:items-center md:justify-center" onClick={() => setTarget(null)}>
          <div
            className="max-h-[78vh] w-full overflow-y-auto rounded-t-3xl bg-[#10131B] p-4 md:max-w-xl md:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="min-w-0">
                <h3 className="text-[16px] font-bold text-white">Choose a stream</h3>
                <p className="truncate text-[12px] text-zinc-500">
                  {target.episode !== undefined ? `S${target.season ?? 1}E${target.episode} ${target.epTitle || ''}` : meta?.name || preview.name}
                </p>
              </div>
              <button onClick={() => setTarget(null)} aria-label="Close" className="rounded-full p-2 active:bg-white/10">
                <X className="h-5 w-5 text-zinc-300" />
              </button>
            </div>
            {pending > 0 && (
              <p className="flex items-center gap-2 pb-2 text-[12px] text-zinc-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Asking {pending} extension{pending === 1 ? '' : 's'}…
              </p>
            )}
            {streams.map((s) => (
              <button
                key={s.key}
                onClick={() => start(s)}
                disabled={!s.playable && !s.external}
                className={`mb-2 flex w-full items-start gap-3 rounded-xl p-3 text-left ring-1 ring-white/[0.06] ${
                  s.playable || s.external ? 'bg-white/[0.06] active:bg-white/15' : 'bg-white/[0.02] opacity-50'
                }`}
              >
                {s.external ? <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" /> : <Play className={`mt-0.5 h-4 w-4 shrink-0 ${s.playable ? 'fill-amber-400 text-amber-400' : 'text-zinc-600'}`} />}
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold leading-snug text-white">{s.label}</p>
                  {s.detail && s.detail !== s.label && <p className="mt-0.5 line-clamp-2 text-[11.5px] text-zinc-400">{s.detail}</p>}
                  <p className="mt-0.5 text-[10.5px] text-zinc-500">{s.reason ? `${s.addon} · ${s.reason}` : s.addon}</p>
                </div>
              </button>
            ))}
            {pending === 0 && streams.length === 0 && (
              <p className="py-6 text-center text-[13px] text-zinc-400">
                No stream found. Add an extension that provides streams (Settings → Extensions), then try again.
              </p>
            )}
            {pending === 0 && streams.length > 0 && !streams.some((x) => x.playable) && (
              <p className="py-2 text-center text-[12px] text-zinc-500">These are torrent-only. Add an extension that gives direct (HTTP) streams to play them.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
