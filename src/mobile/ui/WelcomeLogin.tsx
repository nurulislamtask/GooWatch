import React, { useEffect, useState } from 'react';
import { AccountPanel } from './AccountPanel';
import { useAccount } from '../../account/account';

const FLAG = 'gw_welcome_v1';
const seen = () => {
  try {
    return localStorage.getItem(FLAG) === '1';
  } catch {
    return true;
  }
};

/** First launch: a friendly sign-in popup (GitHub / Google) with a clear "continue as guest". Shown once. */
export const WelcomeLogin: React.FC = () => {
  const acc = useAccount();
  const [open, setOpen] = useState(() => !seen());
  const close = () => {
    try {
      localStorage.setItem(FLAG, '1');
    } catch {
      /* ignore */
    }
    setOpen(false);
  };
  useEffect(() => {
    if (acc && open) close();
  }, [acc, open]);
  if (!open || acc) return null;
  return (
    <div className="fixed inset-0 z-[400] flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-[#11141C] shadow-2xl ring-1 ring-white/10">
        <div className="bg-gradient-to-b from-amber-400/20 to-transparent px-5 pb-1 pt-6 text-center">
          <p className="text-[24px] font-black tracking-tight text-white">Welcome to GooWatch</p>
          <p className="mt-1 text-[13px] text-zinc-400">Sign in to keep your progress, Continue Watching and My List on every device.</p>
        </div>
        <AccountPanel />
        <button onClick={close} className="w-full border-t border-white/[0.06] py-3.5 text-[14px] font-bold text-zinc-300 active:bg-white/5">
          Continue as guest
        </button>
      </div>
    </div>
  );
};
