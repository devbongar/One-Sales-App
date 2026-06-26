'use client';

import { useEffect, useRef, useState } from 'react';

export const BRF_STEP_LABELS = [
  'Saving audit snapshot',
  'Updating reservation',
  'Superseding old payment lines',
  'Generating new payment schedule',
  'Applying collections',
  'Rebuilding commission schedule',
  'Finalizing',
] as const;

export const BRF_TOTAL_STEPS = BRF_STEP_LABELS.length;

// ── Morphing shape ─────────────────────────────────────────────────────────────

function MorphShape() {
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const CX = 80, CY = 80, SIZE = 96;
    const MAX_CORNER = SIZE / 2;
    const k = 0.5523; // bezier factor for circular arc approximation

    function makeRoundedSquare(cornerR: number): string {
      const r  = Math.max(0, Math.min(cornerR, SIZE / 2));
      const s  = SIZE / 2;
      const x  = CX - s, y = CY - s;
      const w  = SIZE, h = SIZE;
      const kr = k * r;

      if (r <= 0.5) {
        return `M${x} ${y} L${x+w} ${y} L${x+w} ${y+h} L${x} ${y+h} Z`;
      }
      return [
        `M${x+r} ${y}`,
        `L${x+w-r} ${y}`,
        `C${x+w-r+kr} ${y} ${x+w} ${y+r-kr} ${x+w} ${y+r}`,
        `L${x+w} ${y+h-r}`,
        `C${x+w} ${y+h-r+kr} ${x+w-r+kr} ${y+h} ${x+w-r} ${y+h}`,
        `L${x+r} ${y+h}`,
        `C${x+r-kr} ${y+h} ${x} ${y+h-r+kr} ${x} ${y+h-r}`,
        `L${x} ${y+r}`,
        `C${x} ${y+r-kr} ${x+r-kr} ${y} ${x+r} ${y}`,
        `Z`,
      ].join(' ');
    }

    const MIN_SPEED  = 0.18; // rad/s at square
    const MAX_SPEED  = 2.20; // rad/s at circle
    const MORPH_RATE = 0.24; // full cycles per second

    let cyclePhase = 0;
    let rotation   = 0;
    let last       = performance.now();
    let raf: number;

    function tick(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      cyclePhase = (cyclePhase + dt * MORPH_RATE) % 1;

      const morphProgress = Math.sin(cyclePhase * Math.PI);
      const cornerR = MAX_CORNER * morphProgress;

      const rotSpeed = MIN_SPEED + (MAX_SPEED - MIN_SPEED) * morphProgress;
      rotation += dt * rotSpeed;

      const deg = rotation * (180 / Math.PI);
      if (pathRef.current) {
        pathRef.current.setAttribute('d', makeRoundedSquare(cornerR));
        pathRef.current.setAttribute('transform', `rotate(${deg} ${CX} ${CY})`);
      }

      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <svg width="160" height="160" viewBox="0 0 160 160" style={{ overflow: 'visible' }}>
      <defs>
        <radialGradient id="brf-fill" cx="50%" cy="50%" r="50%" fx="38%" fy="38%">
          <stop offset="0%"   stopColor="#E85A3C" />
          <stop offset="100%" stopColor="#C03D25" />
        </radialGradient>
        <filter id="brf-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="16" result="blur-big" />
          <feFlood floodColor="#C03D25" floodOpacity="0.30" result="color-big" />
          <feComposite in="color-big" in2="blur-big" operator="in" result="glow-big" />
          <feGaussianBlur in="SourceAlpha" stdDeviation="6" result="blur-mid" />
          <feFlood floodColor="#C03D25" floodOpacity="0.45" result="color-mid" />
          <feComposite in="color-mid" in2="blur-mid" operator="in" result="glow-mid" />
          <feMerge>
            <feMergeNode in="glow-big" />
            <feMergeNode in="glow-mid" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        ref={pathRef}
        fill="url(#brf-fill)"
        filter="url(#brf-glow)"
      />
    </svg>
  );
}

// ── Blinking cursor ────────────────────────────────────────────────────────────

function BlinkCursor() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const t = setInterval(() => setOn(p => !p), 530);
    return () => clearInterval(t);
  }, []);
  return <span style={{ opacity: on ? 1 : 0, transition: 'opacity 0.1s' }}>_</span>;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function BrfLoadingScreen({ currentStep }: { currentStep: number }) {
  const [prevStep,  setPrevStep]  = useState(currentStep);
  const [flashDot,  setFlashDot]  = useState<number | null>(null);
  const [labelShow, setLabelShow] = useState(true);

  useEffect(() => {
    if (currentStep > prevStep) {
      setFlashDot(currentStep - 1);
      setTimeout(() => setFlashDot(null), 700);
      setLabelShow(false);
      setTimeout(() => setLabelShow(true), 180);
      setPrevStep(currentStep);
    }
  }, [currentStep, prevStep]);

  const label =
    currentStep >= 1 && currentStep <= BRF_TOTAL_STEPS
      ? BRF_STEP_LABELS[currentStep - 1]
      : currentStep === 0
      ? 'Initializing'
      : 'Complete';

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center select-none"
      style={{ background: '#F2F2F7' }}
    >
      {/* Morphing shape */}
      <div className="relative z-10 mb-0">
        <MorphShape />
      </div>

      {/* PROCESSING REQUEST_ */}
      <p
        className="relative z-10 text-[11px] font-mono tracking-[0.30em] uppercase mb-2.5"
        style={{ color: '#C03D25' }}
      >
        PROCESSING REQUEST<BlinkCursor />
      </p>

      {/* Step label */}
      <p
        className="relative z-10 text-[9px] font-mono tracking-[0.18em] uppercase mb-11 transition-opacity duration-150"
        style={{ color: '#8E8E93', opacity: labelShow ? 1 : 0, minHeight: '14px' }}
      >
        {label}
      </p>

      {/* Dots */}
      <div className="relative z-10 flex items-center gap-4">
        {Array.from({ length: BRF_TOTAL_STEPS }, (_, i) => {
          const filled  = i < currentStep;
          const isFlash = flashDot === i;
          return (
            <div
              key={i}
              className="rounded-full transition-all duration-500"
              style={{
                width:      7,
                height:     7,
                background: filled ? '#C03D25' : 'transparent',
                border:     filled ? 'none' : '1.5px solid rgba(192,61,37,0.25)',
                boxShadow:  filled
                  ? isFlash
                    ? '0 0 16px 8px rgba(192,61,37,0.75), 0 0 32px 14px rgba(192,61,37,0.20)'
                    : '0 0 8px 3px rgba(192,61,37,0.35)'
                  : 'none',
                transform:  isFlash ? 'scale(2.2)' : 'scale(1)',
              }}
            />
          );
        })}
      </div>

      {/* Bottom note */}
      <p
        className="absolute bottom-8 z-10 text-[9px] font-mono tracking-[0.24em] uppercase"
        style={{ color: '#C7C7CC' }}
      >
        Do not close this page
      </p>
    </div>
  );
}
