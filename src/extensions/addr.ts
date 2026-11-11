/** Query part of an add-on address (some add-ons keep the user's configuration there). */
export function addrQuery(input: string): string {
  const u = input.trim().replace(/^stremio:\/\//i, 'https://');
  const i = u.indexOf('?');
  return i >= 0 ? u.slice(i + 1) : '';
}
export const withQuery = (url: string, q?: string) => (q ? `${url}${url.includes('?') ? '&' : '?'}${q}` : url);
/** URL of one add-on resource, keeping its configuration. */
export const extUrl = (ext: { base: string; query?: string }, path: string) => withQuery(`${ext.base}${path}`, ext.query);
