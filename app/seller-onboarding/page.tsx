'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Check, RotateCcw, Upload, Loader2, Eye, EyeOff } from 'lucide-react';

type Step = 'loading' | 'welcome' | 'set-password' | 'signature' | 'saving' | 'done' | 'error';

export default function SellerOnboardingPage() {
  const router = useRouter();
  const [step,       setStep]       = useState<Step>('loading');
  const [sellerName, setSellerName] = useState('');
  const [sellerId,   setSellerId]   = useState<string | null>(null);
  const [errorMsg,   setErrorMsg]   = useState('');
  const [hasDrawn,   setHasDrawn]   = useState(false);
  const [password,   setPassword]   = useState('');
  const [confirmPw,  setConfirmPw]  = useState('');
  const [showPw,     setShowPw]     = useState(false);
  const [pwError,    setPwError]    = useState('');
  const [pwSaving,   setPwSaving]   = useState(false);

  const [sigMode,    setSigMode]    = useState<'draw' | 'upload'>('draw');
  const [sigPreview, setSigPreview] = useState<string | null>(null);
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const sigDrawing   = useRef(false);
  const sigLastPos   = useRef<{ x: number; y: number } | null>(null);
  const sigFileRef   = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadProfile(userId: string, email: string) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, seller_id')
        .eq('id', userId)
        .maybeSingle();
      setSellerName((profile as any)?.full_name ?? email ?? '');
      setSellerId((profile as any)?.seller_id ?? null);
      setStep('welcome');
    }

    // Check if already signed in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        loadProfile(session.user.id, session.user.email ?? '');
      }
    });

    // Also listen for the invite token being exchanged from the URL hash
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        loadProfile(session.user.id, session.user.email ?? '');
      }
    });

    // If nothing fires after 8 seconds, show error
    const timeout = setTimeout(() => {
      setStep(s => s === 'loading' ? 'error' : s);
      setErrorMsg('Session not found. Please use the link from your invitation email.');
    }, 8000);

    return () => { subscription.unsubscribe(); clearTimeout(timeout); };
  }, []);

  useEffect(() => {
    if (step !== 'signature' || sigMode !== 'draw') return;
    const canvas = sigCanvasRef.current;
    if (!canvas) return;

    function getPos(e: TouchEvent | MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      const scaleX = canvas!.width / rect.width;
      const scaleY = canvas!.height / rect.height;
      if ('touches' in e) return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
      return { x: ((e as MouseEvent).clientX - rect.left) * scaleX, y: ((e as MouseEvent).clientY - rect.top) * scaleY };
    }
    function onStart(e: TouchEvent | MouseEvent) { sigDrawing.current = true; sigLastPos.current = getPos(e); }
    function onMove(e: TouchEvent | MouseEvent) {
      if (!sigDrawing.current) return;
      e.preventDefault();
      const ctx = canvas!.getContext('2d'); if (!ctx) return;
      const pos = getPos(e);
      ctx.beginPath(); ctx.moveTo(sigLastPos.current!.x, sigLastPos.current!.y);
      ctx.lineTo(pos.x, pos.y); ctx.strokeStyle = '#1C1C1E'; ctx.lineWidth = 3;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
      sigLastPos.current = pos;
      setHasDrawn(true);
    }
    function onStop() { sigDrawing.current = false; sigLastPos.current = null; }

    canvas.addEventListener('mousedown', onStart);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseup', onStop);
    canvas.addEventListener('mouseleave', onStop);
    canvas.addEventListener('touchstart', onStart, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onStop);
    return () => {
      canvas.removeEventListener('mousedown', onStart);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseup', onStop);
      canvas.removeEventListener('mouseleave', onStop);
      canvas.removeEventListener('touchstart', onStart);
      canvas.removeEventListener('touchmove', onMove);
      canvas.removeEventListener('touchend', onStop);
    };
  }, [step, sigMode]);

  function handleSigFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setSigPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function clearCanvas() {
    const ctx = sigCanvasRef.current?.getContext('2d');
    if (ctx && sigCanvasRef.current) {
      ctx.clearRect(0, 0, sigCanvasRef.current.width, sigCanvasRef.current.height);
    }
    setHasDrawn(false);
  }

  async function handleSetPassword() {
    setPwError('');
    if (password.length < 8)            { setPwError('Password must be at least 8 characters.'); return; }
    if (password !== confirmPw)         { setPwError('Passwords do not match.'); return; }
    setPwSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setStep('signature');
    } catch (e: any) {
      setPwError(e.message ?? 'Failed to set password.');
    } finally {
      setPwSaving(false);
    }
  }

  async function handleSave() {
    let signature = sigPreview;
    if (sigMode === 'draw') {
      signature = sigCanvasRef.current?.toDataURL('image/png') ?? null;
      if (!hasDrawn) return;
    }
    if (!signature) return;
    setStep('saving');
    try {
      const { error } = await supabase
        .from('Salesperson')
        .update({ signature_base64: signature })
        .eq(sellerId ? '"Seller Id"' : 'Seller Name', sellerId ?? sellerName);
      if (error) throw error;
      setStep('done');
    } catch (e: any) {
      setErrorMsg(e.message ?? 'Failed to save signature.');
      setStep('error');
    }
  }

  const canSave = sigMode === 'draw' ? hasDrawn : !!sigPreview;

  // ── Shared styles ─────────────────────────────────────────────────────────────

  const bg = 'linear-gradient(160deg, #2C2C2E 0%, #1C1C1E 60%, #0A0A0A 100%)';

  const card: React.CSSProperties = {
    background: 'rgba(255,255,255,0.08)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '24px',
  };

  // ── Loading / Saving ──────────────────────────────────────────────────────────

  if (step === 'loading' || step === 'saving') {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: bg }}>
        <Loader2 size={32} className="text-white animate-spin" />
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────────

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

  // ── Done ──────────────────────────────────────────────────────────────────────

  if (step === 'done') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center px-8 gap-5" style={{ background: bg }}>
        <div className="w-24 h-24 rounded-full flex items-center justify-center mb-2"
          style={{ background: 'rgba(52,199,89,0.15)', border: '2px solid rgba(52,199,89,0.3)' }}>
          <Check size={40} className="text-[#34C759]" />
        </div>
        <div className="text-center space-y-2">
          <p className="text-white text-2xl font-bold">You're all set!</p>
          <p className="text-white/50 text-sm">Your signature has been saved.</p>
        </div>
        <button onClick={() => router.replace('/')}
          className="mt-2 px-10 py-3.5 rounded-2xl text-white text-sm font-bold active:opacity-80"
          style={{ background: '#C03D25' }}>
          Open the App
        </button>
      </div>
    );
  }

  // ── Welcome ───────────────────────────────────────────────────────────────────

  if (step === 'welcome') {
    const initials = sellerName.trim().split(' ').filter(Boolean).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center px-6 gap-8" style={{ background: bg }}>
        {/* Avatar */}
        <div className="w-28 h-28 rounded-full flex items-center justify-center shadow-2xl"
          style={{ background: 'linear-gradient(135deg, #E05A3A 0%, #A83020 100%)', border: '3px solid rgba(255,255,255,0.15)' }}>
          <span className="text-[36px] font-bold text-white tracking-tight">{initials || '?'}</span>
        </div>

        {/* Text */}
        <div className="text-center space-y-2 w-full max-w-xs">
          <p className="text-white/50 text-xs font-semibold uppercase tracking-[0.2em]">Welcome</p>
          <p className="text-white text-[26px] font-bold leading-tight">{sellerName}</p>
          <p className="text-white/50 text-sm leading-relaxed pt-1">
            Your account is ready. Before you start, we need your signature — it will be printed on official documents.
          </p>
        </div>

        {/* CTA */}
        <button onClick={() => setStep('set-password')}
          className="w-full max-w-xs py-4 rounded-2xl text-white text-sm font-bold active:scale-[0.98] transition-transform"
          style={{ background: '#C03D25' }}>
          Get Started →
        </button>
      </div>
    );
  }

  // ── Set Password ─────────────────────────────────────────────────────────────

  if (step === 'set-password') {
    return (
      <div className="fixed inset-0 overflow-y-auto" style={{ background: bg }}>
        <div className="min-h-full flex flex-col px-5 pt-14 pb-10 max-w-lg mx-auto gap-5">

          <div>
            <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] mb-1">Step 1 of 2</p>
            <p className="text-white text-2xl font-bold">Set Your Password</p>
            <p className="text-white/50 text-sm mt-1">Choose a password you'll use to log in.</p>
          </div>

          <div className="space-y-3" style={card}>
            <div className="p-4 space-y-3">
              {/* Password */}
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

              {/* Confirm */}
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

              {pwError && (
                <p className="text-red-400 text-xs font-medium">{pwError}</p>
              )}
            </div>
          </div>

          <div className="mt-auto pt-4">
            <button type="button" onClick={handleSetPassword}
              disabled={!password || !confirmPw || pwSaving}
              className="w-full py-4 rounded-2xl text-white text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-30"
              style={{ background: password && confirmPw ? '#C03D25' : 'rgba(255,255,255,0.1)' }}>
              {pwSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {pwSaving ? 'Saving…' : 'Set Password & Continue'}
            </button>
          </div>

        </div>
      </div>
    );
  }

  // ── Signature ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 overflow-y-auto" style={{ background: bg }}>
      <div className="min-h-full flex flex-col px-5 pt-14 pb-10 max-w-lg mx-auto gap-5">

        {/* Header */}
        <div>
          <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] mb-1">Step 2 of 2</p>
          <p className="text-white text-2xl font-bold">Your Signature</p>
          <p className="text-white/50 text-sm mt-1">This will appear on reservation agreements and other documents.</p>
        </div>

        {/* Mode toggle */}
        <div className="flex p-1 rounded-2xl gap-1" style={card}>
          {(['draw', 'upload'] as const).map(m => (
            <button key={m} type="button"
              onClick={() => { setSigMode(m); setSigPreview(null); setHasDrawn(false); }}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all"
              style={sigMode === m
                ? { background: 'rgba(255,255,255,0.15)', color: '#fff' }
                : { color: 'rgba(255,255,255,0.4)' }}>
              {m === 'draw' ? '✏️ Draw' : '📎 Upload Image'}
            </button>
          ))}
        </div>

        {/* Draw mode */}
        {sigMode === 'draw' && (
          <div className="space-y-3">
            <div className="relative rounded-3xl overflow-hidden" style={{ border: '1.5px solid rgba(255,255,255,0.15)' }}>
              <canvas ref={sigCanvasRef} width={600} height={260}
                className="w-full touch-none bg-white block" style={{ height: '200px' }} />
              {!hasDrawn && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <p className="text-[#C7C7CC] text-sm font-medium">Sign here</p>
                </div>
              )}
            </div>
            <button type="button" onClick={clearCanvas}
              disabled={!hasDrawn}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-white/50 active:opacity-70 disabled:opacity-30 transition-opacity">
              <RotateCcw size={12} /> Clear
            </button>
          </div>
        )}

        {/* Upload mode */}
        {sigMode === 'upload' && (
          <div className="space-y-3">
            <button type="button" onClick={() => sigFileRef.current?.click()}
              className="w-full rounded-3xl flex flex-col items-center justify-center py-12 gap-3 active:opacity-70"
              style={{ border: '1.5px dashed rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.04)' }}>
              <Upload size={28} className="text-white/40" />
              <div className="text-center">
                <p className="text-white/70 text-sm font-semibold">Tap to upload</p>
                <p className="text-white/30 text-xs mt-0.5">PNG or JPG</p>
              </div>
            </button>
            <input ref={sigFileRef} type="file" accept="image/*" className="hidden" onChange={handleSigFile} />
            {sigPreview && (
              <div className="rounded-3xl bg-white p-5 flex items-center justify-center min-h-[130px]">
                <img src={sigPreview} alt="Signature preview" className="max-h-[110px] object-contain" />
              </div>
            )}
          </div>
        )}

        {/* Save button */}
        <div className="mt-auto pt-4">
          <button type="button" onClick={handleSave} disabled={!canSave}
            className="w-full py-4 rounded-2xl text-white text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-30"
            style={{ background: canSave ? '#C03D25' : 'rgba(255,255,255,0.1)' }}>
            <Check size={16} />
            Save Signature
          </button>
          {!canSave && (
            <p className="text-center text-white/30 text-xs mt-3">
              {sigMode === 'draw' ? 'Draw your signature above first' : 'Upload an image first'}
            </p>
          )}
        </div>

      </div>
    </div>
  );
}
