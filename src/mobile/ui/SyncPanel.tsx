import React, { useState } from 'react';
import { Check, Copy, Loader2, RefreshCw } from 'lucide-react';
import { createSync, joinSync, leaveSync, syncCode, syncNow, useSyncStatus } from '../../sync/sync';

const btn = 'rounded-xl px-4 py-2.5 text-[13px] font-extrabold active:scale-95 disabled:opacity-50';

function ago(ts?: number) {
  if (!ts) return 'never';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 20) return 'just now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  const h = Math.round(s / 3600);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

/** Settings block: keep progress, Continue watching and My List in step on phone, tablet and PC. */
export const SyncPanel: React.FC = () => {
  const { status, cfg } = useSyncStatus();
  const [code, setCode] = useState('');
  const [open, setOpen] = useState<'' | 'join' | 'create'>('');
  const [token, setToken] = useState('');
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const [show, setShow] = useState(false);
  const busy = status.state === 'syncing';

  const create = async () => {
    setErr('');
    try {
      await createSync(token);
      setToken('');
      setOpen('');
    } catch (e: any) {
      setErr(e?.message || 'Could not start sync');
    }
  };
  const join = async () => {
    setErr('');
    try {
      await joinSync(code);
      setCode('');
      setOpen('');
    } catch (e: any) {
      setErr(e?.message || 'Could not join');
    }
  };
  const copy = async () => {
    if (!cfg) return;
    try {
      await navigator.clipboard.writeText(syncCode(cfg));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setShow(true);
    }
  };

  if (!cfg) {
    return (
      <div className="px-4 py-4">
        <p className="text-[14px] font-medium text-zinc-100">Watch on any device, continue on another</p>
        <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
          Your progress, Continue Watching and My List stay in step on your phone, tablet and PC. Create a code here, then type the same code on your other devices.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => setOpen(open === 'create' ? '' : 'create')} className={`${btn} bg-amber-400 text-black`}>
            Create sync
          </button>
          <button onClick={() => setOpen(open === 'join' ? '' : 'join')} className={`${btn} bg-white/10 text-white`}>
            I have a code
          </button>
        </div>
        {open === 'create' && (
          <div className="mt-3 rounded-xl bg-white/[0.04] p-3.5">
            <p className="text-[12px] leading-relaxed text-zinc-300">
              Your progress is saved in a <b>private note on your own GitHub account</b> (free, nothing else is stored anywhere).
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[12px] text-zinc-400">
              <li>
                Tap <b>Get a GitHub key</b>, sign in, press <i>Generate token</i> (the <i>gist</i> permission is already ticked).
              </li>
              <li>Copy the key and paste it below.</li>
              <li>You get a sync code — type that code on your other devices.</li>
            </ol>
            <button
              onClick={() => window.open('https://github.com/settings/tokens/new?scopes=gist&description=GooWatch%20sync', '_blank')}
              className={`${btn} mt-2.5 bg-white/10 text-white`}
            >
              Get a GitHub key
            </button>
            <div className="mt-2.5 flex gap-2">
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste the GitHub key"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-xl bg-white/[0.07] px-3.5 py-2.5 text-[13px] text-white outline-none ring-1 ring-white/[0.06] placeholder:text-zinc-500 focus:ring-amber-400/50"
              />
              <button onClick={create} disabled={busy || !token.trim()} className={`${btn} bg-amber-400 text-black`}>
                {busy ? <Loader2 className="inline h-4 w-4 animate-spin" /> : 'Start'}
              </button>
            </div>
          </div>
        )}
        {open === 'join' && (
          <div className="mt-3 flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Paste the sync code"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-xl bg-white/[0.07] px-3.5 py-2.5 text-[13px] text-white outline-none ring-1 ring-white/[0.06] placeholder:text-zinc-500 focus:ring-amber-400/50"
            />
            <button onClick={join} disabled={busy || !code.trim()} className={`${btn} bg-amber-400 text-black`}>
              {busy ? <Loader2 className="inline h-4 w-4 animate-spin" /> : 'Join'}
            </button>
          </div>
        )}
        {err && <p className="mt-2 text-[12px] text-rose-400">{err}</p>}
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${status.state === 'error' ? 'bg-rose-500' : status.state === 'syncing' ? 'animate-pulse bg-amber-400' : 'bg-emerald-400'}`} />
        <p className="text-[14px] font-medium text-zinc-100">
          {status.state === 'error' ? 'Sync problem' : status.state === 'syncing' ? 'Syncing…' : 'Sync is on'}
          <span className="ml-2 text-[12px] font-normal text-zinc-500">last: {ago(status.last || cfg.last)}</span>
        </p>
      </div>
      {status.state === 'error' && <p className="mt-1.5 text-[12px] text-rose-400">{status.error}</p>}

      <p className="mt-3 text-[11.5px] text-zinc-500">Your sync code — type it on your other devices:</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-black/30 px-3 py-2 text-[12px] text-zinc-300">{show ? syncCode(cfg) : cfg.id.slice(0, 6) + '~••••••••••••••••••••'}</code>
        <button onClick={() => setShow((v) => !v)} className="rounded-lg bg-white/10 px-2.5 py-2 text-[11.5px] font-bold text-zinc-200 active:scale-95">
          {show ? 'Hide' : 'Show'}
        </button>
        <button onClick={copy} className="flex items-center gap-1 rounded-lg bg-amber-400 px-3 py-2 text-[12px] font-extrabold text-black active:scale-95">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-zinc-600">Keep the code private: it contains your GitHub key. If it leaks, delete the key in GitHub → Settings → Developer settings.</p>

      {status.devices.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {status.devices.map((d, i) => (
            <span key={i} className="rounded-full bg-white/[0.07] px-2.5 py-1 text-[11px] text-zinc-300">
              {d.name}
              {d.me ? ' (this device)' : ` · ${ago(d.at)}`}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => syncNow()} disabled={busy} className={`${btn} flex items-center gap-1.5 bg-white/10 text-white`}>
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} /> Sync now
        </button>
        <button
          onClick={() => {
            if (window.confirm('Turn off sync on this device? Your data stays here and on the other devices.')) leaveSync();
          }}
          className={`${btn} bg-white/[0.06] text-rose-300`}
        >
          Turn off
        </button>
      </div>
    </div>
  );
};
