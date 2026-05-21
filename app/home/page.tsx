'use client';

import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import ProjectCarousel from '@/components/home/ProjectCarousel';
import ProjectPhotoSheet from '@/components/layout/ProjectPhotoSheet';
import { Project } from '@/types';

export default function HomePage() {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  return (
    <AppLayout showHeader transparent>
      {/* Full-screen carousel — fills the entire viewport */}
      <div className="fixed inset-0">
        <ProjectCarousel onProjectClick={setSelectedProject} />
      </div>

      {/* Project photo bottom sheet */}
      <ProjectPhotoSheet
        project={selectedProject}
        onClose={() => setSelectedProject(null)}
      />
    </AppLayout>
  );
}
