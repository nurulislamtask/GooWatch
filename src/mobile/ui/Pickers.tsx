import React, { useEffect } from 'react';
import { Check, X } from 'lucide-react';
import { registerBack } from '../backStack';

export interface PickOption {
  key: string;
  label: string;
  hint?: string;
}

/** A button that shows the current choice ("Categories ▾"). */
export const PickerButton: React.FC<{ label: string; value?: string; active?: boolean; onClick: () => void }> = ({ label, value, active, onClick }) => (
  <button
    onClick={onClick}
    className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold ring-1 ${
      active ? 'bg-amber-400 text-black ring-amber-300' : 'bg-white/10 text-zinc-100 ring-white/10'
    }`}
  >
    {value ? `${label}: ${value}` : label}
    <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden className="opacity-80">
      <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </button>
);

/** Full-screen list to pick from (like Netflix's Categories): big readable rows, the chosen one is highlighted. */
export const PickerSheet: React.FC<{
  title: string;
  options: PickOption[];
  value: string;
  onPick: (key: string) => void;
  onClose: () => void;
}> = ({ title, options, value, onPick, onClose }) => {
  useEffect(() => registerBack(() => (onClose(), true)), []);
  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/70 backdrop-blur-sm md:items-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[82vh] w-full max-w-md flex-col rounded-t-3xl bg-[#14161E] shadow-2xl ring-1 ring-white/10 md:rounded-3xl"
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-[16px] font-extrabold text-white">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full bg-white/10 p-2 active:scale-90">
            <X className="h-4 w-4 text-white" />
          </button>
        </div>
        <div className="overflow-y-auto px-2 pb-5" style={{ WebkitOverflowScrolling: 'touch' }}>
          {options.map((o) => {
            const on = o.key === value;
            return (
              <button
                key={o.key}
                onClick={() => {
                  onPick(o.key);
                  onClose();
                }}
                className={`flex w-full items-center justify-between rounded-xl px-4 py-3.5 text-left active:bg-white/10 ${on ? 'bg-amber-400/10' : ''}`}
              >
                <span className="min-w-0">
                  <span className={`block truncate text-[16px] ${on ? 'font-extrabold text-amber-300' : 'font-medium text-zinc-100'}`}>{o.label}</span>
                  {o.hint && <span className="block truncate text-[11.5px] text-zinc-500">{o.hint}</span>}
                </span>
                {on && <Check className="h-5 w-5 shrink-0 text-amber-300" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
