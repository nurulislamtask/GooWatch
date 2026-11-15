import React from 'react';
import { Rating } from '../../services/ratings';

/** The IMDb logo (yellow plate) and a Rotten Tomatoes tomato, each followed by the score. Renders nothing without a score. */
export const RatingBadge: React.FC<{ r?: Rating; big?: boolean; className?: string }> = ({ r, big, className = '' }) => {
  if (!r) return null;
  if (!r.imdb && !r.rt) {
    // looked up, but nobody has a score yet (new release): show a quiet placeholder so every card looks the same
    return (
      <span className={`inline-flex items-center gap-1 opacity-50 ${className}`} title="No rating yet">
        <span className={`rounded-[4px] bg-[#F5C518] px-1 font-black leading-[1.35] tracking-tight text-black ${big ? 'text-[12px]' : 'text-[9px]'}`}>IMDb</span>
        <span className={`font-bold text-zinc-300 ${big ? 'text-[14px]' : 'text-[11px]'}`}>–</span>
      </span>
    );
  }
  const txt = big ? 'text-[14px]' : 'text-[11px]';
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {r.imdb && (
        <span title="IMDb rating" className="inline-flex items-center gap-1">
          <span className={`rounded-[4px] bg-[#F5C518] px-1 font-black leading-[1.35] tracking-tight text-black ${big ? 'text-[12px]' : 'text-[9px]'}`}>IMDb</span>
          <span className={`font-bold text-zinc-100 ${txt}`}>{r.imdb}</span>
        </span>
      )}
      {r.rt && (
        <span title="Rotten Tomatoes" className="inline-flex items-center gap-1">
          <span aria-hidden className={big ? 'text-[16px]' : 'text-[12px]'}>🍅</span>
          <span className={`font-bold text-zinc-100 ${txt}`}>{r.rt}</span>
        </span>
      )}
    </span>
  );
};
