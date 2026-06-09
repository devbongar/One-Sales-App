'use client';

import { useCallback, useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import Image from 'next/image';
import { MapPin, Building2, Camera } from 'lucide-react';
import logoImg from '@/public/logo.png';
import { Project } from '@/types';

interface ProjectCarouselProps {
  onProjectClick: (project: Project) => void;
}

const BLUR_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// ── Loading screen ────────────────────────────────────────────────────────────
function CarouselLoader() {
  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: '#FFFFFF' }}>

      {/* Soft coral glow at bottom */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 40% at 50% 110%, rgba(192,61,37,0.10) 0%, transparent 70%)',
      }} />

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">

        {/* Company logo */}
        <div style={{ animation: 'loaderReveal 0.6s cubic-bezier(0.22,1,0.36,1) both' }}>
          <Image
            src={logoImg}
            alt="One Sales App"
            width={160}
            height={80}
            className="object-contain"
            priority
          />
        </div>

        {/* App name */}
        <div
          className="flex flex-col items-center gap-0.5"
          style={{ animation: 'loaderReveal 0.6s 0.12s cubic-bezier(0.22,1,0.36,1) both' }}
        >
          <p className="text-[#1C1C1E] text-base font-bold tracking-[0.18em] uppercase">
            One Sales App
          </p>
        </div>

        {/* Progress bar */}
        <div
          className="relative w-14 h-[2px] rounded-full overflow-hidden"
          style={{
            background: 'rgba(0,0,0,0.08)',
            animation: 'loaderReveal 0.4s 0.28s both',
          }}
        >
          <div
            className="absolute inset-y-0 left-0 right-0 rounded-full"
            style={{
              background: 'linear-gradient(90deg, #C5432A, #F07A62)',
              transformOrigin: 'left center',
              animation: 'progressFill 1.4s 0.35s cubic-bezier(0.4,0,0.2,1) both',
            }}
          />
        </div>

      </div>

      <style>{`
        @keyframes loaderReveal {
          0%   { opacity: 0; transform: translateY(8px) scale(0.97); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes progressFill {
          0%   { transform: scaleX(0); }
          100% { transform: scaleX(1); }
        }
        @keyframes slideUpFade {
          0%   { opacity: 0; transform: translateY(10px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes carouselFadeIn {
          0%   { opacity: 0; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ── Main carousel ─────────────────────────────────────────────────────────────
export default function ProjectCarousel({ onProjectClick }: ProjectCarouselProps) {
  const [projects, setProjects]           = useState<Project[]>([]);
  const [loading, setLoading]             = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true }, [
    Autoplay({ delay: 5000, stopOnInteraction: true }),
  ]);

  const scrollTo = useCallback((i: number) => emblaApi?.scrollTo(i), [emblaApi]);

  useEffect(() => {
    const minDelay = new Promise<void>((res) => setTimeout(res, 1500));
    const fetchData = fetch('/api/projects')
      .then((r) => r.json())
      .then((data: Project[]) => {
        if (Array.isArray(data) && data.length > 0) setProjects(data);
      })
      .catch(() => {});
    Promise.all([fetchData, minDelay]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    emblaApi.on('select', onSelect);
    return () => { emblaApi.off('select', onSelect); };
  }, [emblaApi]);

  useEffect(() => { emblaApi?.reInit(); }, [projects, emblaApi]);

  if (loading) return <CarouselLoader />;

  if (projects.length === 0) {
    return (
      <div
        className="relative h-full w-full flex items-center justify-center"
        style={{ background: '#FFFFFF' }}
      >
        <p className="text-black/30 text-sm">No projects available</p>
      </div>
    );
  }

  return (
    // Fade in from dark after loader exits
    <div
      className="relative h-full w-full bg-black"
      style={{ animation: 'carouselFadeIn 0.5s cubic-bezier(0.23,1,0.32,1) both' }}
    >

      {/* ── Slides ── */}
      <div ref={emblaRef} className="overflow-hidden h-full">
        <div className="flex h-full">
          {projects.map((project) => (
            <div
              key={project.id}
              className="flex-none w-full h-full relative"
              onClick={() => onProjectClick(project)}
            >
              <Image
                src={
                  project.cover_photo_url ||
                  'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&q=80'
                }
                alt={project.name}
                fill
                className="object-cover"
                priority
                sizes="100vw"
                placeholder="blur"
                blurDataURL={BLUR_DATA_URL}
              />
              {/* Gradient — strong at bottom, fades to transparent at top */}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.35) 40%, rgba(0,0,0,0.10) 70%, transparent 100%)',
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Animated content — re-mounts on slide change ── */}
      <div
        key={selectedIndex}
        className="absolute bottom-0 left-0 right-0 px-5 pb-[88px] pointer-events-none"
        style={{ animation: 'slideUpFade 0.35s cubic-bezier(0.22,1,0.36,1) both' }}
      >
        {/* Property type badge */}
        <div className="flex items-center gap-1.5 mb-3">
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}
          >
            <Building2 size={11} className="text-white/80" />
            <span className="text-white/90 text-[11px] font-semibold uppercase tracking-wider">
              {projects[selectedIndex]?.property_type}
            </span>
          </div>
        </div>

        {/* Project name */}
        <h2 className="text-white text-[28px] font-bold tracking-tight leading-tight drop-shadow-lg mb-1.5">
          {projects[selectedIndex]?.name}
        </h2>

        {/* Location */}
        <div className="flex items-center gap-1.5 mb-2">
          <MapPin size={13} className="text-white/70 shrink-0" />
          <span className="text-white/70 text-sm">{projects[selectedIndex]?.location}</span>
        </div>

        {/* Description */}
        {projects[selectedIndex]?.description && (
          <p className="text-white/45 text-xs line-clamp-1 mb-4">
            {projects[selectedIndex].description}
          </p>
        )}

        {/* Stats + Photos CTA */}
        <div className="flex items-center gap-2">
          <span
            className="px-3 py-1.5 rounded-full text-white/90 text-xs font-semibold"
            style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)' }}
          >
            {projects[selectedIndex]?.no_of_units} units
          </span>
          <span
            className="px-3 py-1.5 rounded-full text-white/90 text-xs font-semibold"
            style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)' }}
          >
            {projects[selectedIndex]?.floors} floors
          </span>
          <button
            className="ml-auto pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full active:scale-[0.96]"
            style={{
              background: 'rgba(192,61,37,0.80)',
              backdropFilter: 'blur(8px)',
              animation: 'slideUpFade 0.4s 0.1s cubic-bezier(0.22,1,0.36,1) both',
              transition: 'transform 100ms ease-out',
            }}
          >
            <Camera size={12} className="text-white" />
            <span className="text-white text-[11px] font-semibold">Photos</span>
          </button>
        </div>
      </div>

      {/* ── Dot indicators — bottom center ── */}
      <div className="absolute bottom-[72px] left-0 right-0 flex justify-center items-center gap-1.5 z-10 pointer-events-none">
        {projects.map((_, i) => (
          <button
            key={i}
            onClick={() => scrollTo(i)}
            className="pointer-events-auto rounded-full"
            style={{
              width:      i === selectedIndex ? '20px' : '6px',
              height:     '6px',
              background: i === selectedIndex ? '#FFFFFF' : 'rgba(255,255,255,0.35)',
              boxShadow:  i === selectedIndex ? '0 0 8px rgba(255,255,255,0.5)' : 'none',
              transition: 'width 200ms cubic-bezier(0.23,1,0.32,1), background-color 200ms ease, box-shadow 200ms ease',
            }}
          />
        ))}
      </div>

    </div>
  );
}
