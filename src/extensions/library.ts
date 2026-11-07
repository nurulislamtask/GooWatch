import { useEffect, useState } from 'react';
import { ExtPreview } from './types';

const KEY = 'goowatch_ext_list_v1';
const subs = new Set<() => void>();
function read(): ExtPreview[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}
export function isExtSaved(id: string) {
  return read().some((p) => p.id === id);
}
export function toggleExtSaved(p: ExtPreview) {
  const list = read();
  const i = list.findIndex((x) => x.id === p.id);
  if (i >= 0) list.splice(i, 1);
  else list.unshift(p);
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 500)));
  } catch {
    /* ignore */
  }
  subs.forEach((f) => f());
}
export function useExtSaved(): ExtPreview[] {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  }, []);
  return read();
}
