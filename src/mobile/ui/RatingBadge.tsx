import React from 'react';
import { Rating } from '../../services/ratings';

/** Small score pills: ★ IMDb and 🍅 Rotten Tomatoes. Renders nothing when there is no score. */
export const RatingBadge: React.FC<{ r?: Rating; big?: boolean; className?: string }> = ({ r, big, className = '' }) => {
  if (!r || (!r.imdb && !r.rt)) return null;
  const size = big ? 'px-2.5 py-1 text-[13px]' : 'px-1.5 py-0.5 text-[10px]';
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {r.imdb && (
        <span title="IMDb rating" className={`inline-flex items-center gap-1 rounded-md bg-black/75 font-extrabold text-amber-300 backdrop-blur ${size}`}>
          <span aria-hidden>★</span>
          {r.imdb}
          {big && <span className="text-[10px] font-semibold text-zinc-400">IMDb</span>}
        </span>
      )}
      {r.rt && (
        <span title="Rotten Tomatoes" className={`inline-flex items-center gap-1 rounded-md bg-black/75 font-extrabold text-rose-300 backdrop-blur ${size}`}>
          <span aria-hidden>🍅</span>
          {r.rt}
        </span>
      )}
    </span>
  );
};
