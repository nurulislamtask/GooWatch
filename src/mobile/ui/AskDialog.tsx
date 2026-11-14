import React, { useEffect, useState } from 'react';

interface Req {
  title: string;
  text?: string;
  secret?: boolean;
  input: boolean;
  ok: string;
  resolve: (v: string | null) => void;
}
let setter: ((r: Req | null) => void) | null = null;

/** In-app replacement for window.prompt (which Electron does not support). Resolves null when cancelled. */
export function askText(title: string, opts: { text?: string; secret?: boolean; ok?: string } = {}): Promise<string | null> {
  return new Promise((resolve) => {
    if (!setter) return resolve(null);
    setter({ title, text: opts.text, secret: opts.secret, input: true, ok: opts.ok || 'OK', resolve });
  });
}
/** A short message the person must dismiss (replacement for alert). */
export const tellText = (title: string, text?: string): Promise<void> =>
  new Promise((resolve) => {
    if (!setter) return resolve();
    setter({ title, text, input: false, ok: 'OK', resolve: () => resolve() });
  });

export const AskHost: React.FC = () => {
  const [req, setReq] = useState<Req | null>(null);
  const [val, setVal] = useState('');
  useEffect(() => {
    setter = (r) => {
      setVal('');
      setReq(r);
    };
    return () => {
      setter = null;
    };
  }, []);
  if (!req) return null;
  const done = (v: string | null) => {
    const r = req;
    setReq(null);
    r.resolve(v);
  };
  const input = req.input;
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/70 p-5" onClick={() => done(null)}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          done(input ? val : '');
        }}
        className="w-full max-w-sm rounded-2xl bg-[#141821] p-5 ring-1 ring-white/10"
      >
        <p className="text-[16px] font-extrabold text-white">{req.title}</p>
        {req.text && <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">{req.text}</p>}
        {input && (
          <input
            autoFocus
            value={val}
            onChange={(e) => setVal(e.target.value)}
            type={req.secret ? 'password' : 'text'}
            inputMode={req.secret ? 'numeric' : undefined}
            maxLength={req.secret ? 4 : undefined}
            className="mt-3 w-full rounded-xl bg-white/[0.08] px-4 py-3 text-center text-[18px] tracking-[0.4em] text-white outline-none ring-1 ring-white/10 focus:ring-amber-400/60"
          />
        )}
        <div className="mt-4 flex justify-end gap-2">
          {input && (
            <button type="button" onClick={() => done(null)} className="rounded-xl bg-white/10 px-4 py-2.5 text-[13px] font-bold text-zinc-200">
              Cancel
            </button>
          )}
          <button type="submit" className="rounded-xl bg-amber-400 px-5 py-2.5 text-[13px] font-extrabold text-black">
            {req.ok}
          </button>
        </div>
      </form>
    </div>
  );
};
