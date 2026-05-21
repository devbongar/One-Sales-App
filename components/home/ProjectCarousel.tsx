'use client';

import { useCallback, useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import Image from 'next/image';
import { MapPin, Building2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Project } from '@/types';

const PLACEHOLDER_PROJECTS: Project[] = [
  {
    id: 'ph1',
    name: 'Azure Heights',
    description: 'Premium condominium with breathtaking city views',
    location: 'BGC, Taguig City',
    property_type: 'Condominium',
    residence_type: 'High-Rise',
    floors: 45, no_of_units: 320, no_of_parkings: 280,
    cover_photo_url: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&q=80',
    photos: {
      location: ['https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=800&q=80'],
      units:    ['https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&q=80'],
      amenities:['https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800&q=80'],
    },
    created_at: '',
  },
  {
    id: 'ph2',
    name: 'Serene Villas',
    description: 'Exclusive townhouse community surrounded by nature',
    location: 'Alabang, Muntinlupa',
    property_type: 'Townhouse',
    residence_type: 'Low-Rise',
    floors: 3, no_of_units: 80, no_of_parkings: 80,
    cover_photo_url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80',
    photos: {
      location: ['https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&q=80'],
      units:    ['https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&q=80'],
      amenities:['https://images.unsplash.com/photo-1416331108676-a22ccb276e35?w=800&q=80'],
    },
    created_at: '',
  },
];

interface ProjectCarouselProps {
  onProjectClick: (project: Project) => void;
}

export default function ProjectCarousel({ onProjectClick }: ProjectCarouselProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true }, [
    Autoplay({ delay: 5000, stopOnInteraction: true }),
  ]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  // Fetch real projects, fall back to placeholders
  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((data: Project[]) => {
        setProjects(Array.isArray(data) && data.length > 0 ? data : PLACEHOLDER_PROJECTS);
      })
      .catch(() => setProjects(PLACEHOLDER_PROJECTS));
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

  if (projects.length === 0) return <div className="h-full w-full bg-black" />;

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
                fill className="object-cover" priority sizes="100vw"
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
