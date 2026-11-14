import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { registerBack } from '../backStack';

export interface FilterState {
  minRating: number; // 0 = any
  decade: string; // '' = any, '2020', '2010', ..., 'old'
}
export const NO_FILTER: FilterState = { minRating: 0, decade: '' };
export const filterActive = (f: FilterState) => f.minRating > 0 || !!f.decade;
export const filterLabel = (f: FilterState) =>
  [f.minRating ? `${f.minRating}+` : '', f.decade ? (f.decade === 'old' ? 'Before 1980' : `${f.decade}s`) : ''].filter(Boolean).join(' · ');

export function passFilter(f: FilterState, rating: number, year: number): boolean {
  if (f.minRating && !(rating >= f.minRating)) return false;
  if (f.decade) {
    if (!year) return false;
    if (f.decade === 'old') return year < 1980;
    const d = parseInt(f.decade, 10);
    return year >= d && year < d + 10;
  }
  return true;
}

const RATINGS = [0, 6, 7, 8];
const DECADES = ['', '2020', '2010', '2000', '1990', '1980', 'old'];

export const FilterSheet: React.FC<{ value: FilterState; onChange: (f: FilterState) => void; onClose: () => void }> = ({ value, onChange, onClose }) => {
  useEffect(() => registerBack(() => (onClose(), true)), []);
  const chip = (on: boolean) => `rounded-full px-4 py-2 text-[13.5px] font-semibold ${on ? 'bg-amber-400 text-black' : 'bg-white/10 text-zinc-100'}`;
  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/70 backdrop-blur-sm md:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-t-3xl bg-[#14161E] p-5 ring-1 ring-white/10 md:rounded-3xl">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-extrabold text-white">Filter</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full bg-white/10 p-2">
            <X className="h-4 w-4 text-white" />
          </button>
        </div>
        <p className="mt-4 text-[12px] font-bold uppercase tracking-wide text-zinc-500">IMDb rating</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {RATINGS.map((r) => (
            <button key={r} className={chip(value.minRating === r)} onClick={() => onChange({ ...value, minRating: r })}>
              {r ? `${r}+` : 'Any'}
            </button>
          ))}
        </div>
        <p className="mt-4 text-[12px] font-bold uppercase tracking-wide text-zinc-500">Year</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {DECADES.map((d) => (
            <button key={d} className={chip(value.decade === d)} onClick={() => onChange({ ...value, decade: d })}>
              {d === '' ? 'Any' : d === 'old' ? 'Before 1980' : `${d}s`}
            </button>
          ))}
        </div>
        <div className="mt-5 flex gap-2">
          <button onClick={() => onChange(NO_FILTER)} className="flex-1 rounded-xl bg-white/10 py-3 text-[14px] font-bold text-zinc-200">
            Clear
          </button>
          <button onClick={onClose} className="flex-1 rounded-xl bg-amber-400 py-3 text-[14px] font-extrabold text-black">
            Show
          </button>
        </div>
      </div>
    </div>
  );
};
