// Stremio-compatible add-on protocol (the same extension format Stremio / many community add-ons use).
export interface ExtResourceObj {
  name: string;
  types?: string[];
  idPrefixes?: string[];
}
export interface ExtCatalog {
  type: string;
  id: string;
  name?: string;
  extra?: { name: string; isRequired?: boolean; options?: string[] }[];
  extraRequired?: string[];
  extraSupported?: string[];
}
export interface ExtManifest {
  id: string;
  name: string;
  version?: string;
  description?: string;
  logo?: string;
  background?: string;
  types?: string[];
  idPrefixes?: string[];
  resources?: (string | ExtResourceObj)[];
  catalogs?: ExtCatalog[];
}
export interface InstalledExt {
  kind?: 'stremio' | 'nuvio';
  base: string; // address without /manifest.json (nuvio: raw folder ending with /)
  manifest: ExtManifest;
  scrapers?: import('./nuvio').NuvioScraper[];
  enabled: boolean;
  builtin?: boolean;
}
export interface ExtVideo {
  id: string;
  title?: string;
  name?: string;
  season?: number;
  episode?: number;
  number?: number;
  released?: string;
  thumbnail?: string;
  overview?: string;
}
export interface ExtMeta {
  id: string;
  type: string;
  name: string;
  poster?: string;
  background?: string;
  logo?: string;
  description?: string;
  releaseInfo?: string;
  year?: string | number;
  imdbRating?: string | number;
  runtime?: string;
  genres?: string[];
  cast?: string[];
  director?: string[];
  videos?: ExtVideo[];
}
export interface ExtPreview {
  id: string;
  type: string;
  name: string;
  poster?: string;
  background?: string;
  year?: string | number;
  addonBase: string;
}
export interface ExtStream {
  url?: string;
  externalUrl?: string;
  infoHash?: string;
  ytId?: string;
  name?: string;
  title?: string;
  description?: string;
  subtitles?: { url: string; lang?: string; id?: string }[];
  behaviorHints?: {
    notWebReady?: boolean;
    proxyHeaders?: { request?: Record<string, string> };
    headers?: Record<string, string>;
    filename?: string;
  };
}
export interface ResolvedStream {
  key: string;
  addon: string;
  label: string;
  detail: string;
  playable: boolean;
  reason?: string;
  url?: string;
  external?: string;
  referer?: string;
  userAgent?: string;
  subtitles: { url: string; label: string }[];
  score: number;
}
