import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check, ChevronLeft, Gauge, Languages, List, Loader2, Maximize, Maximize2, Minimize, MonitorPlay, Pause, Play,
  RotateCcw, RotateCw, SkipBack, SkipForward, Subtitles, Volume2, VolumeX, X,
} from 'lucide-react';
import type { CinemaPlayerProps } from './CinemaPlayer';
import type { ParsedFtpItem, PlayerEpisode } from '../utils/ftpParser';
import { displayTitle } from '../utils/titleClean';
import { playerEpisodeTitle } from '../mobile/episodeGuide';
import { resolveEpisodeItem } from '../extensions/play';

const RESUME_KEY = 'cineftp_resume_v1';
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SUB_LANGS: [string, string][] = [['eng', 'English'], ['ben', 'Bangla'], ['hin', 'Hindi'], ['ara', 'Arabic'], ['spa', 'Spanish']];

function fmt(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
}
function saveResume(id: string, t: number, d: number) {
  try {
    const all = JSON.parse(localStorage.getItem(RESUME_KEY) || '{}');
    if (d > 0 && t > d - 30) delete all[id];
    else if (t > 10) all[id] = { t, d };
    localStorage.setItem(RESUME_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}
function readSaved(id: string): number {
  try { return JSON.parse(localStorage.getItem(RESUME_KEY) || '{}')[id]?.t || 0; } catch { return 0; }
}

interface AudioTrack { audioIndex: number; label: string; language?: string; channels?: number; companionUrl?: string }
interface SubOpt { id: string; label: string; vtt: string; group: 'file' | 'online' }
interface EpRow { key: string; season: number; episode: number; title: string; overview?: string; thumb?: string; released?: string; current: boolean; item?: ParsedFtpItem; guide?: PlayerEpisode }
type Scale = 'contain' | 'cover' | 'fill';
const SCALES: [Scale, string][] = [['contain', 'Fit'], ['cover', 'Fill screen'], ['fill', 'Stretch']];

/** GooWatch's PC player: direct play + HLS, automatic fallback to the ffmpeg remuxer, audio / subtitle pickers, online subtitles. */
export const ModernPlayer: React.FC<CinemaPlayerProps> = ({ video, playlist, initialStartTime = 0, onClose, onSelectVideo, onProgressUpdate }) => {
  const vref = useRef<HTMLVideoElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<any>(null);
  const hideT = useRef<number>(0);
  const panelOpen = useRef(false);

  const isHls = /\.m3u8(\?|$)/i.test(video.url);
  const [mode, setMode] = useState<'direct' | 'transcode'>('direct');
  const [audioIdx, setAudioIdx] = useState(0);
  const [offset, setOffset] = useState(0); // transcode: seconds already skipped
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [buf, setBuf] = useState(0);
  const [vol, setVol] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [full, setFull] = useState(false);
  const [bars, setBars] = useState(true);
  const [menu, setMenu] = useState<null | 'audio' | 'subs' | 'speed' | 'scale' | 'player'>(null);
  const [panel, setPanel] = useState(false);
  const [panelSeason, setPanelSeason] = useState(1);
  const [scale, setScale] = useState<Scale>('contain');
  const [switching, setSwitching] = useState('');
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [audios, setAudios] = useState<AudioTrack[]>([]);
  const [hlsAudios, setHlsAudios] = useState<{ id: number; label: string }[]>([]);
  const [hlsLevels, setHlsLevels] = useState<{ id: number; label: string }[]>([]);
  const [level, setLevel] = useState(-1);
  const [onlineSubs, setOnlineSubs] = useState<SubOpt[]>([]);
  const [fileSubs, setFileSubs] = useState<SubOpt[]>([]);
  const [subSel, setSubSel] = useState<string>('off');
  const [subBusy, setSubBusy] = useState(false);
  const [subLang, setSubLang] = useState(() => { try { return localStorage.getItem('cineftp_sub_lang') || 'eng'; } catch { return 'eng'; } });
  const [subDelay, setSubDelay] = useState(0);
  const startRef = useRef(initialStartTime || readSaved(video.id));

  const rows: EpRow[] = useMemo(() => {
    if (video.episodeGuide && video.episodeGuide.length > 1) {
      return video.episodeGuide.map((g) => ({
        key: `ext:${g.videoId}`, season: g.season, episode: g.episode, title: g.title, overview: g.overview,
        thumb: g.thumb || video.backdropUrl || video.posterUrl, released: g.released,
        current: g.videoId === video.extVideoId, guide: g,
      }));
    }
    const list = (playlist || []).filter((p) => !p.isDirectory);
    const out = list.map((p) => ({
      key: p.id, season: p.season ?? 1, episode: p.episode ?? 0,
      title: p.episode !== undefined ? `Episode ${p.episode}` : displayTitle(p.cleanTitle || p.rawName),
      thumb: p.backdropUrl || p.posterUrl, current: p.id === video.id, item: p,
    }));
    if (out.some((r) => r.episode > 0)) out.sort((a, b) => a.season - b.season || a.episode - b.episode);
    return out;
  }, [video.id, playlist, video.episodeGuide]);
  const curIdx = rows.findIndex((r) => r.current);
  const prevRow = curIdx > 0 ? rows[curIdx - 1] : null;
  const nextRow = curIdx >= 0 && curIdx < rows.length - 1 ? rows[curIdx + 1] : null;
  const seasonList = useMemo(() => [...new Set(rows.map((r) => r.season))].sort((a, b) => (a === 0 ? 1 : b === 0 ? -1 : a - b)), [rows]);

  const pickRow = useCallback(async (r: EpRow | null) => {
    if (!r || r.current) return;
    setPanel(false);
    if (r.item) { onSelectVideo(r.item); return; }
    if (!r.guide) return;
    setSwitching(r.title);
    try {
      onSelectVideo(await resolveEpisodeItem(video, r.guide));
    } catch (e: any) {
      setToast(e?.message || 'No stream found for this episode');
      window.setTimeout(() => setToast(''), 5000);
    } finally {
      setSwitching('');
    }
  }, [video, onSelectVideo]);
  const pickRef = useRef(pickRow);
  pickRef.current = pickRow;
  const nextRef = useRef(nextRow);
  nextRef.current = nextRow;

  const title = video.episode !== undefined
    ? playerEpisodeTitle((video.cleanTitle || video.rawName).split(' · ')[0], video.season, video.episode, video.epTitle ? `${(video.cleanTitle || video.rawName).split(' · ')[0]} - ${video.epTitle}` : video.cleanTitle || video.rawName)
    : displayTitle(video.cleanTitle || video.rawName);

  const srcUrl = useMemo(() => {
    if (isHls) return video.url;
    if (mode === 'transcode')
      return `/api/transcode?url=${encodeURIComponent(video.url)}&audioTrack=${audioIdx}&start=${Math.floor(offset)}&reencode=1`;
    if (video.streamReferer) return `/api/stream?url=${encodeURIComponent(video.url)}`;
    return video.url;
  }, [video.url, mode, audioIdx, offset, isHls, video.streamReferer]);

  // ---- attach the source (hls.js for .m3u8)
  useEffect(() => {
    const el = vref.current;
    if (!el) return;
    setError('');
    setBuffering(true);
    let dead = false;
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    const begin = () => {
      const t = mode === 'direct' ? startRef.current : 0;
      if (t > 5 && isFinite(t)) { try { el.currentTime = t; } catch { /* ignore */ } }
      startRef.current = 0;
      el.playbackRate = speed;
      el.play().catch(() => {});
    };
    if (isHls) {
      import('hls.js').then(({ default: Hls }) => {
        if (dead) return;
        if (Hls.isSupported()) {
          const h = new Hls({ enableWorker: true, maxBufferLength: 40 });
          hlsRef.current = h;
          h.loadSource(srcUrl);
          h.attachMedia(el);
          h.on(Hls.Events.MANIFEST_PARSED, () => {
            setHlsLevels(h.levels.map((l: any, i: number) => ({ id: i, label: l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)}k` })));
            begin();
          });
          h.on(Hls.Events.AUDIO_TRACKS_UPDATED, () =>
            setHlsAudios(h.audioTracks.map((a: any, i: number) => ({ id: i, label: a.name || a.lang || `Audio ${i + 1}` }))));
          h.on(Hls.Events.ERROR, (_e: any, d: any) => { if (d.fatal) setError('This stream could not be loaded.'); });
        } else { el.src = srcUrl; begin(); }
      });
    } else {
      el.src = srcUrl;
      el.load();
      el.addEventListener('loadedmetadata', begin, { once: true });
    }
    return () => { dead = true; el.removeEventListener('loadedmetadata', begin); };
  }, [srcUrl]);

  // ---- probe audio tracks (needs the local backend)
  useEffect(() => {
    if (isHls) return;
    let alive = true;
    fetch(`/api/probe?url=${encodeURIComponent(video.url)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j?.audioTracks) setAudios(j.audioTracks);
        if (Array.isArray(j?.subtitleTracks)) {
          setFileSubs((cur) => [
            ...cur.filter((s) => !s.id.startsWith('emb-')),
            ...j.subtitleTracks.map((s: any, i: number) => ({
              id: `emb-${i}`, label: `${s.label || 'Embedded'} (in file)`, group: 'file' as const,
              vtt: `/api/embedded-subtitle?url=${encodeURIComponent(video.url)}&subIndex=${s.subIndex ?? i}`,
            })),
          ]);
        }
        if (j?.duration > 0) setDur((d) => d || j.duration);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [video.id]);

  // ---- subtitles: files offered with the stream / add-ons, subtitles inside the file, online search (auto)
  useEffect(() => {
    setFileSubs((video.streamSubs || []).map((s, i) => ({
      id: `ext-${i}`, label: s.label || `Subtitle ${i + 1}`, group: 'file' as const, vtt: `/api/subs/convert?url=${encodeURIComponent(s.url)}`,
    })));
    setSubSel('off');
  }, [video.id]);

  useEffect(() => {
    let alive = true;
    setOnlineSubs([]);
    setSubBusy(true);
    const q = displayTitle(video.cleanTitle || video.rawName || '');
    const params = new URLSearchParams({
      q, lang: subLang, year: String(video.year || 0),
      season: String(video.episode !== undefined ? video.season ?? 1 : 0), episode: String(video.episode || 0),
      imdb: String((video.extVideoId || '').split(':')[0] || ''),
    });
    fetch(`/api/subs/search?${params}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: any[]) => {
        if (!alive || !Array.isArray(list)) return;
        setOnlineSubs(list.slice(0, 15).map((s, i) => ({ id: `on-${i}`, label: s.label, group: 'online' as const, vtt: `/api/subs/vtt?link=${encodeURIComponent(s.link)}` })));
      })
      .catch(() => {})
      .finally(() => alive && setSubBusy(false));
    return () => { alive = false; };
  }, [video.id, subLang]);

  const subs = useMemo(() => [...fileSubs, ...onlineSubs], [fileSubs, onlineSubs]);
  // automatic subtitles: pick the first one that shows up, unless the viewer turned subtitles off
  const autoPicked = useRef<string>('');
  useEffect(() => {
    if (autoPicked.current === video.id || !subs.length) return;
    try { if (localStorage.getItem('goowatch_auto_subs') === '0') return; } catch { /* ignore */ }
    autoPicked.current = video.id;
    setSubSel((c) => (c === 'off' ? subs[0].id : c));
  }, [subs, video.id]);

  const activeSub = subs.find((s) => s.id === subSel);
  const subUrl = activeSub ? `${activeSub.vtt}${activeSub.vtt.includes('?') ? '&' : '?'}offset=${subDelay}` : '';

  // ---- video events
  useEffect(() => {
    const el = vref.current;
    if (!el) return;
    const on = (ev: string, fn: () => void) => { el.addEventListener(ev, fn); return () => el.removeEventListener(ev, fn); };
    const offs = [
      on('play', () => setPlaying(true)),
      on('pause', () => setPlaying(false)),
      on('waiting', () => setBuffering(true)),
      on('playing', () => setBuffering(false)),
      on('canplay', () => setBuffering(false)),
      on('durationchange', () => { if (isFinite(el.duration) && el.duration > 0) setDur(mode === 'transcode' ? (d) => Math.max(d, offset + el.duration) : el.duration); }),
      on('timeupdate', () => {
        const t = (mode === 'transcode' ? offset : 0) + el.currentTime;
        setCur(t);
        if (el.buffered.length) setBuf((mode === 'transcode' ? offset : 0) + el.buffered.end(el.buffered.length - 1));
        onProgressUpdate?.(t, dur || el.duration || 0);
      }),
      on('volumechange', () => { setVol(el.volume); setMuted(el.muted); }),
      on('ended', () => { if (nextRef.current) pickRef.current(nextRef.current); }),
      on('error', () => {
        if (!isHls && mode === 'direct') { setMode('transcode'); return; }
        setError('This file could not be played.');
      }),
    ];
    return () => offs.forEach((f) => f());
  }, [mode, offset, dur, isHls]);

  // save position
  useEffect(() => {
    const t = window.setInterval(() => { if (cur > 0) saveResume(video.id, cur, dur); }, 4000);
    return () => { window.clearInterval(t); if (cur > 0) saveResume(video.id, cur, dur); };
  }, [cur, dur, video.id]);

  // ---- controls
  const toggle = useCallback(() => { const el = vref.current; if (!el) return; el.paused ? el.play().catch(() => {}) : el.pause(); }, []);
  const seekTo = useCallback((t: number) => {
    const el = vref.current;
    if (!el) return;
    t = Math.max(0, Math.min(t, dur || t));
    if (mode === 'transcode') {
      const inBuf = t >= offset && t <= offset + (el.buffered.length ? el.buffered.end(el.buffered.length - 1) : 0);
      if (inBuf) el.currentTime = t - offset;
      else { setOffset(t); setCur(t); }
    } else el.currentTime = t;
  }, [mode, offset, dur]);

  const poke = useCallback(() => {
    setBars(true);
    window.clearTimeout(hideT.current);
    hideT.current = window.setTimeout(() => { if (vref.current && !vref.current.paused && !panelOpen.current) { setBars(false); setMenu(null); } }, 3500);
  }, []);
  useEffect(() => { poke(); return () => window.clearTimeout(hideT.current); }, []);

  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else wrap.current?.requestFullscreen?.();
  }, []);
  useEffect(() => {
    const f = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      poke();
      const el = vref.current;
      switch (e.key) {
        case ' ': case 'k': e.preventDefault(); toggle(); break;
        case 'ArrowRight': case 'l': seekTo(cur + 10); break;
        case 'ArrowLeft': case 'j': seekTo(cur - 10); break;
        case 'ArrowUp': if (el) el.volume = Math.min(1, el.volume + 0.1); e.preventDefault(); break;
        case 'ArrowDown': if (el) el.volume = Math.max(0, el.volume - 0.1); e.preventDefault(); break;
        case 'm': if (el) el.muted = !el.muted; break;
        case 'f': toggleFull(); break;
        case 'n': if (nextRow) pickRow(nextRow); break;
        case 'p': if (prevRow) pickRow(prevRow); break;
        case 'Escape': if (panel) setPanel(false); else if (menu) setMenu(null); else if (!document.fullscreenElement) onClose(); break;
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [cur, toggle, seekTo, nextRow?.key, prevRow?.key, panel, menu]);

  const setRate = (r: number) => { setSpeed(r); if (vref.current) vref.current.playbackRate = r; setMenu(null); };
  const pip = () => { const el: any = vref.current; if (!el) return; if ((document as any).pictureInPictureElement) (document as any).exitPictureInPicture(); else el.requestPictureInPicture?.(); };

  const pct = dur > 0 ? (cur / dur) * 100 : 0;
  const bufPct = dur > 0 ? (buf / dur) * 100 : 0;
  const audioChoices: { key: string; label: string; active: boolean; pick: () => void }[] = isHls
    ? hlsAudios.map((a) => ({ key: String(a.id), label: a.label, active: hlsRef.current?.audioTrack === a.id, pick: () => { if (hlsRef.current) hlsRef.current.audioTrack = a.id; setMenu(null); } }))
    : audios.map((a) => ({
        key: String(a.audioIndex),
        label: `${a.label}${a.channels ? ` · ${a.channels > 2 ? a.channels - 1 + '.1' : a.channels + '.0'}` : ''}`,
        active: audioIdx === a.audioIndex,
        pick: () => {
          setMenu(null);
          if (a.audioIndex === audioIdx) return;
          startRef.current = cur;
          setAudioIdx(a.audioIndex);
          setOffset(cur);
          setMode('transcode');
        },
      }));

  panelOpen.current = panel;
  const item = (on: boolean) => `flex w-full items-center justify-between gap-6 rounded-lg px-3 py-2 text-left text-[13px] ${on ? 'bg-amber-400 font-semibold text-black' : 'text-zinc-100 hover:bg-white/10'}`;
  const ctl = 'flex items-center justify-center rounded-full text-white transition hover:bg-white/10 active:scale-90 disabled:opacity-25';
  const act = (on: boolean) => `flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[14px] font-medium transition hover:bg-white/10 ${on ? 'text-amber-300' : 'text-white'}`;
  const pop = 'absolute bottom-full left-1/2 mb-3 -translate-x-1/2 overflow-y-auto rounded-2xl bg-[#14171F]/97 p-1.5 shadow-2xl ring-1 ring-white/10 backdrop-blur';
  const objFit = scale === 'cover' ? 'object-cover' : scale === 'fill' ? 'object-fill' : 'object-contain';
  const shownRows = seasonList.length > 1 ? rows.filter((r) => r.season === panelSeason) : rows;
  const showUi = bars || panel || !!menu;

  useEffect(() => {
    if (panel) {
      setPanelSeason(rows.find((r) => r.current)?.season ?? seasonList[0] ?? 1);
      setTimeout(() => document.getElementById('gw-cur-ep')?.scrollIntoView({ block: 'center' }), 60);
    }
  }, [panel]);

  return (
    <div
      ref={wrap}
      className={`fixed inset-0 z-[500] select-none overflow-hidden bg-black ${showUi ? '' : 'cursor-none'}`}
      onMouseMove={poke}
      onClick={() => { setMenu(null); }}
    >
      <video ref={vref} className={`h-full w-full ${objFit}`} playsInline onClick={(e) => { e.stopPropagation(); if (panel) setPanel(false); else toggle(); }} onDoubleClick={toggleFull}>
        {subUrl && <track key={subUrl} kind="subtitles" src={subUrl} srcLang={subLang} label="Subtitles" default />}
      </video>

      {(buffering || switching) && !error && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
          <Loader2 className="h-14 w-14 animate-spin text-amber-400" />
          {switching && <p className="rounded-full bg-black/70 px-4 py-1.5 text-[13px] text-zinc-200">Finding a stream for “{switching}”…</p>}
        </div>
      )}
      {toast && (
        <div className="absolute left-1/2 top-20 max-w-lg -translate-x-1/2 rounded-xl bg-rose-500/90 px-4 py-2.5 text-center text-[13px] font-medium text-white shadow-xl">{toast}</div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 text-center">
          <p className="text-lg font-semibold text-white">{error}</p>
          <p className="max-w-md text-sm text-zinc-400">Try another stream from the title page, or check your connection.</p>
          <button onClick={onClose} className="rounded-xl bg-amber-400 px-6 py-2.5 font-bold text-black">Back</button>
        </div>
      )}

      {/* top bar: back, title, fullscreen, videos */}
      <div className={`absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/85 to-transparent px-6 pb-14 pt-5 transition-opacity ${showUi ? 'opacity-100' : 'pointer-events-none opacity-0'}`} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className={`${ctl} h-11 w-11`} aria-label="Back"><ChevronLeft className="h-8 w-8" /></button>
        <h1 className="min-w-0 flex-1 truncate text-[22px] font-extrabold text-white drop-shadow">{title}</h1>
        <button onClick={toggleFull} className="flex items-center gap-2 rounded-xl px-3 py-2 text-[15px] font-medium text-white hover:bg-white/10">
          {full ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />} {full ? 'Exit fullscreen' : 'Fullscreen'}
        </button>
        {rows.length > 1 && (
          <button onClick={() => { setMenu(null); setPanel((v) => !v); }} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[15px] font-medium hover:bg-white/10 ${panel ? 'text-amber-300' : 'text-white'}`}>
            <List className="h-5 w-5" /> Videos
          </button>
        )}
      </div>

      {/* centre controls */}
      {!error && (
        <div className={`absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-6 transition-opacity md:gap-10 ${showUi && !panel ? 'opacity-100' : 'pointer-events-none opacity-0'}`} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => pickRow(prevRow)} disabled={!prevRow} className={`${ctl} h-14 w-14`} aria-label="Previous"><SkipBack className="h-8 w-8" /></button>
          <button onClick={() => seekTo(cur - 10)} className={`${ctl} h-16 w-16`} aria-label="Back 10 seconds"><RotateCcw className="h-9 w-9" /></button>
          <button onClick={toggle} className={`${ctl} h-24 w-24`} aria-label="Play / pause">{playing ? <Pause className="h-16 w-16 fill-white" /> : <Play className="h-16 w-16 fill-white" />}</button>
          <button onClick={() => seekTo(cur + 10)} className={`${ctl} h-16 w-16`} aria-label="Forward 10 seconds"><RotateCw className="h-9 w-9" /></button>
          <button onClick={() => pickRow(nextRow)} disabled={!nextRow} className={`${ctl} h-14 w-14`} aria-label="Next"><SkipForward className="h-8 w-8" /></button>
        </div>
      )}

      {/* bottom: seek + actions */}
      <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-8 pb-5 pt-20 transition-opacity ${showUi ? 'opacity-100' : 'pointer-events-none opacity-0'}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-4">
          <span className="w-14 text-right text-[15px] font-medium tabular-nums text-white">{fmt(cur)}</span>
          <div
            className="group relative h-6 flex-1 cursor-pointer"
            onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seekTo(((e.clientX - r.left) / r.width) * dur); }}
          >
            <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/20">
              <div className="absolute inset-y-0 left-0 rounded-full bg-white/30" style={{ width: `${bufPct}%` }} />
              <div className="absolute inset-y-0 left-0 rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
            </div>
            <div className="absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-amber-400 shadow-lg ring-4 ring-amber-400/25" style={{ left: `calc(${pct}% - 10px)` }} />
          </div>
          <span className="w-14 text-[15px] font-medium tabular-nums text-white">{fmt(dur)}</span>
        </div>

        <div className="mt-2 flex items-center justify-around">
          <div className="relative">
            <button onClick={() => setMenu(menu === 'subs' ? null : 'subs')} className={act(menu === 'subs' || !!activeSub)}><Subtitles className="h-5 w-5" /> Subtitles</button>
            {menu === 'subs' && (
              <div className={`${pop} max-h-80 w-80`}>
                <div className="flex items-center justify-between px-3 py-1.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Subtitles {subBusy ? '· searching online…' : `· ${subs.length}`}</p>
                  <div className="flex gap-1">
                    {SUB_LANGS.map(([c, n]) => (
                      <button key={c} title={n} onClick={() => { setSubLang(c); try { localStorage.setItem('cineftp_sub_lang', c); } catch { /* ignore */ } }} className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${subLang === c ? 'bg-amber-400 text-black' : 'bg-white/10 text-zinc-300'}`}>{c.slice(0, 2).toUpperCase()}</button>
                    ))}
                  </div>
                </div>
                <button onClick={() => { setSubSel('off'); setMenu(null); }} className={item(subSel === 'off')}>Off{subSel === 'off' && <Check className="h-4 w-4" />}</button>
                {subs.map((s) => (<button key={s.id} onClick={() => { setSubSel(s.id); setMenu(null); }} className={item(subSel === s.id)}><span className="truncate">{s.label}</span>{subSel === s.id && <Check className="h-4 w-4 shrink-0" />}</button>))}
                {subSel !== 'off' && (
                  <div className="mt-1 flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-[12px] text-zinc-200">
                    <span>Delay {subDelay > 0 ? '+' : ''}{subDelay.toFixed(1)}s</span>
                    <span className="flex gap-1">
                      <button onClick={() => setSubDelay((d) => +(d - 0.5).toFixed(1))} className="rounded bg-white/10 px-2 py-0.5">−0.5</button>
                      <button onClick={() => setSubDelay((d) => +(d + 0.5).toFixed(1))} className="rounded bg-white/10 px-2 py-0.5">+0.5</button>
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="relative">
            <button onClick={() => setMenu(menu === 'audio' ? null : 'audio')} className={act(menu === 'audio')}>
              <Languages className="h-5 w-5" /> Audio Tracks{audioChoices.length > 1 ? ` (${audioChoices.length})` : ''}
            </button>
            {menu === 'audio' && (
              <div className={`${pop} max-h-72 w-72`}>
                <p className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-500">Audio</p>
                {audioChoices.length === 0 && <p className="px-3 py-2 text-[12px] text-zinc-400">Only the default audio in this file.</p>}
                {audioChoices.map((a) => (<button key={a.key} onClick={a.pick} className={item(a.active)}><span className="truncate">{a.label}</span>{a.active && <Check className="h-4 w-4 shrink-0" />}</button>))}
              </div>
            )}
          </div>

          <div className="relative">
            <button onClick={() => setMenu(menu === 'speed' ? null : 'speed')} className={act(menu === 'speed')}><Gauge className="h-5 w-5" /> Playback Speed{speed !== 1 ? ` (${speed}x)` : ''}</button>
            {menu === 'speed' && (
              <div className={`${pop} w-32`}>
                {SPEEDS.map((r) => (<button key={r} onClick={() => setRate(r)} className={item(speed === r)}>{r}x{speed === r && <Check className="h-4 w-4" />}</button>))}
              </div>
            )}
          </div>

          <div className="relative">
            <button onClick={() => setMenu(menu === 'scale' ? null : 'scale')} className={act(menu === 'scale')}><Maximize2 className="h-5 w-5" /> Video scaling</button>
            {menu === 'scale' && (
              <div className={`${pop} w-44`}>
                {SCALES.map(([k, n]) => (<button key={k} onClick={() => { setScale(k); setMenu(null); }} className={item(scale === k)}>{n}{scale === k && <Check className="h-4 w-4" />}</button>))}
              </div>
            )}
          </div>

          <div className="relative">
            <button onClick={() => setMenu(menu === 'player' ? null : 'player')} className={act(menu === 'player')}><MonitorPlay className="h-5 w-5" /> Player</button>
            {menu === 'player' && (
              <div className={`${pop} w-64`}>
                <div className="flex items-center gap-2 px-3 py-2">
                  <button onClick={() => { if (vref.current) vref.current.muted = !vref.current.muted; }} className="text-white">{muted || vol === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}</button>
                  <input type="range" min={0} max={1} step={0.02} value={muted ? 0 : vol} onChange={(e) => { if (vref.current) { vref.current.volume = +e.target.value; vref.current.muted = false; } }} className="h-1 flex-1 cursor-pointer accent-amber-400" />
                </div>
                <button onClick={() => { pip(); setMenu(null); }} className={item(false)}>Picture in picture</button>
                <button onClick={() => { toggleFull(); setMenu(null); }} className={item(false)}>{full ? 'Exit fullscreen' : 'Fullscreen'}</button>
                {hlsLevels.length > 1 && (
                  <>
                    <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-zinc-500">Quality</p>
                    <button onClick={() => { setLevel(-1); if (hlsRef.current) hlsRef.current.currentLevel = -1; setMenu(null); }} className={item(level < 0)}>Auto{level < 0 && <Check className="h-4 w-4" />}</button>
                    {hlsLevels.map((l) => (<button key={l.id} onClick={() => { setLevel(l.id); if (hlsRef.current) hlsRef.current.currentLevel = l.id; setMenu(null); }} className={item(level === l.id)}>{l.label}{level === l.id && <Check className="h-4 w-4" />}</button>))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Videos panel: seasons + episodes */}
      <div className={`absolute inset-y-0 right-0 z-10 flex w-[min(460px,92vw)] flex-col bg-[#191824]/96 shadow-2xl backdrop-blur-xl transition-transform duration-300 ${panel ? 'translate-x-0' : 'translate-x-full'}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 pb-2 pt-4">
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
            {seasonList.length > 1 ? seasonList.map((s) => (
              <button key={s} onClick={() => setPanelSeason(s)} className={`shrink-0 rounded-full px-5 py-2 text-[15px] font-semibold ${panelSeason === s ? 'bg-amber-400 text-black' : 'bg-white/[0.08] text-zinc-300 hover:bg-white/15'}`}>
                {s > 0 ? `Season ${s}` : 'Specials'}
              </button>
            )) : <h2 className="px-1 py-1.5 text-[17px] font-bold text-white">Videos</h2>}
          </div>
          <button onClick={() => setPanel(false)} className={`${ctl} h-9 w-9 shrink-0`} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-6">
          {shownRows.map((r) => (
            <button
              key={r.key}
              id={r.current ? 'gw-cur-ep' : undefined}
              onClick={() => pickRow(r)}
              className={`flex w-full gap-3 px-4 py-3 text-left transition hover:bg-white/[0.06] ${r.current ? 'bg-amber-400/15' : ''}`}
            >
              <div className="relative h-[74px] w-[132px] shrink-0 overflow-hidden rounded-xl bg-[#2A2938]">
                {r.thumb && <img src={r.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />}
                <span className="absolute right-0 top-0 flex h-7 w-8 items-center justify-center bg-black/80 text-[14px] font-bold text-white">{r.episode || '•'}</span>
                {r.current && <span className="absolute bottom-0 left-0 bg-amber-400 px-2 py-0.5 text-[10px] font-extrabold text-black">▶ NOW</span>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[15px] font-bold text-white">{r.title}</p>
                  {r.released && <span className="shrink-0 text-[11px] text-zinc-500">{r.released}</span>}
                </div>
                {r.overview && <p className="mt-1 line-clamp-3 text-[12.5px] leading-snug text-zinc-400">{r.overview}</p>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
