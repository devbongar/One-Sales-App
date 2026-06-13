'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { getSession } from '@/lib/auth';

const DELAY = 3000;

export default function WelcomePage() {
  const router = useRouter();
  const [userName, setUserName] = useState('');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    getSession().then(session => {
      if (!session) { router.replace('/login'); return; }
      setUserName(session.display_name || session.full_name?.split(' ')[0] || 'there');
    });

    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      setProgress(Math.min((elapsed / DELAY) * 100, 100));
      if (elapsed >= DELAY) {
        clearInterval(interval);
        router.push('/home');
      }
    }, 30);

    return () => clearInterval(interval);
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute top-[-15%] right-[-15%] w-[28rem] h-[28rem] rounded-full bg-[#C03D25]/20 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-15%] left-[-15%] w-96 h-96 rounded-full bg-[#C03D25]/12 blur-[100px] pointer-events-none" />

      <div className="flex flex-col items-center text-center animate-fade-in">
        {/* Logo */}
        <div className="w-44 h-32 rounded-[32px] bg-white flex items-center justify-center mb-8 p-5 animate-pulse-glow">
          <Image
            src="/logo.png"
            alt="PH1 World Developers"
            width={160}
            height={80}
            className="object-contain w-full h-full"
            priority
          />
        </div>

        {/* Text */}
        <p className="text-white/50 text-sm font-medium uppercase tracking-[0.2em] mb-3">Welcome back</p>
        <h1 className="text-4xl font-bold text-white tracking-tight mb-2">
          Hello, {userName}
        </h1>
        <p className="text-white/40 text-base mb-12">Ready to close some deals today?</p>

        {/* Progress bar */}
        <div className="w-48 h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#C03D25] to-[#F07A62]"
            style={{ width: `${progress}%`, transition: 'width 30ms linear' }}
          />
        </div>
        <p className="text-white/25 text-xs mt-3">Loading your workspace…</p>
      </div>
    </div>
  );
}
