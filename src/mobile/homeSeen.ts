import { useEffect, useState } from 'react';

// Which extension titles the Top-10 / Top-rated shelves already show, so the shelves below do not repeat them.
let top = new Set<string>();
const subs = new Set<() => void>();

export function publishTop(ids: Set<string>) {
  if (ids.size === top.size && [...ids].every((i) => top.has(i))) return;
  top = ids;
  subs.forEach((f) => f());
}
export function useTopSeen(): Set<string> {
  const [, f] = useState(0);
  useEffect(() => {
    const cb = () => f((n) => n + 1);
    subs.add(cb);
    return () => void subs.delete(cb);
  }, []);
  return top;
}
