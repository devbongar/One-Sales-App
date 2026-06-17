'use client';

import { useState } from 'react';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { Mail, Send, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

export default function TestEmailPage() {
  const [to,      setTo]      = useState('');
  const [subject, setSubject] = useState('Test Email from One Sales App');
  const [body,    setBody]    = useState('This is a test email sent from the One Sales App. If you received this, the email integration is working correctly.');
  const [sending, setSending] = useState(false);
  const [result,  setResult]  = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSend() {
    if (!to || !subject || !body) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, body }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ ok: true, message: `Email sent successfully to ${to}` });
      } else {
        setResult({ ok: false, message: data.error ?? 'Unknown error' });
      }
    } catch (e: any) {
      setResult({ ok: false, message: e.message ?? 'Network error' });
    } finally {
      setSending(false);
    }
  }

  return (
    <PageShell title="Email Test" backButton>
      <GlassCard strong className="p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-[rgba(192,61,37,0.12)] flex items-center justify-center shrink-0">
          <Mail size={22} className="text-[#C03D25]" />
        </div>
        <div>
          <p className="text-[#1C1C1E] font-semibold">Outlook SMTP Test</p>
          <p className="text-[#6C6C70] text-sm mt-0.5">Send a test email to verify the integration</p>
        </div>
      </GlassCard>

      <GlassCard className="px-4 py-1">

        {/* To */}
        <div className="border-b border-black/[0.06] py-3 px-1 space-y-1.5">
          <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Recipient Email</p>
          <input
            type="email"
            value={to}
            onChange={e => setTo(e.target.value)}
            placeholder="recipient@example.com"
            className="w-full px-3 py-2.5 rounded-xl border border-black/[0.08] bg-[#F9F9F9] text-sm text-[#1C1C1E] outline-none focus:border-[#C03D25]/40"
          />
        </div>

        {/* Subject */}
        <div className="border-b border-black/[0.06] py-3 px-1 space-y-1.5">
          <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Subject</p>
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-black/[0.08] bg-[#F9F9F9] text-sm text-[#1C1C1E] outline-none focus:border-[#C03D25]/40"
          />
        </div>

        {/* Body */}
        <div className="py-3 px-1 space-y-1.5">
          <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Message</p>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={5}
            className="w-full px-3 py-2.5 rounded-xl border border-black/[0.08] bg-[#F9F9F9] text-sm text-[#1C1C1E] outline-none focus:border-[#C03D25]/40 resize-none"
          />
        </div>

      </GlassCard>

      {/* Result */}
      {result && (
        <GlassCard className={`p-4 flex items-start gap-3 ${result.ok ? 'bg-green-50' : 'bg-red-50'}`}>
          {result.ok
            ? <CheckCircle2 size={18} className="text-green-600 shrink-0 mt-0.5" />
            : <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
          }
          <p className={`text-sm font-medium ${result.ok ? 'text-green-700' : 'text-red-600'}`}>
            {result.message}
          </p>
        </GlassCard>
      )}

      {/* Send button */}
      <button
        type="button"
        disabled={sending || !to || !subject || !body}
        onClick={handleSend}
        className={`w-full py-4 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
          sending || !to || !subject || !body
            ? 'bg-[#E5E5EA] text-[#C7C7CC] cursor-not-allowed'
            : 'bg-[#C03D25] text-white active:opacity-80'
        }`}
      >
        {sending
          ? <><Loader2 size={16} className="animate-spin" /> Sending…</>
          : <><Send size={16} /> Send Test Email</>
        }
      </button>
    </PageShell>
  );
}
