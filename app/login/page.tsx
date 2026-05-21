'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import Image from 'next/image';
import GlassCard from '@/components/ui/GlassCard';
import GlassButton from '@/components/ui/GlassButton';
import GlassInput from '@/components/ui/GlassInput';
import { setSession } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Login failed. Please try again.');
        return;
      }

      setSession(data.user);
      router.push('/welcome');
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute top-[-20%] left-[-10%] w-96 h-96 rounded-full bg-[#E8634A]/15 blur-[80px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-80 h-80 rounded-full bg-[#E8634A]/10 blur-[80px] pointer-events-none" />

      <div className="w-full max-w-sm animate-fade-in">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-40 h-28 rounded-[28px] bg-white flex items-center justify-center mb-5 p-4 animate-pulse-glow">
            <Image
              src="/logo.png"
              alt="PH1 World Developers"
              width={160}
              height={80}
              className="object-contain w-full h-full"
              priority
            />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">One Sales App</h1>
          <p className="text-white/50 text-sm mt-1">Sales Management Platform</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl p-6 shadow-[0_8px_40px_rgba(0,0,0,0.2)]">
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-600 pl-1">Email</label>
              <input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                className="w-full px-4 py-3.5 rounded-2xl bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 text-base outline-none transition-all focus:border-[#E8634A] focus:ring-2 focus:ring-[rgba(232,99,74,0.15)]"
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-600 pl-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="w-full px-4 py-3.5 rounded-2xl bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 text-base outline-none transition-all focus:border-[#E8634A] focus:ring-2 focus:ring-[rgba(232,99,74,0.15)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="px-4 py-3 rounded-2xl bg-red-50 border border-red-200 text-red-500 text-sm text-center">
                {error}
              </div>
            )}

            <div className="pt-2">
              <GlassButton
                type="submit"
                variant="primary"
                size="lg"
                disabled={loading}
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </GlassButton>
            </div>
          </form>
        </div>

        <p className="text-center text-white/25 text-xs mt-8">
          PH1 World Developers &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
