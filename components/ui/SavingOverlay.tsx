'use client';

import Image from 'next/image';

export default function SavingOverlay({ visible, label, progress }: {
  visible: boolean;
  label?: string;
  progress?: number; // 0-1: if provided shows a real progress bar instead of the animated loop
}) {
  if (!visible) return null;

  return (
    <>
      <style>{`
        @keyframes osa-stream {
          0%   { transform: translateY(0) scale(1);    opacity: 0; }
          6%   { opacity: 0.8; }
          85%  { opacity: 0.4; }
          100% { transform: translateY(-105vh) scale(0.2); opacity: 0; }
        }
        @keyframes osa-fadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes osa-glowPulse {
          0%, 100% { transform: scale(1);   opacity: 0.7; }
          50%       { transform: scale(1.08); opacity: 1; }
        }
        @keyframes osa-ringFill {
          0%   { stroke-dashoffset: 377; opacity: 1; }
          75%  { stroke-dashoffset: 55; }
          88%  { stroke-dashoffset: 0; opacity: 1; }
          96%  { stroke-dashoffset: 0; opacity: 0; }
          100% { stroke-dashoffset: 377; opacity: 0; }
        }
        @keyframes osa-arrowBounce {
          0%, 100% { transform: translateX(-50%) translateY(0);   opacity: 1; }
          50%       { transform: translateX(-50%) translateY(-5px); opacity: 0.7; }
        }
        @keyframes osa-ellFade {
          0%, 60%, 100% { opacity: 0; }
          30%            { opacity: 1; }
        }
        @keyframes osa-barFill {
          0%   { width: 0%;    opacity: 1; }
          75%  { width: 88%; }
          88%  { width: 100%;  opacity: 1; }
          96%  {               opacity: 0; }
          100% { width: 100%;  opacity: 0; }
        }
        @keyframes osa-dotPulse {
          0%, 100% { transform: scale(1);    opacity: 0.35; }
          50%       { transform: scale(1.45); opacity: 1; }
        }

        .osa-particle {
          position: absolute;
          border-radius: 2px;
          background: rgba(192,61,37,0.35);
          bottom: -10px;
          animation: osa-stream var(--osa-d) ease-in infinite var(--osa-delay);
          left: var(--osa-x);
          width: var(--osa-w);
          height: var(--osa-h);
        }
        .osa-card {
          animation: osa-fadeUp 0.7s cubic-bezier(0.22,1,0.36,1) both;
        }
        .osa-ring-glow::before {
          content: '';
          position: absolute;
          inset: -12px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(192,61,37,0.10) 0%, transparent 70%);
          animation: osa-glowPulse 2s ease-in-out infinite;
        }
        .osa-ring-fill {
          fill: none;
          stroke: #C03D25;
          stroke-width: 5;
          stroke-linecap: round;
          stroke-dasharray: 377;
          stroke-dashoffset: 377;
          animation: osa-ringFill 2.8s cubic-bezier(0.4,0,0.2,1) infinite;
          filter: drop-shadow(0 0 4px rgba(192,61,37,0.5));
        }
        .osa-arrow-up {
          position: absolute;
          top: -18px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          animation: osa-arrowBounce 1.1s ease-in-out infinite;
        }
        .osa-ell span { animation: osa-ellFade 1.4s ease-in-out infinite; opacity: 0; }
        .osa-ell span:nth-child(1) { animation-delay: 0s; }
        .osa-ell span:nth-child(2) { animation-delay: 0.22s; }
        .osa-ell span:nth-child(3) { animation-delay: 0.44s; }
        .osa-bar {
          height: 100%;
          border-radius: 3px;
          background: linear-gradient(90deg, #C03D25, #E06045);
          box-shadow: 0 0 8px rgba(192,61,37,0.3);
          animation: osa-barFill 2.8s cubic-bezier(0.4,0,0.2,1) infinite;
        }
        .osa-dot { animation: osa-dotPulse 1.2s ease-in-out infinite; }
        .osa-dot:nth-child(2) { animation-delay: 0.18s; }
        .osa-dot:nth-child(3) { animation-delay: 0.36s; }
      `}</style>

      <div
        style={{
          position: 'absolute', inset: 0, zIndex: 999,
          background: '#E5E5EB',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Inter', -apple-system, sans-serif",
          overflow: 'hidden',
        }}
      >
        {/* Ambient gradient */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `
            radial-gradient(ellipse 70% 45% at 50% 0%,   rgba(192,61,37,0.07) 0%, transparent 70%),
            radial-gradient(ellipse 60% 40% at 50% 100%, rgba(160,160,185,0.25) 0%, transparent 70%)
          `,
        }} />

        {/* Floating particles */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}>
          {[
            { x: '6%',  d: '6s',   delay: '0s',    w: '2px', h: '10px' },
            { x: '12%', d: '8s',   delay: '1.2s',  w: '2px', h: '6px'  },
            { x: '20%', d: '5.5s', delay: '0.4s',  w: '3px', h: '3px'  },
            { x: '32%', d: '7s',   delay: '2.5s',  w: '2px', h: '12px' },
            { x: '42%', d: '9s',   delay: '0.8s',  w: '2px', h: '4px'  },
            { x: '55%', d: '6.5s', delay: '3s',    w: '3px', h: '3px'  },
            { x: '65%', d: '7.5s', delay: '1.6s',  w: '2px', h: '8px'  },
            { x: '74%', d: '5s',   delay: '0.2s',  w: '2px', h: '5px'  },
            { x: '83%', d: '8.5s', delay: '2.2s',  w: '3px', h: '3px'  },
            { x: '91%', d: '6s',   delay: '1s',    w: '2px', h: '9px'  },
          ].map((p, i) => (
            <div key={i} className="osa-particle" style={{
              ['--osa-x' as any]: p.x,
              ['--osa-d' as any]: p.d,
              ['--osa-delay' as any]: p.delay,
              ['--osa-w' as any]: p.w,
              ['--osa-h' as any]: p.h,
            }} />
          ))}
        </div>

        {/* Main card */}
        <div className="osa-card" style={{
          position: 'relative', zIndex: 10,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 36,
        }}>

          {/* Brand */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 0.86, userSelect: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{
                fontFamily: "'Nunito', sans-serif", fontWeight: 900,
                fontSize: 'clamp(38px, 8vw, 64px)', color: '#D95035', letterSpacing: '-0.02em',
              }}>
                One&nbsp;Sales
              </span>
              <div style={{ width: 'clamp(36px, 5vw, 50px)', paddingTop: 4 }}>
                <Image src="/logo.png" alt="PH1 World Developers" width={50} height={50} style={{ width: '100%', height: 'auto', display: 'block' }} />
              </div>
            </div>
          </div>

          {/* Animated ring */}
          <div className="osa-ring-glow" style={{ position: 'relative', width: 140, height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }} viewBox="0 0 140 140">
              <circle fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth={5} cx={70} cy={70} r={60} />
              <circle className="osa-ring-fill" cx={70} cy={70} r={60} />
            </svg>
            {/* Center icon */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 60, height: 60 }}>
              <div className="osa-arrow-up">
                <div style={{ width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderBottom: '8px solid #C03D25' }} />
                <div style={{ width: 2, height: 8, background: '#C03D25', borderRadius: 1 }} />
              </div>
              {/* Document */}
              <div style={{
                position: 'relative', width: 36, height: 44,
                background: 'white', borderRadius: '4px 10px 4px 4px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
              }}>
                {/* Folded corner */}
                <div style={{
                  position: 'absolute', top: 0, right: 0, width: 12, height: 12,
                  background: '#E5E5EB', borderRadius: '0 0 0 4px',
                  boxShadow: '-1px 1px 0 rgba(0,0,0,0.06)',
                }} />
                {/* Lines */}
                <div style={{
                  position: 'absolute', top: 18, left: 6, right: 6, height: 2,
                  background: 'rgba(192,61,37,0.25)', borderRadius: 1,
                  boxShadow: '0 5px 0 rgba(192,61,37,0.15), 0 10px 0 rgba(192,61,37,0.10)',
                }} />
              </div>
            </div>
          </div>

          {/* Status text */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'rgba(30,30,45,0.75)', letterSpacing: '0.01em' }}>
              {label ?? 'Saving'}<span className="osa-ell"><span>.</span><span>.</span><span>.</span></span>
            </div>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(30,30,45,0.35)', letterSpacing: '0.04em' }}>
              Please do not close this window
            </div>
          </div>

          {/* Progress */}
          <div style={{ width: 'clamp(180px, 32vw, 280px)', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            <div style={{ width: '100%', height: 3, background: 'rgba(0,0,0,0.08)', borderRadius: 3, overflow: 'hidden' }}>
              {progress !== undefined
                ? <div style={{
                    height: '100%', borderRadius: 3,
                    background: 'linear-gradient(90deg, #C03D25, #E06045)',
                    boxShadow: '0 0 8px rgba(192,61,37,0.3)',
                    width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`,
                    transition: 'width 0.4s ease',
                  }} />
                : <div className="osa-bar" />
              }
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              {[0, 1, 2].map(i => (
                <div key={i} className="osa-dot" style={{
                  width: 4, height: 4, borderRadius: '50%',
                  background: 'rgba(192,61,37,0.5)',
                }} />
              ))}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div style={{
          position: 'absolute', bottom: 24, left: 0, right: 0,
          textAlign: 'center', fontSize: 9, fontWeight: 600,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'rgba(30,30,45,0.22)',
        }}>
          PH1 World Developers · Sales Management Platform
        </div>
      </div>
    </>
  );
}
