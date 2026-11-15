import { ParsedFtpItem } from './ftpParser';

/** Which film industry / language a title belongs to (from the server it lives on), so Bollywood, Hollywood, Dhallywood… never mix. */
export const INDUSTRY_ORDER = [
  'Hollywood',
  'Bollywood',
  'Hindi Dubbed',
  'Dhallywood (Bangladesh)',
  'Kolkata Bangla',
  'South Indian',
  'Korean',
  'Anime',
  'Animation & Cartoon',
  'World Cinema',
];

export function industryOf(i: Pick<ParsedFtpItem, 'sourceServerName' | 'sourceServerUrl'>): string {
  let url = '';
  try {
    url = decodeURIComponent(i.sourceServerUrl || '').replace(/^https?:\/\/[^/]+/i, '');
  } catch {
    url = i.sourceServerUrl || '';
  }
  const n = `${i.sourceServerName || ''} ${url}`.toLowerCase();
  if (/kolkata/.test(n)) return 'Kolkata Bangla';
  if (/bangla|bengali|natok|dhallywood|bangladesh/.test(n)) return 'Dhallywood (Bangladesh)';
  if (/dubbed|dubed/.test(n)) return 'Hindi Dubbed';
  if (/south/.test(n)) return 'South Indian';
  if (/hindi|bollywood/.test(n)) return 'Bollywood';
  if (/korean|k-?drama/.test(n)) return 'Korean';
  if (/anime/.test(n)) return 'Anime';
  if (/cartoon|animation/.test(n)) return 'Animation & Cartoon';
  if (/foreign|world|other/.test(n)) return 'World Cinema';
  if (/english|hollywood|tv.{0,3}web|series|movies/.test(n)) return 'Hollywood';
  return i.sourceServerName || 'Other';
}
