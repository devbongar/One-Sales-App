'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Check, Eye, EyeOff, Loader2 } from 'lucide-react';

type Step = 'loading' | 'set-password' | 'done' | 'error';

const bg = 'linear-gradient(160deg, #2C2C2E 0%, #1C1C1E 60%, #0A0A0A 100%)';

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '24px',
};

export default function SetPasswordPage() {
  const router = useRouter();
  const [step,      setStep]      = useState<Step>('loading');
  const [password,  setPassword]  = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw,    setShowPw]    = useState(false);
  const [pwError,   setPwError]   = useState('');
  const [saving,    setSaving]    = useState(false);
  const [errorMsg,  setErrorMsg]  = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setStep('set-password');
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'PASSWORD_RECOVERY') && session) {
        setStep('set-password');
      }
    });

    const timeout = setTimeout(() => {
      setStep(s => s === 'loading' ? 'error' : s);
      setErrorMsg('Session not found. Please use the link from your invitation email.');
    }, 8000);

    return () => { subscription.unsubscribe(); clearTimeout(timeout); };
  }, []);

  async function handleSetPassword() {
    setPwError('');
    if (password.length < 8)    { setPwError('Password must be at least 8 characters.'); return; }
    if (password !== confirmPw)  { setPwError('Passwords do not match.'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setStep('done');
      setTimeout(() => router.replace('/welcome'), 2000);
    } catch (e: any) {
      setPwError(e.message ?? 'Failed to set password.');
    } finally {
      setSaving(false);
    }
  }

  if (step === 'loading') {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: bg }}>
        <Loader2 size={32} className="text-white animate-spin" />
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center px-8 gap-4" style={{ background: bg }}>
        <p className="text-white text-base font-semibold text-center">{errorMsg}</p>
        <button onClick={() => router.replace('/')}
          className="px-6 py-3 rounded-2xl text-white text-sm font-semibold active:opacity-70"
          style={card}>
          Go to App
        </button>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center px-8 gap-5" style={{ background: bg }}>
        <div className="w-24 h-24 rounded-full flex items-center justify-center mb-2"
          style={{ background: 'rgba(52,199,89,0.15)', border: '2px solid rgba(52,199,89,0.3)' }}>
          <Check size={40} className="text-[#34C759]" />
        </div>
        <div className="text-center space-y-2">
          <p className="text-white text-2xl font-bold">You're all set!</p>
          <p className="text-white/50 text-sm">Taking you to the app…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-y-auto" style={{ background: bg }}>
      <div className="min-h-full flex flex-col px-5 pt-14 pb-10 max-w-lg mx-auto gap-5">

        <div>
          <p className="text-white text-2xl font-bold">Set Your Password</p>
          <p className="text-white/50 text-sm mt-1">Choose a password you'll use to log in.</p>
        </div>

        <div className="space-y-3" style={card}>
          <div className="p-4 space-y-3">

            <div className="space-y-1.5">
              <p className="text-white/50 text-xs font-semibold uppercase tracking-wider">Password</p>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full px-4 py-3 rounded-2xl text-sm text-[#1C1C1E] outline-none bg-white/90 placeholder:text-[#C7C7CC] pr-12"
                />
                <button type="button" onClick={() => setShowPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8E8E93] active:opacity-60">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-white/50 text-xs font-semibold uppercase tracking-wider">Confirm Password</p>
              <input
                type={showPw ? 'text' : 'password'}
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                placeholder="Repeat your password"
                className="w-full px-4 py-3 rounded-2xl text-sm text-[#1C1C1E] outline-none bg-white/90 placeholder:text-[#C7C7CC]"
              />
            </div>

            {pwError && <p className="text-red-400 text-xs font-medium">{pwError}</p>}
          </div>
        </div>

        <div className="mt-auto pt-4">
          <button type="button" onClick={handleSetPassword}
            disabled={!password || !confirmPw || saving}
            className="w-full py-4 rounded-2xl text-white text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-30"
            style={{ background: password && confirmPw ? '#C03D25' : 'rgba(255,255,255,0.1)' }}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {saving ? 'Saving…' : 'Set Password'}
          </button>
        </div>

      </div>
    </div>
  );
}
