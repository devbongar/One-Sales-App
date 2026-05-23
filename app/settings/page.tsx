'use client';

import { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import { uploadToStorage } from '@/lib/upload';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { Project, ProjectPhotos } from '@/types';
import {
  ImagePlus, Trash2, Pencil, Plus, X, Check,
  ChevronDown, ChevronUp, Upload, Camera, Palette,
  Building2, AlertTriangle, Loader2, Tag, Layers,
  CarFront, Hash, MapPin, FileText,
} from 'lucide-react';

type PhotoCategory = keyof ProjectPhotos;

const EMPTY_PHOTOS: ProjectPhotos = { location: [], units: [], amenities: [] };

const EMPTY_PROJECT: Omit<Project, 'id' | 'created_at'> = {
  name: '', description: '', location: '',
  property_type: '', residence_type: '',
  floors: 1, no_of_units: 0, no_of_parkings: 0,
  cover_photo_url: '', photos: EMPTY_PHOTOS,
};

const uploadFile = uploadToStorage;

// ── Thumbnail strip ───────────────────────────────────────────
function PhotoStrip({ urls, onRemove }: { urls: string[]; onRemove: (i: number) => void }) {
  if (urls.length === 0) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {urls.map((url, i) => (
        <div key={i} className="relative shrink-0 w-16 h-16 rounded-xl overflow-hidden border border-black/[0.08]">
          <Image src={url} alt="" fill className="object-cover" sizes="64px" />
          <button type="button" onClick={() => onRemove(i)}
            className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center">
            <X size={10} className="text-white" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Category upload section ───────────────────────────────────
function CategoryUpload({ label, urls, onChange, uploading, onUpload }: {
  label: string; urls: string[]; onChange: (urls: string[]) => void;
  uploading: boolean; onUpload: (files: FileList) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-[#6C6C70] uppercase tracking-wider">{label}</p>
        <button type="button" onClick={() => ref.current?.click()} disabled={uploading}
          className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#F2F2F7] text-[#E8634A] text-xs font-semibold disabled:opacity-40 active:opacity-70">
          <Camera size={12} />
          {uploading ? 'Uploading…' : 'Add Photos'}
        </button>
        <input ref={ref} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => e.target.files && onUpload(e.target.files)} />
      </div>
      <PhotoStrip urls={urls} onRemove={(i) => onChange(urls.filter((_, idx) => idx !== i))} />
      {urls.length === 0 && (
        <div onClick={() => ref.current?.click()}
          className="flex flex-col items-center justify-center gap-1 h-16 rounded-xl border-2 border-dashed border-[#E8634A]/20 text-[#C7C7CC] text-xs cursor-pointer active:bg-[#E8634A]/5">
          <ImagePlus size={16} className="text-[#E8634A]/40" />
          Tap to add {label.toLowerCase()} photos
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
export default function SettingsPage() {
  // App settings
  const [appName, setAppName]         = useState('One Sales App');
  const [logoUrl, setLogoUrl]         = useState('');
  const [logoPreview, setLogoPreview] = useState('');
  const [savingApp, setSavingApp]     = useState(false);
  const [appSaved, setAppSaved]       = useState(false);
  const logoFileRef = useRef<HTMLInputElement>(null);

  // Projects
  const [projects, setProjects]               = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [editingProject, setEditingProject]   = useState<Project | null>(null);
  const [form, setForm]                       = useState(EMPTY_PROJECT);
  const [formPhotos, setFormPhotos]           = useState<ProjectPhotos>(EMPTY_PHOTOS);
  const [savingProject, setSavingProject]     = useState(false);
  const [deletingId, setDeletingId]           = useState<string | null>(null);
  const [expandedId, setExpandedId]           = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget]       = useState<Project | null>(null);
  const [uploadingCategory, setUploadingCategory] = useState<PhotoCategory | 'cover' | null>(null);
  const coverFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(s => {
      if (s.app_name) setAppName(s.app_name);
      if (s.logo_url) { setLogoUrl(s.logo_url); setLogoPreview(s.logo_url); }
    });
    fetch('/api/projects').then(r => r.json()).then(data => {
      setProjects(data); setLoadingProjects(false);
    });
  }, []);

  const handleLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setLogoPreview(URL.createObjectURL(file));
    try {
      const url = await uploadFile(file, `logos/${Date.now()}_${file.name}`);
      setLogoUrl(url);
    } catch (err) { alert('Logo upload failed: ' + (err as Error).message); }
  };

  const saveAppSettings = async () => {
    setSavingApp(true);
    await fetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_name: appName, logo_url: logoUrl }),
    });
    setSavingApp(false); setAppSaved(true);
    setTimeout(() => setAppSaved(false), 2500);
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingCategory('cover');
    try {
      const url = await uploadFile(file, `projects/covers/${Date.now()}_${file.name}`);
      setForm(f => ({ ...f, cover_photo_url: url }));
    } catch (err) { alert('Upload failed: ' + (err as Error).message); }
    finally { setUploadingCategory(null); }
  };

  const handleCategoryUpload = async (category: PhotoCategory, files: FileList) => {
    setUploadingCategory(category);
    try {
      const urls = await Promise.all(
        Array.from(files).map(f => uploadFile(f, `projects/${category}/${Date.now()}_${f.name}`))
      );
      setFormPhotos(prev => ({ ...prev, [category]: [...prev[category], ...urls] }));
    } catch (err) { alert('Upload failed: ' + (err as Error).message); }
    finally { setUploadingCategory(null); }
  };

  const openAdd = () => {
    setEditingProject(null); setForm(EMPTY_PROJECT);
    setFormPhotos(EMPTY_PHOTOS); setShowProjectForm(true);
  };

  const openEdit = (p: Project) => {
    setEditingProject(p);
    setForm({
      name: p.name, description: p.description ?? '', location: p.location,
      property_type: p.property_type, residence_type: p.residence_type,
      floors: p.floors, no_of_units: p.no_of_units, no_of_parkings: p.no_of_parkings,
      cover_photo_url: p.cover_photo_url ?? '', photos: p.photos ?? EMPTY_PHOTOS,
    });
    const ph = p.photos ?? EMPTY_PHOTOS;
    setFormPhotos(Array.isArray(ph) ? EMPTY_PHOTOS
      : { location: ph.location ?? [], units: ph.units ?? [], amenities: ph.amenities ?? [] });
    setShowProjectForm(true);
  };

  const closeForm = () => { setShowProjectForm(false); setEditingProject(null); };

  const saveProject = async () => {
    setSavingProject(true);
    const payload = { ...form, photos: formPhotos };
    const url    = editingProject ? `/api/projects/${editingProject.id}` : '/api/projects';
    const method = editingProject ? 'PATCH' : 'POST';
    const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const saved: Project = await res.json();
    setProjects(prev => editingProject ? prev.map(p => p.id === saved.id ? saved : p) : [saved, ...prev]);
    setSavingProject(false); closeForm();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    await fetch(`/api/projects/${deleteTarget.id}`, { method: 'DELETE' });
    setProjects(prev => prev.filter(p => p.id !== deleteTarget.id));
    setDeletingId(null); setDeleteTarget(null);
  };

  const field = (key: keyof typeof form, label: string, icon: React.ReactNode, type = 'text') => (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-[#8E8E93] flex items-center gap-1.5">
        {icon}{label}
      </label>
      <input type={type} value={String(form[key])}
        onChange={e => setForm(f => ({ ...f, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
        className="w-full px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] text-sm text-[#1C1C1E] outline-none focus:border-[#E8634A]/50 focus:bg-white transition-colors"
      />
    </div>
  );

  // ─────────────────────────────────────────────────────────────
  return (
    <PageShell title="System Settings">

      {/* ── App Branding ───────────────────────────────────── */}
      <GlassCard className="p-5 space-y-5">
        {/* Section header */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#E8634A]/10 flex items-center justify-center">
            <Palette size={16} className="text-[#E8634A]" />
          </div>
          <p className="text-base font-bold text-[#1C1C1E]">App Branding</p>
        </div>

        {/* Logo */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-[#8E8E93]">App Logo</p>
          <div
            onClick={() => logoFileRef.current?.click()}
            className="flex items-center gap-4 p-3 rounded-2xl border-2 border-dashed border-[#E8634A]/20 cursor-pointer active:bg-[#E8634A]/5 transition-colors"
          >
            <div className="w-20 h-16 rounded-xl bg-[#F2F2F7] border border-black/[0.06] flex items-center justify-center overflow-hidden shrink-0">
              {logoPreview
                ? <Image src={logoPreview} alt="Logo" width={80} height={64} className="object-contain w-full h-full p-1" />
                : <ImagePlus size={22} className="text-[#C7C7CC]" />
              }
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#1C1C1E]">{logoPreview ? 'Change Logo' : 'Upload Logo'}</p>
              <p className="text-xs text-[#8E8E93] mt-0.5">PNG, JPG · Recommended 200×80px</p>
            </div>
            <Upload size={16} className="text-[#E8634A] shrink-0" />
          </div>
          <input ref={logoFileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFile} />
        </div>

        {/* App Name */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[#8E8E93]">App Name</label>
          <input type="text" value={appName} onChange={e => setAppName(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] text-sm text-[#1C1C1E] outline-none focus:border-[#E8634A]/50 focus:bg-white transition-colors"
          />
        </div>

        <button type="button" onClick={saveAppSettings} disabled={savingApp}
          className={`w-full py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
            appSaved ? 'bg-green-500 text-white' : 'bg-[#E8634A] text-white active:opacity-80 disabled:opacity-60'
          }`}>
          {appSaved ? <><Check size={16} /> Saved!</> : savingApp ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : 'Save Branding'}
        </button>
      </GlassCard>

      {/* ── Carousel Projects ──────────────────────────────── */}
      <GlassCard className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#E8634A]/10 flex items-center justify-center">
              <Building2 size={16} className="text-[#E8634A]" />
            </div>
            <p className="text-base font-bold text-[#1C1C1E]">Carousel Projects</p>
          </div>
          <button type="button" onClick={openAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#E8634A] text-white text-xs font-semibold active:opacity-80">
            <Plus size={13} /> Add Project
          </button>
        </div>

        {loadingProjects ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 rounded-full border-2 border-[#E8634A] border-t-transparent animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-[#C7C7CC]">
            <Building2 size={28} />
            <p className="text-sm">No projects yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map(p => (
              <div key={p.id} className="rounded-2xl border border-black/[0.06] overflow-hidden">
                {/* Row */}
                <div className="flex items-center gap-3 px-3 py-2.5 bg-white">
                  <div className="w-11 h-11 rounded-xl overflow-hidden bg-[#F2F2F7] shrink-0">
                    {p.cover_photo_url
                      ? <Image src={p.cover_photo_url} alt={p.name} width={44} height={44} className="object-cover w-full h-full" />
                      : <div className="w-full h-full flex items-center justify-center"><ImagePlus size={16} className="text-[#C7C7CC]" /></div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1C1C1E] truncate">{p.name}</p>
                    <p className="text-xs text-[#8E8E93] truncate">{p.location}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => openEdit(p)}
                      className="p-2 rounded-xl bg-[#F2F2F7] text-[#6C6C70] active:bg-gray-200">
                      <Pencil size={14} />
                    </button>
                    <button type="button" onClick={() => setDeleteTarget(p)} disabled={deletingId === p.id}
                      className="p-2 rounded-xl bg-[#FFF0EE] text-[#FF375F] active:bg-red-100 disabled:opacity-40">
                      <Trash2 size={14} />
                    </button>
                    <button type="button" onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                      className="p-2 rounded-xl bg-[#F2F2F7] text-[#8E8E93]">
                      {expandedId === p.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>

                {/* Expanded details */}
                {expandedId === p.id && (
                  <div className="px-4 py-3 bg-[#F9F9F9] border-t border-black/[0.06] space-y-2">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Tag size={11} className="text-[#C7C7CC] shrink-0" />
                        <span className="text-xs text-[#8E8E93]">{p.property_type || '—'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Tag size={11} className="text-[#C7C7CC] shrink-0" />
                        <span className="text-xs text-[#8E8E93]">{p.residence_type || '—'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Layers size={11} className="text-[#C7C7CC] shrink-0" />
                        <span className="text-xs text-[#8E8E93]">{p.floors} floor{p.floors !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Hash size={11} className="text-[#C7C7CC] shrink-0" />
                        <span className="text-xs text-[#8E8E93]">{p.no_of_units} units</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CarFront size={11} className="text-[#C7C7CC] shrink-0" />
                        <span className="text-xs text-[#8E8E93]">{p.no_of_parkings} parking</span>
                      </div>
                      {!Array.isArray(p.photos) && (
                        <div className="flex items-center gap-1.5">
                          <Camera size={11} className="text-[#C7C7CC] shrink-0" />
                          <span className="text-xs text-[#8E8E93]">
                            {(p.photos?.location?.length ?? 0) + (p.photos?.units?.length ?? 0) + (p.photos?.amenities?.length ?? 0)} photos
                          </span>
                        </div>
                      )}
                    </div>
                    {p.description && (
                      <p className="text-xs text-[#6C6C70] border-t border-black/[0.06] pt-2 leading-relaxed">{p.description}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* ── Delete Confirmation Modal ──────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-8"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl">
            <div className="flex flex-col items-center px-6 pt-7 pb-4 border-b border-black/[0.06]">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-3">
                <AlertTriangle size={24} className="text-[#FF375F]" />
              </div>
              <p className="text-base font-bold text-[#1C1C1E]">Delete Project</p>
              <p className="text-sm text-[#8E8E93] mt-1 text-center leading-relaxed">
                Are you sure you want to delete <span className="font-semibold text-[#1C1C1E]">{deleteTarget.name}</span>? This cannot be undone.
              </p>
            </div>
            <div className="px-6 pb-7 pt-4 flex flex-col gap-2.5">
              <button type="button" disabled={!!deletingId} onClick={confirmDelete}
                className="w-full py-3.5 rounded-2xl bg-[#FF375F] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 active:opacity-80">
                {deletingId ? <><Loader2 size={15} className="animate-spin" /> Deleting…</> : <><Trash2 size={15} /> Yes, Delete</>}
              </button>
              <button type="button" disabled={!!deletingId} onClick={() => setDeleteTarget(null)}
                className="w-full py-3.5 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] text-sm font-semibold active:opacity-70">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Project Form Modal ─────────────────────────────── */}
      {showProjectForm && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeForm} />
          {/* Modal panel — flex column so header/footer are fixed, middle scrolls */}
          <div className="relative bg-white rounded-t-[2.5rem] flex flex-col" style={{ maxHeight: '92dvh' }}>

            {/* Drag handle — never scrolls */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-black/10" />
            </div>

            {/* Header — never scrolls */}
            <div className="flex items-center justify-between px-5 pb-3 shrink-0">
              <p className="text-lg font-bold text-[#1C1C1E]">
                {editingProject ? 'Edit Project' : 'Add Project'}
              </p>
              <button type="button" onClick={closeForm}
                className="p-2 rounded-2xl bg-[#F2F2F7] text-[#6C6C70] active:opacity-70">
                <X size={18} />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-5 space-y-5 pb-4">

              {/* Cover photo */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#8E8E93]">Cover Photo</p>
                <div onClick={() => coverFileRef.current?.click()}
                  className="relative w-full h-40 rounded-2xl overflow-hidden bg-[#F2F2F7] border-2 border-dashed border-[#E8634A]/20 cursor-pointer flex items-center justify-center active:opacity-80">
                  {form.cover_photo_url ? (
                    <>
                      <Image src={form.cover_photo_url} alt="Cover" fill className="object-cover" sizes="100vw" />
                      <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
                        <div className="bg-white/90 rounded-xl px-3 py-1.5 flex items-center gap-1.5">
                          <Camera size={13} className="text-[#E8634A]" />
                          <span className="text-xs font-semibold text-[#1C1C1E]">Change Photo</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      {uploadingCategory === 'cover'
                        ? <Loader2 size={24} className="text-[#E8634A] animate-spin" />
                        : <><Camera size={28} className="text-[#E8634A]/40" /><p className="text-sm text-[#8E8E93]">Tap to upload cover photo</p></>
                      }
                    </div>
                  )}
                </div>
                <input ref={coverFileRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
              </div>

              {/* Basic Info */}
              <div className="space-y-3">
                <p className="text-xs font-bold text-[#E8634A] uppercase tracking-wider">Basic Info</p>
                {field('name',     'Project Name', <Building2 size={11} />)}
                {field('location', 'Location',     <MapPin size={11} />)}
              </div>

              {/* Classification */}
              <div className="space-y-3">
                <p className="text-xs font-bold text-[#E8634A] uppercase tracking-wider">Classification</p>
                <div className="grid grid-cols-2 gap-3">
                  {field('property_type',  'Property Type',  <Tag size={11} />)}
                  {field('residence_type', 'Residence Type', <Tag size={11} />)}
                </div>
              </div>

              {/* Details */}
              <div className="space-y-3">
                <p className="text-xs font-bold text-[#E8634A] uppercase tracking-wider">Details</p>
                <div className="grid grid-cols-3 gap-3">
                  {field('floors',         'Floors',  <Layers size={11} />,   'number')}
                  {field('no_of_units',    'Units',   <Hash size={11} />,     'number')}
                  {field('no_of_parkings', 'Parking', <CarFront size={11} />, 'number')}
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#8E8E93] flex items-center gap-1.5">
                  <FileText size={11} /> Description
                </label>
                <textarea value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] text-sm text-[#1C1C1E] outline-none focus:border-[#E8634A]/50 focus:bg-white transition-colors resize-none"
                />
              </div>

              {/* Photo categories */}
              <div className="space-y-4">
                <p className="text-xs font-bold text-[#E8634A] uppercase tracking-wider">Project Photos</p>
                {(['location', 'units', 'amenities'] as PhotoCategory[]).map(cat => (
                  <CategoryUpload key={cat}
                    label={cat.charAt(0).toUpperCase() + cat.slice(1)}
                    urls={formPhotos[cat]}
                    uploading={uploadingCategory === cat}
                    onChange={urls => setFormPhotos(prev => ({ ...prev, [cat]: urls }))}
                    onUpload={files => handleCategoryUpload(cat, files)}
                  />
                ))}
              </div>
            </div>

            {/* Save button — pinned at bottom, never scrolls */}
            <div className="px-5 pt-3 pb-8 shrink-0 border-t border-black/[0.06]">
              <button type="button" onClick={saveProject}
                disabled={savingProject || !form.name || !form.location}
                className="w-full py-4 rounded-2xl bg-[#E8634A] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:opacity-80">
                {savingProject
                  ? <><Loader2 size={15} className="animate-spin" /> Saving…</>
                  : editingProject ? <><Check size={15} /> Update Project</> : <><Plus size={15} /> Add Project</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

    </PageShell>
  );
}
