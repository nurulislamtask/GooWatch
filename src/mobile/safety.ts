// Family mode and Kids mode: hides adult / scary titles. Titles are judged by their genres when known and by their name.
import { ParsedFtpItem } from '../utils/ftpParser';
import { peekItemMetadata } from '../services/ftpClient';
import { ExtPreview, InstalledExt } from '../extensions/types';
import { readPrefs, usePrefs, writePrefs } from './prefs';

export type ContentMode = 'all' | 'family' | 'kids';

const ADULT = /\b(18\s?\+|xxx|erotic|erotica|adult|uncensored|nude|porn|hentai|ullu|kamasutra|sexy|sex (tape|scene|education)|escort|stripper|bdsm)\b/i;
const SCARY = /\b(horror|slasher|conjuring|annabelle|insidious|exorcis|purge|saw (i|ii|iii|iv|v|vi|x)\b|texas chainsaw|halloween kills|scream (vi|[2-6])|hostel|final destination)\b/i;
const KIDS_NAME =
  /\b(cartoons?|kids?|children|disney|pixar|dreamworks|peppa|paw patrol|doraemon|tom (and|&) jerry|mickey|barbie|lego|minions|frozen|toy story|shrek|moana|encanto|cocomelon|bluey|sesame|sponge ?bob|ben ?10|ninja hattori|shin-?chan|chhota bheem|mr\.? bean|masha|kung fu panda|madagascar|ice age|despicable me|trolls|zootopia|finding nemo|finding dory|inside out|winnie|pokemon|pok[eé]mon|ducktales|looney|scooby|smurfs|garfield|peter rabbit|paddington|hotel transylvania|puss in boots|bolt|ratatouille|wall-e|lilo|stitch|aladdin|lion king|jungle book|dumbo|bambi|cinderella|tangled|brave|luca|turning red|sing\b)\b/i;

export const KIDS_GENRES = ['Animation', 'Family', 'Kids', 'Children'];
const SCARY_GENRES = ['horror', 'thriller', 'crime', 'war', 'mystery'];

export function useContentMode(): ContentMode {
  const [p] = usePrefs();
  return p.contentMode;
}
export const currentMode = (): ContentMode => readPrefs().contentMode;

/** Library title (from your servers). */
export function allowLibraryItem(item: ParsedFtpItem, mode: ContentMode = currentMode()): boolean {
  if (mode === 'all') return true;
  const text = `${item.rawName} ${item.cleanTitle} ${item.sourceServerName || ''}`;
  if (ADULT.test(text) || /(^|[\s._-])18\+/.test(text)) return false;
  const meta = peekItemMetadata(item);
  const genres = (item.genres && item.genres.length ? item.genres : meta?.genres || []).map((g) => g.toLowerCase());
  if (SCARY.test(text) || genres.includes('horror')) return false;
  if (mode === 'family') return true;
  // kids
  if (genres.some((g) => SCARY_GENRES.includes(g))) return false;
  if (genres.some((g) => KIDS_GENRES.map((k) => k.toLowerCase()).includes(g))) return true;
  if (KIDS_NAME.test(text) || /kid|cartoon|animat|children/i.test(item.sourceServerName || '')) return true;
  return false;
}

/** Add-on title. `trustedGenre`: the list was already requested with a kid-safe genre. */
export function allowExtItem(p: ExtPreview, mode: ContentMode = currentMode(), trustedGenre = false): boolean {
  if (mode === 'all') return true;
  if (ADULT.test(p.name) || SCARY.test(p.name)) return false;
  const genres = (p.genres || []).map((g) => g.toLowerCase());
  if (genres.includes('horror') || genres.includes('adult')) return false;
  if (mode === 'family') return true;
  if (genres.some((g) => SCARY_GENRES.includes(g))) return false;
  if (genres.some((g) => KIDS_GENRES.map((k) => k.toLowerCase()).includes(g))) return true;
  if (trustedGenre) return true;
  return KIDS_NAME.test(p.name);
}

export const allowExt = (e: InstalledExt, mode: ContentMode = currentMode()) => mode === 'all' || !e.manifest.behaviorHints?.adult;

/** Switching away from Kids / Family asks for the PIN when one is set. Returns false when the change is refused. */
export function changeMode(next: ContentMode): boolean {
  const p = readPrefs();
  if (next === p.contentMode) return true;
  const locked = p.contentMode !== 'all' && next !== p.contentMode && (next === 'all' || (p.contentMode === 'kids' && next === 'family'));
  if (locked && p.kidsPin) {
    const v = window.prompt('Enter the PIN to leave this mode');
    if (v === null) return false;
    if (v.trim() !== p.kidsPin) {
      window.alert('Wrong PIN');
      return false;
    }
  }
  if (next === 'kids' && !p.kidsPin && p.contentMode !== 'kids') {
    const v = window.prompt('Kids mode: set a 4-digit PIN so only you can leave it (leave empty for no PIN)');
    if (v === null) return false;
    const pin = v.trim();
    if (pin && !/^\d{4}$/.test(pin)) {
      window.alert('The PIN must be 4 digits');
      return false;
    }
    writePrefs({ kidsPin: pin });
  }
  if (next === 'all') writePrefs({ contentMode: next });
  else writePrefs({ contentMode: next });
  return true;
}

/** The categories (genres) shown for a mode. */
export function genresFor(mode: ContentMode, all: string[]): string[] {
  if (mode === 'all') return all;
  const lower = (s: string) => s.toLowerCase();
  if (mode === 'kids') return all.filter((g) => ['animation', 'family', 'adventure', 'comedy', 'fantasy', 'kids', 'children'].includes(lower(g)));
  return all.filter((g) => !['horror', 'crime', 'war', 'adult', 'erotic'].includes(lower(g)));
}
