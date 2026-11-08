import { ParsedFtpItem, PlayerEpisode } from '../utils/ftpParser';
import { ExtVideo, ResolvedStream } from './types';
import { getExtensions } from './store';
import { fetchExtSubtitles, pickBestStream } from './client';

/** Episode list of an extension title → entries for the player's "Videos" panel. */
export function guideFromVideos(videos?: ExtVideo[]): PlayerEpisode[] {
  return (videos || [])
    .filter((v) => (v.episode ?? v.number) !== undefined || v.season !== undefined)
    .map((v) => ({
      season: v.season ?? 1,
      episode: v.episode ?? v.number ?? 0,
      title: v.title || v.name || `Episode ${v.episode ?? v.number ?? ''}`,
      overview: v.overview,
      thumb: v.thumbnail,
      released: v.released ? String(v.released).slice(0, 10) : undefined,
      videoId: v.id,
    }))
    .sort((a, b) => (a.season === 0 ? 1 : b.season === 0 ? -1 : a.season - b.season) || a.episode - b.episode);
}

export function buildExtItem(o: {
  title: string;
  type: string;
  videoId: string;
  season?: number;
  episode?: number;
  epTitle?: string;
  year?: number;
  poster?: string;
  background?: string;
  stream: ResolvedStream;
  guide?: PlayerEpisode[];
  extraSubs?: { url: string; label: string }[];
}): ParsedFtpItem {
  const isEp = o.episode !== undefined;
  const subs = [...(o.stream.subtitles || []), ...(o.extraSubs || [])];
  const seen = new Set<string>();
  return {
    id: `ext:${o.videoId}`,
    rawName: o.title,
    cleanTitle: o.title,
    url: o.stream.url || '',
    isDirectory: false,
    sizeFormatted: '',
    lastModified: '',
    mediaKind: isEp ? 'episode' : 'movie',
    year: o.year,
    season: isEp ? o.season ?? 1 : undefined,
    episode: o.episode,
    posterUrl: o.poster,
    backdropUrl: o.background,
    directStream: true,
    streamReferer: o.stream.referer,
    streamUserAgent: o.stream.userAgent,
    sourceServerName: o.stream.addon,
    extType: o.type,
    extVideoId: o.videoId,
    episodeGuide: o.guide && o.guide.length > 1 ? o.guide : undefined,
    epTitle: o.epTitle,
    streamSubs: subs.filter((s) => s.url && !seen.has(s.url) && (seen.add(s.url), true)).slice(0, 12),
  } as ParsedFtpItem;
}

/** Subtitles offered by subtitle add-ons (e.g. OpenSubtitles) — never blocks playback for long. */
export async function addonSubtitles(type: string, videoId: string): Promise<{ url: string; label: string }[]> {
  try {
    return await Promise.race([
      fetchExtSubtitles(getExtensions(), type, videoId),
      new Promise<{ url: string; label: string }[]>((r) => setTimeout(() => r([]), 6000)),
    ]);
  } catch {
    return [];
  }
}

/** Another episode of the same extension title: finds a stream and returns a playable item. */
export async function resolveEpisodeItem(cur: ParsedFtpItem, ep: PlayerEpisode): Promise<ParsedFtpItem> {
  if (!cur.extType || !ep.videoId) throw new Error('This episode has no stream source');
  const exts = getExtensions();
  const [s, extra] = await Promise.all([pickBestStream(exts, cur.extType, ep.videoId), addonSubtitles(cur.extType, ep.videoId)]);
  if (!s) throw new Error('No playable stream found for this episode. Open it from the title page to see all sources.');
  return buildExtItem({
    title: cur.cleanTitle || cur.rawName,
    type: cur.extType,
    videoId: ep.videoId,
    season: ep.season,
    episode: ep.episode,
    epTitle: ep.title,
    year: cur.year,
    poster: cur.posterUrl,
    background: cur.backdropUrl,
    stream: s,
    guide: cur.episodeGuide,
    extraSubs: extra,
  });
}
