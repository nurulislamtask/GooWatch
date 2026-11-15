import React, { useRef, useState } from 'react';
import { Check, Copy, Loader2, User } from 'lucide-react';
import { Account, DeviceCode, autoSync, finishLogin, providerReady, signOut, startLogin, useAccount, Provider } from '../../account/account';

const btn = 'flex w-full items-center justify-center gap-2.5 rounded-xl px-4 py-3 text-[14px] font-extrabold active:scale-[0.98] disabled:opacity-50';

const GitHubMark = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
    <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
  </svg>
);
const GoogleMark = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
    <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1a6.2 6.2 0 0 1 0-12.4c1.96 0 3.27.83 4.02 1.55l2.74-2.64C17.0 3.2 14.7 2.2 12 2.2a9.8 9.8 0 1 0 0 19.6c5.66 0 9.4-3.97 9.4-9.57 0-.64-.07-1.13-.16-1.62H12Z" />
  </svg>
);

/** Settings: sign in with GitHub or Google (progress then follows the account), or stay a guest. */
export const AccountPanel: React.FC = () => {
  const acc = useAccount();
  const [code, setCode] = useState<DeviceCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);
  const cancel = useRef(false);

  const begin = async (p: Provider) => {
    setErr('');
    setNote('');
    setBusy(true);
    cancel.current = false;
    try {
      const d = await startLogin(p);
      setCode(d);
      try {
        window.open(d.url, '_blank');
      } catch {
        /* the button below does the same */
      }
      const a = await finishLogin(d, () => cancel.current);
      setCode(null);
      if (a.provider === 'github') {
        const r = await autoSync(a).catch((e) => {
          setErr(`Signed in, but sync did not start: ${e?.message || e}`);
          return 'none' as const;
        });
        if (r === 'joined') setNote('Signed in. Your progress and My List from your other devices are now here.');
        else if (r === 'created') setNote('Signed in. Sync is on — sign in with the same account on your other devices.');
      } else setNote('Signed in with Google. (Progress sync uses GitHub sign-in.)');
    } catch (e: any) {
      if (String(e?.message) !== 'cancelled') setErr(e?.message || 'Sign-in failed');
      setCode(null);
    } finally {
      setBusy(false);
    }
  };

  if (acc) {
    return (
      <div className="px-4 py-4">
        <div className="flex items-center gap-3">
          {acc.avatar ? <img src={acc.avatar} alt="" className="h-12 w-12 rounded-full object-cover" /> : <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10"><User className="h-5 w-5 text-zinc-300" /></span>}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold text-white">{acc.name}</p>
            <p className="truncate text-[12px] text-zinc-500">
              {acc.provider === 'github' ? 'GitHub' : 'Google'}
              {acc.login ? ` · ${acc.login}` : ''}
            </p>
          </div>
          <button
            onClick={() => {
              if (window.confirm('Sign out? You stay as a guest on this device; your data stays here.')) signOut();
            }}
            className="rounded-xl bg-white/10 px-3.5 py-2 text-[12.5px] font-bold text-zinc-200 active:scale-95"
          >
            Sign out
          </button>
        </div>
        {note && <p className="mt-2.5 text-[12px] text-emerald-400">{note}</p>}
        {err && <p className="mt-2.5 text-[12px] text-rose-400">{err}</p>}
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      <p className="text-[14px] font-medium text-zinc-100">You are watching as a guest</p>
      <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">Everything works without an account. Sign in to keep your progress and My List on all your devices.</p>

      {code ? (
        <div className="mt-3 rounded-xl bg-white/[0.05] p-4 text-center">
          <p className="text-[12px] text-zinc-400">
            A page opened on {code.provider === 'github' ? 'GitHub' : 'Google'}. Type this code there:
          </p>
          <p className="mt-2 select-all text-[28px] font-black tracking-[0.25em] text-amber-300">{code.userCode}</p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(code.userCode);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch {
                  /* ignore */
                }
              }}
              className={`${btn} bg-white/10 text-white`}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? 'Copied' : 'Copy code'}
            </button>
            <button onClick={() => window.open(code.url, '_blank')} className={`${btn} bg-amber-400 text-black`}>
              Open page
            </button>
          </div>
          <p className="mt-3 flex items-center justify-center gap-2 text-[12px] text-zinc-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for you to approve…
          </p>
          <button
            onClick={() => {
              cancel.current = true;
              setCode(null);
              setBusy(false);
            }}
            className="mt-2 text-[12px] font-semibold text-zinc-400 underline"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <button disabled={busy} onClick={() => begin('github')} className={`${btn} bg-white text-black`}>
            <GitHubMark /> Continue with GitHub
          </button>
          <button disabled={busy} onClick={() => begin('google')} className={`${btn} bg-white/10 text-white ring-1 ring-white/10`}>
            <GoogleMark /> Continue with Google
          </button>
          <p className="pt-1 text-center text-[12px] text-zinc-500">or just keep watching as a guest</p>
          {(!providerReady('github') || !providerReady('google')) && (
            <p className="text-center text-[11px] leading-snug text-zinc-600">
              {!providerReady('github') && !providerReady('google') ? 'Sign-in is being set up for this version.' : !providerReady('github') ? 'GitHub sign-in is being set up for this version.' : 'Google sign-in is being set up for this version.'}
            </p>
          )}
        </div>
      )}
      {err && <p className="mt-2.5 text-[12px] text-rose-400">{err}</p>}
    </div>
  );
};
