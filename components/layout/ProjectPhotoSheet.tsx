'use client';

import { useEffect, useCallback, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import Image from 'next/image';
import { X, ChevronLeft, ChevronRight, MapPin, Building2, Layers, Home, Hash, Car } from 'lucide-react';
import { Project } from '@/types';

type Tab = 'location' | 'units' | 'amenities';
const TABS: { key: Tab; label: string }[] = [
  { key: 'location',  label: 'Location'  },
  { key: 'units',     label: 'Units'     },
  { key: 'amenities', label: 'Amenities' },
];

function PhotoCarousel({ photos }: { photos: string[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: photos.length > 1 });
  const [current, setCurrent] = useState(0);
  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setCurrent(emblaApi.selectedScrollSnap());
    emblaApi.on('select', onSelect);
    return () => { emblaApi.off('select', onSelect); };
  }, [emblaApi]);

  if (photos.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-white/30 text-sm">No photos available</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Carousel track */}
      <div ref={emblaRef} className="overflow-hidden flex-1 min-h-0">
        <div className="flex h-full">
          {photos.map((url, i) => (
            <div key={i} className="flex-none w-full h-full relative">
              <Image
                src={url}
                alt={`Photo ${i + 1}`}
                fill
                className="object-contain"
                sizes="100vw"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Controls row */}
      {photos.length > 1 && (
        <div className="flex items-center justify-between px-4 py-2 shrink-0">
          <button
            onClick={scrollPrev}
            className="p-2 rounded-full glass text-white"
          >
            <ChevronLeft size={18} />
          </button>

          {/* Dot indicators */}
          <div className="flex gap-1.5">
            {photos.map((_, i) => (
              <button
                key={i}
                onClick={() => emblaApi?.scrollTo(i)}
                className={`rounded-full transition-all duration-300 ${
                  i === current ? 'w-4 h-1.5 bg-[#C03D25]' : 'w-1.5 h-1.5 bg-white/30'
                }`}
              />
            ))}
          </div>

          <button
            onClick={scrollNext}
            className="p-2 rounded-full glass text-white"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
}

interface ProjectPhotoSheetProps {
  project: Project | null;
  onClose: () => void;
}

export default function ProjectPhotoSheet({ project, onClose }: ProjectPhotoSheetProps) {
  const [activeTab, setActiveTab] = useState<Tab>('location');

  useEffect(() => {
    if (project) {
      setActiveTab('location');
      document.body.style.overflow = 'hidden';
    }
    return () => { document.body.style.overflow = ''; };
  }, [project]);

  if (!project) return null;

  const photos = project.photos ?? { location: [], units: [], amenities: [] };
  const activePhotos = Array.isArray(photos) ? photos : (photos[activeTab] ?? []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet — grows to fit content, max 90vh */}
      <div className="relative flex flex-col bg-[#1e0a06] rounded-t-[2.5rem] animate-slide-up border-t border-white/10"
        style={{ maxHeight: '90vh', height: '90vh' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/25" />
        </div>

        {/* Header */}
        <div className="px-5 pt-1 pb-3 shrink-0 space-y-2.5">
          {/* Name + close */}
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-white font-bold text-lg leading-tight flex-1">{project.name}</h3>
            <button
              onClick={onClose}
              className="p-2 rounded-2xl glass text-white/60 hover:text-white transition-colors shrink-0"
            >
              <X size={15} />
            </button>
          </div>

          {/* Description */}
          {project.description && (
            <p className="text-white/50 text-xs leading-relaxed">{project.description}</p>
          )}

          {/* Type pills */}
          <div className="flex flex-wrap gap-1.5">
            {project.property_type && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/10 text-white/70 text-xs">
                <Building2 size={10} /> {project.property_type}
              </span>
            )}
            {project.residence_type && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/10 text-white/70 text-xs">
                <Home size={10} /> {project.residence_type}
              </span>
            )}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col items-center py-1.5 rounded-xl bg-white/8 border border-white/10">
              <span className="text-[#C03D25] font-bold text-sm">{project.floors}</span>
              <span className="text-white/40 text-[10px] flex items-center gap-0.5 mt-0.5"><Layers size={9} /> Floors</span>
            </div>
            <div className="flex flex-col items-center py-1.5 rounded-xl bg-white/8 border border-white/10">
              <span className="text-[#C03D25] font-bold text-sm">{project.no_of_units}</span>
              <span className="text-white/40 text-[10px] flex items-center gap-0.5 mt-0.5"><Hash size={9} /> Units</span>
            </div>
            <div className="flex flex-col items-center py-1.5 rounded-xl bg-white/8 border border-white/10">
              <span className="text-[#C03D25] font-bold text-sm">{project.no_of_parkings}</span>
              <span className="text-white/40 text-[10px] flex items-center gap-0.5 mt-0.5"><Car size={9} /> Parking</span>
            </div>
          </div>

          {/* Address */}
          <div className="flex items-start gap-1.5">
            <MapPin size={11} className="text-white/30 mt-0.5 shrink-0" />
            <span className="text-white/40 text-xs leading-relaxed">{project.location}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 pb-3 shrink-0">
          {TABS.map((tab) => {
            const count = Array.isArray(photos) ? 0 : (photos[tab.key]?.length ?? 0);
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`
                  flex-1 py-2 rounded-xl text-xs font-semibold transition-all duration-200
                  ${isActive
                    ? 'bg-[#C03D25] text-white shadow-[0_2px_8px_rgba(192,61,37,0.4)]'
                    : 'bg-white/10 text-white/50 hover:bg-white/15'
                  }
                `}
              >
                {tab.label}
                {count > 0 && (
                  <span className={`ml-1 ${isActive ? 'text-white/70' : 'text-white/30'}`}>
                    ({count})
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Photos — fills all remaining space */}
        <div className="flex-1 flex flex-col min-h-0 px-2 pb-4">
          <PhotoCarousel photos={activePhotos} />
        </div>
      </div>
    </div>
  );
}
