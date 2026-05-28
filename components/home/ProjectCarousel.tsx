'use client';

import { useCallback, useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import Image from 'next/image';
import { MapPin, Building2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Project } from '@/types';

interface ProjectCarouselProps {
  onProjectClick: (project: Project) => void;
}

// Tiny grey base64 pixel used as blur placeholder while real images load
const BLUR_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// ── Loading screen shown while projects fetch ─────────────────────────────────
function CarouselLoader() {
  return (
    <div className="relative h-full w-full overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 25% 0%, #F07A62 0%, #E8634A 35%, #C5432A 65%, #8B2515 100%)' }}>

      {/* Diagonal shimmer sweep */}
      <div className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.15) 50%, transparent 65%)',
          backgroundSize: '200% 100%',
          animation: 'shimmerSweep 2.4s ease-in-out infinite',
        }}
      />


      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-5">

        {/* Building icon with stroke-draw animation */}
        <div className="relative flex items-center justify-center">
          {/* Soft glow behind icon */}
          <div className="absolute w-24 h-24 rounded-full"
            style={{ background: 'rgba(255,255,255,0.2)', filter: 'blur(18px)' }} />
          <Building2
            size={64}
            strokeWidth={1.2}
            className="relative z-10 text-white"
            style={{ animation: 'strokeDraw 2s ease-in-out infinite alternate' }}
          />
        </div>

        {/* Text */}
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-white text-base font-bold tracking-wide">
            Preparing your properties
            <span style={{ color: 'rgba(255,255,255,0.7)', animation: 'ellipsisDot 1.5s steps(4,end) infinite' }}>...</span>
          </p>
          <p className="text-white/50 text-xs font-medium tracking-widest uppercase">
            One Sales App
          </p>
        </div>

      </div>

      {/* Keyframe styles injected inline */}
      <style>{`
        @keyframes shimmerSweep {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes strokeDraw {
          0%   { opacity: 0.4; transform: scale(0.92); filter: drop-shadow(0 0 0px rgba(255,255,255,0)); }
          100% { opacity: 1;   transform: scale(1);    filter: drop-shadow(0 0 14px rgba(255,255,255,0.6)); }
        }
        @keyframes ellipsisDot {
          0%  { content: ''; }
          25% { content: '.'; }
          50% { content: '..'; }
          75% { content: '...'; }
        }
      `}</style>
    </div>
  );
}

export default function ProjectCarousel({ onProjectClick }: ProjectCarouselProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true }, [
    Autoplay({ delay: 5000, stopOnInteraction: true }),
  ]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  // Fetch real projects — enforce a minimum 1.5s loader duration to avoid flicker
  useEffect(() => {
    const minDelay = new Promise<void>(res => setTimeout(res, 1500));
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

  // Re-init carousel when projects load
  useEffect(() => {
    emblaApi?.reInit();
  }, [projects, emblaApi]);


  if (loading) return <CarouselLoader />;

  if (projects.length === 0) {
    return (
      <div className="relative h-full w-full flex items-center justify-center"
        style={{ background: 'radial-gradient(ellipse at 25% 0%, #F07A62 0%, #E8634A 35%, #C5432A 65%, #8B2515 100%)' }}>
        <p className="text-white/60 text-sm">No projects available</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-black">
      <div ref={emblaRef} className="overflow-hidden h-full">
        <div className="flex h-full">
          {projects.map((project) => (
            <div
              key={project.id}
              className="flex-none w-full h-full relative cursor-pointer"
              onClick={() => onProjectClick(project)}
            >
              <Image
                src={project.cover_photo_url || 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&q=80'}
                alt={project.name}
                fill
                className="object-cover"
                priority
                sizes="100vw"
                placeholder="blur"
                blurDataURL={BLUR_DATA_URL}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-6 pb-8">
                <div className="flex items-center gap-1.5 mb-2">
                  <Building2 size={12} className="text-white/60" />
                  <span className="text-white/60 text-xs font-medium uppercase tracking-wide">
                    {project.property_type}
                  </span>
                </div>
                <h2 className="text-white text-2xl font-bold tracking-tight drop-shadow-lg">
                  {project.name}
                </h2>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <MapPin size={13} className="text-white/70" />
                  <span className="text-white/70 text-sm">{project.location}</span>
                </div>
                <p className="text-white/50 text-xs mt-2 line-clamp-1">{project.description}</p>
                <div className="flex items-center gap-2 mt-4">
                  <span className="px-3 py-1 rounded-full glass text-white/80 text-xs">
                    {project.no_of_units} units
                  </span>
                  <span className="px-3 py-1 rounded-full glass text-white/80 text-xs">
                    {project.floors} floors
                  </span>
                  <span className="text-white/40 text-xs ml-auto">Tap for photos</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button onClick={scrollPrev} className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full glass text-white z-10">
        <ChevronLeft size={20} />
      </button>
      <button onClick={scrollNext} className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full glass text-white z-10">
        <ChevronRight size={20} />
      </button>

      <div className="absolute top-20 right-4 flex flex-col gap-1.5 z-10">
        {projects.map((_, i) => (
          <button
            key={i}
            onClick={() => emblaApi?.scrollTo(i)}
            className={`w-1.5 rounded-full transition-all duration-300 ${
              i === selectedIndex ? 'h-6 bg-white' : 'h-1.5 bg-white/40'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
