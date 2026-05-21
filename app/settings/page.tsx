'use client';

import { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import { uploadToStorage } from '@/lib/upload';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import GlassButton from '@/components/ui/GlassButton';
import { Project, ProjectPhotos } from '@/types';
import {
  ImagePlus, Trash2, Pencil, Plus, X, Check,
  ChevronDown, ChevronUp, Upload, Camera,
} from 'lucide-react';

type PhotoCategory = keyof ProjectPhotos;

const EMPTY_PHOTOS: ProjectPhotos = { location: [], units: [], amenities: [] };

const EMPTY_PROJECT: Omit<Project, 'id' | 'created_at'> = {
  name: '', description: '', location: '',
  property_type: '', residence_type: '',
  floors: 1, no_of_units: 0, no_of_parkings: 0,
  cover_photo_url: '', photos: EMPTY_PHOTOS,
};

// alias so internal code stays unchanged
const uploadFile = uploadToStorage;

// ── Thumbnail strip with remove button ────────────────────────
function PhotoStrip({
  urls,
  onRemove,
}: {
  urls: string[];
  onRemove: (i: number) => void;
}) {
  if (urls.length === 0) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {urls.map((url, i) => (
        <div key={i} className="relative shrink-0 w-16 h-16 rounded-xl overflow-hidden">
          <Image src={url} alt="" fill className="object-cover" sizes="64px" />
          <button
            type="button"
            onClick={() => onRemove(i)}
            className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center text-white"
          >
            <X size={10} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Single category upload section ────────────────────────────
function CategoryUpload({
  label,
  urls,
  onChange,
  uploading,
  onUpload,
}: {
  label: string;
  urls: string[];
  onChange: (urls: string[]) => void;
  uploading: boolean;
  onUpload: (files: FileList) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/60 font-semibold uppercase tracking-wide">{label}</p>
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/10 border border-white/15 text-white/70 text-xs hover:bg-white/20 transition-colors disabled:opacity-40"
        >
          <Camera size={12} />
          {uploading ? 'Uploading…' : 'Add Photos'}
        </button>
        <input
          ref={ref}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && onUpload(e.target.files)}
        />
      </div>
      <PhotoStrip urls={urls} onRemove={(i) => onChange(urls.filter((_, idx) => idx !== i))} />
      {urls.length === 0 && (
        <div
          onClick={() => ref.current?.click()}
          className="flex flex-col items-center justify-center gap-1 h-16 rounded-xl border border-dashed border-white/15 text-white/25 text-xs cursor-pointer hover:border-white/30 transition-colors"
        >
          <ImagePlus size={18} />
          Tap to add {label.toLowerCase()} photos
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
export default function SettingsPage() {
  // ── App settings ──────────────────────────────────────────
  const [appName, setAppName]       = useState('One Sales App');
  const [logoUrl, setLogoUrl]       = useState('');
  const [logoPreview, setLogoPreview] = useState('');
  const [savingApp, setSavingApp]   = useState(false);
  const [appSaved, setAppSaved]     = useState(false);
  const logoFileRef = useRef<HTMLInputElement>(null);

  // ── Projects ──────────────────────────────────────────────
  const [projects, setProjects]           = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [editingProject, setEditingProject]   = useState<Project | null>(null);
  const [form, setForm]                   = useState(EMPTY_PROJECT);
  const [formPhotos, setFormPhotos]       = useState<ProjectPhotos>(EMPTY_PHOTOS);
  const [savingProject, setSavingProject] = useState(false);
  const [deletingId, setDeletingId]       = useState<string | null>(null);
  const [expandedId, setExpandedId]       = useState<string | null>(null);

  // per-category upload spinner
  const [uploadingCategory, setUploadingCategory] = useState<PhotoCategory | 'cover' | null>(null);

  const coverFileRef = useRef<HTMLInputElement>(null);

  // ── Load settings & projects ──────────────────────────────
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((s) => {
        if (s.app_name) setAppName(s.app_name);
        if (s.logo_url) { setLogoUrl(s.logo_url); setLogoPreview(s.logo_url); }
      });
    fetch('/api/projects')
      .then((r) => r.json())
      .then((data) => { setProjects(data); setLoadingProjects(false); });
  }, []);

  // ── Logo upload ───────────────────────────────────────────
  const handleLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoPreview(URL.createObjectURL(file));
    try {
      const url = await uploadFile(file, `logos/${Date.now()}_${file.name}`);
      setLogoUrl(url);
    } catch (err) {
      alert('Logo upload failed: ' + (err as Error).message);
    }
  };

  // ── Save app settings ──────────────────────────────────────
  const saveAppSettings = async () => {
    setSavingApp(true);
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_name: appName, logo_url: logoUrl }),
    });
    setSavingApp(false);
    setAppSaved(true);
    setTimeout(() => setAppSaved(false), 2500);
  };

  // ── Cover photo upload ────────────────────────────────────
  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCategory('cover');
    try {
      const url = await uploadFile(file, `projects/covers/${Date.now()}_${file.name}`);
      setForm((f) => ({ ...f, cover_photo_url: url }));
    } catch (err) {
      alert('Upload failed: ' + (err as Error).message);
    } finally {
      setUploadingCategory(null);
    }
  };

  // ── Category photo upload ─────────────────────────────────
  const handleCategoryUpload = async (category: PhotoCategory, files: FileList) => {
    setUploadingCategory(category);
    try {
      const urls = await Promise.all(
        Array.from(files).map((f) =>
          uploadFile(f, `projects/${category}/${Date.now()}_${f.name}`)
        )
      );
      setFormPhotos((prev) => ({ ...prev, [category]: [...prev[category], ...urls] }));
    } catch (err) {
      alert('Upload failed: ' + (err as Error).message);
    } finally {
      setUploadingCategory(null);
    }
  };

  // ── Project form helpers ──────────────────────────────────
  const openAdd = () => {
    setEditingProject(null);
    setForm(EMPTY_PROJECT);
    setFormPhotos(EMPTY_PHOTOS);
    setShowProjectForm(true);
  };

  const openEdit = (p: Project) => {
    setEditingProject(p);
    setForm({
      name: p.name, description: p.description ?? '', location: p.location,
      property_type: p.property_type, residence_type: p.residence_type,
      floors: p.floors, no_of_units: p.no_of_units, no_of_parkings: p.no_of_parkings,
      cover_photo_url: p.cover_photo_url ?? '',
      photos: p.photos ?? EMPTY_PHOTOS,
    });
    const ph = p.photos ?? EMPTY_PHOTOS;
    setFormPhotos(
      Array.isArray(ph)
        ? EMPTY_PHOTOS
        : { location: ph.location ?? [], units: ph.units ?? [], amenities: ph.amenities ?? [] }
    );
    setShowProjectForm(true);
  };

  const closeForm = () => { setShowProjectForm(false); setEditingProject(null); };

  const saveProject = async () => {
    setSavingProject(true);
    const payload = { ...form, photos: formPhotos };
    const url    = editingProject ? `/api/projects/${editingProject.id}` : '/api/projects';
    const method = editingProject ? 'PATCH' : 'POST';
    const res    = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const saved: Project = await res.json();
    setProjects((prev) =>
      editingProject ? prev.map((p) => (p.id === saved.id ? saved : p)) : [saved, ...prev]
    );
    setSavingProject(false);
    closeForm();
  };

  const deleteProject = async (id: string) => {
    if (!confirm('Delete this project?')) return;
    setDeletingId(id);
    await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setDeletingId(null);
  };

  const textField = (key: keyof typeof form, label: string, type = 'text') => (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-white/50 font-medium">{label}</label>
      <input
        type={type}
        value={String(form[key])}
        onChange={(e) =>
          setForm((f) => ({ ...f, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))
        }
        className="glass-input px-3 py-2.5 rounded-2xl text-sm w-full"
      />
    </div>
  );

  // ─────────────────────────────────────────────────────────────
  return (
    <PageShell title="System Settings">

      {/* ── App Branding ─────────────────────────────────── */}
      <GlassCard strong className="p-5 space-y-5">
        <p className="text-white font-bold text-base">App Branding</p>

        {/* Logo */}
        <div className="flex flex-col gap-2">
          <p className="text-xs text-white/50 font-medium">App Logo</p>
          <div className="flex items-center gap-4">
            <div
              className="w-20 h-14 rounded-2xl bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-md cursor-pointer"
              onClick={() => logoFileRef.current?.click()}
            >
              {logoPreview
                ? <Image src={logoPreview} alt="Logo" width={80} height={56} className="object-contain w-full h-full p-1" />
                : <ImagePlus size={22} className="text-gray-300" />
              }
            </div>
            <div className="flex-1">
              <input ref={logoFileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFile} />
              <GlassButton variant="ghost" size="sm" onClick={() => logoFileRef.current?.click()} className="w-full flex items-center justify-center gap-2">
                <Upload size={14} /> Upload Logo
              </GlassButton>
            </div>
          </div>
        </div>

        {/* App Name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-white/50 font-medium">App Name</label>
          <input
            type="text"
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
            className="glass-input px-3 py-3 rounded-2xl text-sm w-full"
          />
        </div>

        <GlassButton variant="primary" size="lg" onClick={saveAppSettings} disabled={savingApp} className="flex items-center justify-center gap-2">
          {appSaved ? <><Check size={16} /> Saved!</> : savingApp ? 'Saving…' : 'Save Branding'}
        </GlassButton>
      </GlassCard>

      {/* ── Carousel Projects ─────────────────────────────── */}
      <GlassCard strong className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-white font-bold text-base">Carousel Projects</p>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#E8634A] text-white text-xs font-semibold active:scale-95 transition-transform"
          >
            <Plus size={13} /> Add Project
          </button>
        </div>

        {loadingProjects ? (
          <p className="text-white/40 text-sm text-center py-4">Loading…</p>
        ) : projects.length === 0 ? (
          <p className="text-white/40 text-sm text-center py-4">No projects yet.</p>
        ) : (
          <ul className="space-y-2">
            {projects.map((p) => (
              <li key={p.id} className="glass rounded-2xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/10 shrink-0">
                    {p.cover_photo_url
                      ? <Image src={p.cover_photo_url} alt={p.name} width={40} height={40} className="object-cover w-full h-full" />
                      : <div className="w-full h-full flex items-center justify-center"><ImagePlus size={16} className="text-white/30" /></div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold truncate">{p.name}</p>
                    <p className="text-white/40 text-xs truncate">{p.location}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openEdit(p)} className="p-2 rounded-xl glass text-white/60 hover:text-white transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => deleteProject(p.id)} disabled={deletingId === p.id} className="p-2 rounded-xl glass text-[#FF375F]/70 hover:text-[#FF375F] transition-colors">
                      <Trash2 size={14} />
                    </button>
                    <button onClick={() => setExpandedId(expandedId === p.id ? null : p.id)} className="p-2 rounded-xl glass text-white/40">
                      {expandedId === p.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>
                {expandedId === p.id && (
                  <div className="px-4 pb-3 pt-0 border-t border-white/10 space-y-1 text-xs text-white/50">
                    <p><span className="text-white/30">Type:</span> {p.property_type} · {p.residence_type}</p>
                    <p><span className="text-white/30">Floors:</span> {p.floors} · <span className="text-white/30">Units:</span> {p.no_of_units} · <span className="text-white/30">Parking:</span> {p.no_of_parkings}</p>
                    {!Array.isArray(p.photos) && (
                      <p>
                        <span className="text-white/30">Photos —</span>{' '}
                        Location: {p.photos?.location?.length ?? 0} ·{' '}
                        Units: {p.photos?.units?.length ?? 0} ·{' '}
                        Amenities: {p.photos?.amenities?.length ?? 0}
                      </p>
                    )}
                    {p.description && <p className="text-white/40">{p.description}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      {/* ── Project Form Modal ────────────────────────────── */}
      {showProjectForm && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeForm} />
          <div className="relative bg-[#1e0a06] border-t border-white/10 rounded-t-[2.5rem] max-h-[92vh] overflow-y-auto animate-slide-up">

            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-white/25" />
            </div>

            <div className="px-5 pt-2 pb-10 space-y-5">
              {/* Header */}
              <div className="flex items-center justify-between">
                <p className="text-white font-bold text-lg">
                  {editingProject ? 'Edit Project' : 'Add Project'}
                </p>
                <button onClick={closeForm} className="p-2 rounded-2xl glass text-white/60 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              {/* Cover photo */}
              <div className="space-y-2">
                <p className="text-xs text-white/50 font-medium">Cover Photo</p>
                <div
                  className="relative w-full h-40 rounded-2xl overflow-hidden bg-white/5 border border-dashed border-white/15 cursor-pointer flex items-center justify-center"
                  onClick={() => coverFileRef.current?.click()}
                >
                  {form.cover_photo_url ? (
                    <>
                      <Image src={form.cover_photo_url} alt="Cover" fill className="object-cover" sizes="100vw" />
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                        <Camera size={24} className="text-white" />
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-white/30">
                      {uploadingCategory === 'cover' ? (
                        <p className="text-sm">Uploading…</p>
                      ) : (
                        <>
                          <Camera size={28} />
                          <p className="text-sm">Tap to upload cover photo</p>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <input ref={coverFileRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
              </div>

              {/* Text fields */}
              <div className="grid grid-cols-2 gap-3">
                {textField('name', 'Project Name')}
                {textField('location', 'Location')}
                {textField('property_type', 'Property Type')}
                {textField('residence_type', 'Residence Type')}
                {textField('floors', 'Floors', 'number')}
                {textField('no_of_units', 'No. of Units', 'number')}
                {textField('no_of_parkings', 'Parking Slots', 'number')}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-white/50 font-medium">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="glass-input px-3 py-2.5 rounded-2xl text-sm w-full resize-none"
                />
              </div>

              {/* Photo categories */}
              <div className="space-y-4 pt-1">
                <p className="text-white/60 text-xs font-bold uppercase tracking-widest">Project Photos</p>

                {(['location', 'units', 'amenities'] as PhotoCategory[]).map((cat) => (
                  <CategoryUpload
                    key={cat}
                    label={cat.charAt(0).toUpperCase() + cat.slice(1)}
                    urls={formPhotos[cat]}
                    uploading={uploadingCategory === cat}
                    onChange={(urls) => setFormPhotos((prev) => ({ ...prev, [cat]: urls }))}
                    onUpload={(files) => handleCategoryUpload(cat, files)}
                  />
                ))}
              </div>

              <GlassButton
                variant="primary"
                size="lg"
                onClick={saveProject}
                disabled={savingProject || !form.name || !form.location}
              >
                {savingProject ? 'Saving…' : editingProject ? 'Update Project' : 'Add Project'}
              </GlassButton>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
