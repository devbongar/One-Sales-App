'use client';

import { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import { uploadToStorage } from '@/lib/upload';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { Project, ProjectPhotos } from '@/types';
import {
  generateClientRegistration,
  generateTermsOfPayment,
  generateReservationAgreement,
  generateBuyerInformationForm,
  generateSampleComputation,
  generateSOA,
  fetchAllClients,
  fetchReservationList,
  buildPDFBase64,
  type ClientRecord,
  type ReservationSummary,
} from '@/lib/pdf-generators';
import {
  ImagePlus, Trash2, Pencil, Plus, X, Check,
  ChevronDown, ChevronUp, Upload, Camera, Palette,
  Building2, AlertTriangle, Loader2, Tag, Layers,
  CarFront, Hash, MapPin, FileText, Mail, ToggleLeft, ToggleRight, Eye,
  Send, CheckCircle2, Paperclip, Calendar, ChevronRight,
} from 'lucide-react';
import Link from 'next/link';

// ── Email test helpers ────────────────────────────────────────
type DocKey = 'none' | 'client_registration' | 'reservation_package' | 'buyer_info_form' | 'soa';
interface DocDef { label: string; selector: 'none' | 'client' | 'reservation'; filename: string }
const TEST_DOCS: Record<DocKey, DocDef> = {
  none:                  { label: 'No attachment',                                    selector: 'none',        filename: '' },
  client_registration:   { label: 'Client Registration Form',                         selector: 'client',      filename: 'client-registration.pdf' },
  reservation_package:   { label: 'Reservation Agreement & Terms of Payment',         selector: 'reservation', filename: 'reservation-agreement.pdf' },
  buyer_info_form:       { label: 'Buyer Information Form',                           selector: 'reservation', filename: 'buyer-info-form.pdf' },
  soa:                   { label: 'Statement of Account',                             selector: 'reservation', filename: 'statement-of-account.pdf' },
};
// ── Email template config ─────────────────────────────────────
type TriggerKey = 'on_client_created' | 'on_client_updated' | 'on_reservation' | 'on_booked' | 'on_finance_verified' | 'on_docs_submitted' | 'on_quotation_saved';

type EmailTemplate = {
  enabled: boolean;
  triggers: TriggerKey[];
  to: string[];
  cc: string[];
  subject: string;
  body: string;
};
type EmailTemplates = Record<string, EmailTemplate>;

const EMAIL_TRIGGERS: { key: TriggerKey; label: string; description: string }[] = [
  { key: 'on_client_created',    label: 'New client registered',       description: 'Sent when a new client record is created'               },
  { key: 'on_client_updated',    label: 'Client data edited & saved',  description: 'Sent when an existing client record is updated'          },
  { key: 'on_reservation',       label: 'On new reservation',          description: 'Sent when a reservation is first created'                },
  { key: 'on_booked',            label: 'On booked',                   description: 'Sent when the reservation status becomes Booked'         },
  { key: 'on_finance_verified',  label: 'On finance verified',         description: 'Sent when finance marks the account as verified'         },
  { key: 'on_docs_submitted',    label: 'Docs submitted to director',  description: 'Sent when booking docs are submitted for director review' },
  { key: 'on_quotation_saved',   label: 'Quotation saved',             description: 'Sent when a sample computation quotation is saved'        },
];

const EMAIL_DOCS: { key: string; label: string; defaultTriggers: TriggerKey[]; allowedTriggers: TriggerKey[] }[] = [
  { key: 'client_registration',   label: 'Client Registration Form', defaultTriggers: ['on_client_created', 'on_client_updated'], allowedTriggers: ['on_client_created', 'on_client_updated']                              },
  { key: 'reservation_package',   label: 'Reservation Agreement & Terms of Payment', defaultTriggers: ['on_reservation'], allowedTriggers: ['on_reservation']                              },
  { key: 'buyer_info_form',       label: 'Buyer Information Form',   defaultTriggers: ['on_docs_submitted'],   allowedTriggers: ['on_docs_submitted']                                                        },
  { key: 'sample_computation',    label: 'Sample Computation',       defaultTriggers: ['on_quotation_saved'],  allowedTriggers: ['on_quotation_saved']                                                      },
  { key: 'soa',                   label: 'SOA',                      defaultTriggers: ['on_finance_verified'], allowedTriggers: ['on_reservation', 'on_booked', 'on_finance_verified']                       },
];

const EMAIL_ROLES = [
  { key: 'client',             label: 'Client'             },
  { key: 'seller',             label: 'Seller'             },
  { key: 'sales_director',     label: 'Sales Director'     },
  { key: 'account_management', label: 'Account Management' },
  { key: 'finance',            label: 'Finance'            },
];

const EMPTY_TEMPLATE: EmailTemplate = { enabled: false, triggers: [], to: [], cc: [], subject: '', body: '' };

const TEMPLATE_VARS = '{client_name}, {reservation_id}, {project}, {unit}, {seller_name}';

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
          className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#F2F2F7] text-[#C03D25] text-xs font-semibold disabled:opacity-40 active:opacity-70">
          <Camera size={12} />
          {uploading ? 'Uploading…' : 'Add Photos'}
        </button>
        <input ref={ref} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => e.target.files && onUpload(e.target.files)} />
      </div>
      <PhotoStrip urls={urls} onRemove={(i) => onChange(urls.filter((_, idx) => idx !== i))} />
      {urls.length === 0 && (
        <div onClick={() => ref.current?.click()}
          className="flex flex-col items-center justify-center gap-1 h-16 rounded-xl border-2 border-dashed border-[#C03D25]/20 text-[#C7C7CC] text-xs cursor-pointer active:bg-[#C03D25]/5">
          <ImagePlus size={16} className="text-[#C03D25]/40" />
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

  // Email settings
  const [emailSender, setEmailSender]   = useState('');
  const [savingEmail, setSavingEmail]   = useState(false);
  const [emailSaved, setEmailSaved]     = useState(false);

  // Email attachments
  const [pdfClients, setPdfClients]                     = useState<ClientRecord[]>([]);
  const [pdfReservations, setPdfReservations]           = useState<ReservationSummary[]>([]);
  const [selClientId, setSelClientId]                   = useState('');
  const [selTopId, setSelTopId]                         = useState('');
  const [selAgreementId, setSelAgreementId]             = useState('');
  const [selBuyerInfoId, setSelBuyerInfoId]             = useState('');
  const [selSOAId, setSelSOAId]                         = useState('');

  // Email test section
  const [testTo,      setTestTo]      = useState('');
  const [testSubject, setTestSubject] = useState('Test Email from One Sales App');
  const [testBody,    setTestBody]    = useState('This is a test email.\n\nIf you received this, the email integration is working correctly.');
  const [testDocKey,  setTestDocKey]  = useState<DocKey>('none');
  const [testClientId, setTestClientId] = useState('');
  const [testResId,   setTestResId]   = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testResult,  setTestResult]  = useState<{ ok: boolean; message: string } | null>(null);

  // Email templates
  const [templates, setTemplates]           = useState<EmailTemplates>(
    Object.fromEntries(EMAIL_DOCS.map(d => [d.key, { ...EMPTY_TEMPLATE, triggers: d.defaultTriggers }]))
  );
  const [savingTpl, setSavingTpl]           = useState(false);
  const [tplSaved, setTplSaved]             = useState(false);
  const [expandedTpl, setExpandedTpl]       = useState<string | null>(null);

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
    fetchAllClients().then(setPdfClients).catch(() => {});
    fetchReservationList().then(setPdfReservations).catch(() => {});
    fetch('/api/settings').then(r => r.json()).then(s => {
      if (s.app_name)        setAppName(s.app_name);
      if (s.logo_url)        { setLogoUrl(s.logo_url); setLogoPreview(s.logo_url); }
      if (s.email_sender)    setEmailSender(s.email_sender);
      if (s.email_templates) {
        try {
          const saved = JSON.parse(s.email_templates) as EmailTemplates;
          setTemplates(prev => {
            const merged = { ...prev };
            EMAIL_DOCS.forEach(d => {
              if (saved[d.key]) merged[d.key] = { ...EMPTY_TEMPLATE, ...saved[d.key], triggers: saved[d.key].triggers ?? d.defaultTriggers };
            });
            return merged;
          });
        } catch {}
      }
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

  const saveEmailSettings = async () => {
    setSavingEmail(true);
    await fetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email_sender: emailSender }),
    });
    setSavingEmail(false); setEmailSaved(true);
    setTimeout(() => setEmailSaved(false), 2500);
  };

  const saveEmailTemplates = async () => {
    setSavingTpl(true);
    await fetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email_templates: JSON.stringify(templates) }),
    });
    setSavingTpl(false); setTplSaved(true);
    setTimeout(() => setTplSaved(false), 2500);
  };

  function updateTemplate(key: string, field: keyof EmailTemplate, value: string | boolean | string[]) {
    setTemplates(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }

  function toggleTrigger(docKey: string, trigger: TriggerKey) {
    setTemplates(prev => {
      const current = prev[docKey].triggers ?? [];
      const next = current.includes(trigger)
        ? current.filter(t => t !== trigger)
        : [...current, trigger];
      return { ...prev, [docKey]: { ...prev[docKey], triggers: next } };
    });
  }

  const testDocDef = TEST_DOCS[testDocKey];
  const testIsReady = !!testTo && !!testSubject && !!testBody && (
    testDocDef.selector === 'none' ||
    (testDocDef.selector === 'client' && !!testClientId) ||
    (testDocDef.selector === 'reservation' && !!testResId)
  );
  const handleTestSend = async () => {
    if (!testIsReady) return;
    setTestSending(true);
    setTestResult(null);
    try {
      let attachment: { name: string; base64: string } | undefined;
      if (testDocKey !== 'none') {
        const selectedClient = pdfClients.find(c => c.client_id === testClientId) ?? null;
        const resId = testDocDef.selector === 'reservation' ? testResId : null;
        const clientOverride = testDocDef.selector === 'client' ? selectedClient : undefined;
        const result = await buildPDFBase64(testDocKey, resId, clientOverride);
        attachment = { name: result.filename, base64: result.base64 };
      }
      const res = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testTo, subject: testSubject, body: testBody, attachment }),
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult({ ok: true, message: `Sent to ${testTo}${attachment ? ' with PDF attached' : ''}` });
      } else {
        setTestResult({ ok: false, message: data.error ?? 'Unknown error' });
      }
    } catch (e: any) {
      setTestResult({ ok: false, message: e.message ?? 'Network error' });
    } finally {
      setTestSending(false);
    }
  };

  function toggleRole(docKey: string, field: 'to' | 'cc', roleKey: string) {
    setTemplates(prev => {
      const current = prev[docKey][field] as string[];
      const next = current.includes(roleKey)
        ? current.filter(r => r !== roleKey)
        : [...current, roleKey];
      return { ...prev, [docKey]: { ...prev[docKey], [field]: next } };
    });
  }

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
        className="w-full px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] text-sm text-[#1C1C1E] outline-none focus:border-[#C03D25]/50 focus:bg-white transition-colors"
      />
    </div>
  );

  // ─────────────────────────────────────────────────────────────
  return (
    <PageShell title="System Settings">

      {/* ── Commission Settings ────────────────────────────── */}
      <Link href="/settings/commission-rates">
        <GlassCard className="px-4 py-3.5 flex items-center gap-3 active:opacity-75">
          <div className="w-9 h-9 rounded-xl bg-[#C03D25]/10 flex items-center justify-center shrink-0">
            <Calendar size={16} className="text-[#C03D25]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#1C1C1E]">Special Commission Rates</p>
            <p className="text-xs text-[#8E8E93] mt-0.5">Time-bound commission overrides per project and position</p>
          </div>
          <ChevronRight size={16} className="text-[#C7C7CC] shrink-0" />
        </GlassCard>
      </Link>

      {/* ── App Branding ───────────────────────────────────── */}
      <GlassCard className="p-5 space-y-5">
        {/* Section header */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#C03D25]/10 flex items-center justify-center">
            <Palette size={16} className="text-[#C03D25]" />
          </div>
          <p className="text-base font-bold text-[#1C1C1E]">App Branding</p>
        </div>

        {/* Logo */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-[#8E8E93]">App Logo</p>
          <div
            onClick={() => logoFileRef.current?.click()}
            className="flex items-center gap-4 p-3 rounded-2xl border-2 border-dashed border-[#C03D25]/20 cursor-pointer active:bg-[#C03D25]/5 transition-colors"
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
            <Upload size={16} className="text-[#C03D25] shrink-0" />
          </div>
          <input ref={logoFileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFile} />
        </div>

        {/* App Name */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[#8E8E93]">App Name</label>
          <input type="text" value={appName} onChange={e => setAppName(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] text-sm text-[#1C1C1E] outline-none focus:border-[#C03D25]/50 focus:bg-white transition-colors"
          />
        </div>

        <button type="button" onClick={saveAppSettings} disabled={savingApp}
          className={`w-full py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
            appSaved ? 'bg-green-500 text-white' : 'bg-[#C03D25] text-white active:opacity-80 disabled:opacity-60'
          }`}>
          {appSaved ? <><Check size={16} /> Saved!</> : savingApp ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : 'Save Branding'}
        </button>
      </GlassCard>

      {/* ── Carousel Projects ──────────────────────────────── */}
      <GlassCard className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#C03D25]/10 flex items-center justify-center">
              <Building2 size={16} className="text-[#C03D25]" />
            </div>
            <p className="text-base font-bold text-[#1C1C1E]">Carousel Projects</p>
          </div>
          <button type="button" onClick={openAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#C03D25] text-white text-xs font-semibold active:opacity-80">
            <Plus size={13} /> Add Project
          </button>
        </div>

        {loadingProjects ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={24} className="text-[#C03D25] animate-spin" />
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

      {/* ── Email Settings ────────────────────────────────── */}
      <GlassCard className="p-5 space-y-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#C03D25]/10 flex items-center justify-center">
            <Mail size={16} className="text-[#C03D25]" />
          </div>
          <p className="text-base font-bold text-[#1C1C1E]">Email Settings</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[#8E8E93]">Sender Email Address</label>
          <input
            type="email"
            value={emailSender}
            onChange={e => setEmailSender(e.target.value)}
            placeholder="e.g. onesalesapp@megawide.com"
            className="w-full px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] text-sm text-[#1C1C1E] outline-none focus:border-[#C03D25]/50 focus:bg-white transition-colors"
          />
          <p className="text-[11px] text-[#8E8E93]">
            All emails sent by the app will come from this address. Must be a Megawide Outlook mailbox authorized in Azure.
          </p>
        </div>

        <button type="button" onClick={saveEmailSettings} disabled={savingEmail || !emailSender.trim()}
          className={`w-full py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
            emailSaved ? 'bg-green-500 text-white' : 'bg-[#C03D25] text-white active:opacity-80 disabled:opacity-60'
          }`}>
          {emailSaved
            ? <><Check size={16} /> Saved!</>
            : savingEmail
              ? <><Loader2 size={15} className="animate-spin" /> Saving…</>
              : 'Save Email Settings'
          }
        </button>
      </GlassCard>

      {/* ── Email Templates ───────────────────────────────── */}
      <GlassCard className="p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#C03D25]/10 flex items-center justify-center">
            <FileText size={16} className="text-[#C03D25]" />
          </div>
          <div className="flex-1">
            <p className="text-base font-bold text-[#1C1C1E]">Email Templates</p>
            <p className="text-[11px] text-[#8E8E93]">Configure recipients and content per document</p>
          </div>
        </div>

        <div className="space-y-2">
          {EMAIL_DOCS.map(doc => {
            const tpl = templates[doc.key];
            const isOpen = expandedTpl === doc.key;
            return (
              <div key={doc.key} className="rounded-2xl border border-black/[0.07] overflow-hidden">

                {/* Row header */}
                <div className="flex items-center gap-3 px-4 py-3 bg-white">
                  {/* Toggle */}
                  <button
                    type="button"
                    onClick={() => updateTemplate(doc.key, 'enabled', !tpl.enabled)}
                    className="shrink-0"
                  >
                    {tpl.enabled
                      ? <ToggleRight size={26} className="text-[#C03D25]" />
                      : <ToggleLeft  size={26} className="text-[#C7C7CC]" />
                    }
                  </button>

                  {/* Label */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold truncate ${tpl.enabled ? 'text-[#1C1C1E]' : 'text-[#8E8E93]'}`}>
                      {doc.label}
                    </p>
                    {tpl.enabled && (
                      <p className="text-[11px] text-[#8E8E93] truncate mt-0.5">
                        {tpl.triggers.length > 0
                          ? tpl.triggers.map(t => EMAIL_TRIGGERS.find(x => x.key === t)?.label).join(', ')
                          : 'No trigger set'}
                        {tpl.to.length > 0 && ` · To: ${tpl.to.map(r => EMAIL_ROLES.find(x => x.key === r)?.label ?? r).join(', ')}`}
                      </p>
                    )}
                  </div>

                  {/* Expand */}
                  <button
                    type="button"
                    onClick={() => setExpandedTpl(isOpen ? null : doc.key)}
                    className="p-1.5 rounded-xl bg-[#F2F2F7] text-[#8E8E93] shrink-0"
                  >
                    {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>

                {/* Expanded fields */}
                {isOpen && (
                  <div className="px-4 pb-4 pt-1 bg-[#FAFAFA] border-t border-black/[0.05] space-y-3">

                    {/* Triggers */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wide">Send Triggers</label>
                      <div className="space-y-1">
                        {EMAIL_TRIGGERS.filter(t => doc.allowedTriggers.includes(t.key)).map(t => {
                          const active = (tpl.triggers ?? []).includes(t.key);
                          return (
                            <button
                              key={t.key}
                              type="button"
                              onClick={() => toggleTrigger(doc.key, t.key)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all active:scale-[0.99]"
                              style={active
                                ? { background: 'rgba(192,61,37,0.06)', borderColor: 'rgba(192,61,37,0.3)' }
                                : { background: 'white', borderColor: 'rgba(0,0,0,0.08)' }
                              }
                            >
                              <div className={`w-4 h-4 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${active ? 'bg-[#C03D25] border-[#C03D25]' : 'border-[#C7C7CC]'}`}>
                                {active && <Check size={10} className="text-white" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-semibold ${active ? 'text-[#C03D25]' : 'text-[#1C1C1E]'}`}>{t.label}</p>
                                <p className="text-[11px] text-[#8E8E93] leading-snug">{t.description}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* To */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wide">To</label>
                      <div className="flex flex-wrap gap-1.5">
                        {EMAIL_ROLES.map(role => {
                          const selected = tpl.to.includes(role.key);
                          return (
                            <button
                              key={role.key}
                              type="button"
                              onClick={() => toggleRole(doc.key, 'to', role.key)}
                              className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95"
                              style={selected
                                ? { background: '#C03D25', color: '#fff' }
                                : { background: 'rgba(0,0,0,0.06)', color: '#6C6C70' }
                              }
                            >
                              {role.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* CC */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wide">CC</label>
                      <div className="flex flex-wrap gap-1.5">
                        {EMAIL_ROLES.map(role => {
                          const selected = tpl.cc.includes(role.key);
                          return (
                            <button
                              key={role.key}
                              type="button"
                              onClick={() => toggleRole(doc.key, 'cc', role.key)}
                              className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95"
                              style={selected
                                ? { background: '#5856D6', color: '#fff' }
                                : { background: 'rgba(0,0,0,0.06)', color: '#6C6C70' }
                              }
                            >
                              {role.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Subject */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wide">Subject</label>
                      <input
                        type="text"
                        value={tpl.subject}
                        onChange={e => updateTemplate(doc.key, 'subject', e.target.value)}
                        placeholder={`${doc.label} – {client_name}`}
                        className="w-full px-3 py-2 rounded-xl border border-black/[0.1] bg-white text-sm text-[#1C1C1E] outline-none focus:border-[#C03D25]/50 transition-colors"
                      />
                    </div>

                    {/* Body */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wide">Body</label>
                      <textarea
                        value={tpl.body}
                        onChange={e => updateTemplate(doc.key, 'body', e.target.value)}
                        rows={5}
                        placeholder={`Dear {client_name},\n\nPlease find attached your ${doc.label}.\n\nBest regards,\n{seller_name}`}
                        className="w-full px-3 py-2 rounded-xl border border-black/[0.1] bg-white text-sm text-[#1C1C1E] outline-none focus:border-[#C03D25]/50 transition-colors resize-none font-mono"
                      />
                      <p className="text-[10px] text-[#8E8E93] leading-relaxed">
                        Available variables: <span className="font-mono">{TEMPLATE_VARS}</span>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={saveEmailTemplates}
          disabled={savingTpl}
          className={`w-full py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
            tplSaved ? 'bg-green-500 text-white' : 'bg-[#C03D25] text-white active:opacity-80 disabled:opacity-60'
          }`}
        >
          {tplSaved
            ? <><Check size={16} /> Saved!</>
            : savingTpl
              ? <><Loader2 size={15} className="animate-spin" /> Saving…</>
              : 'Save Email Templates'
          }
        </button>
      </GlassCard>

      {/* ── Email Attachments ─────────────────────────────── */}
      <GlassCard className="p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#C03D25]/10 flex items-center justify-center">
            <FileText size={16} className="text-[#C03D25]" />
          </div>
          <div className="flex-1">
            <p className="text-base font-bold text-[#1C1C1E]">Email Attachments</p>
            <p className="text-[11px] text-[#8E8E93]">Preview PDF documents before the email feature goes live</p>
          </div>
        </div>

        <div className="space-y-3">

          {/* Client Registration Form */}
          <div className="rounded-2xl border border-black/[0.07] p-3 bg-white space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[#1C1C1E]">Client Registration Form</p>
              <button type="button" onClick={() => generateClientRegistration(pdfClients.find(c => c.id === selClientId) ?? null)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E5E5EA] bg-[#F2F2F7] text-xs font-semibold text-[#1C1C1E] active:opacity-70">
                <Eye size={12} /> Preview
              </button>
            </div>
            <select value={selClientId} onChange={e => setSelClientId(e.target.value)}
              className="w-full text-xs rounded-xl border border-[#E5E5EA] bg-[#F2F2F7] px-3 py-2 text-[#1C1C1E] focus:outline-none">
              <option value="">— Select a client —</option>
              {pdfClients.map(c => (
                <option key={c.id} value={c.id}>
                  {c.last_name}, {c.first_name}{c.middle_name ? ` ${c.middle_name}` : ''}{c.client_id ? ` (${c.client_id})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Terms of Payment */}
          <div className="rounded-2xl border border-black/[0.07] p-3 bg-white space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[#1C1C1E]">Terms of Payment</p>
              <button type="button" onClick={() => generateTermsOfPayment(selTopId || null)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E5E5EA] bg-[#F2F2F7] text-xs font-semibold text-[#1C1C1E] active:opacity-70">
                <Eye size={12} /> Preview
              </button>
            </div>
            <select value={selTopId} onChange={e => setSelTopId(e.target.value)}
              className="w-full text-xs rounded-xl border border-[#E5E5EA] bg-[#F2F2F7] px-3 py-2 text-[#1C1C1E] focus:outline-none">
              <option value="">— Select a reservation —</option>
              {pdfReservations.map(r => (
                <option key={r.reservation_id} value={r.reservation_id}>
                  {r.reservation_id} — {r.client_name} ({r.inventory_code})
                </option>
              ))}
            </select>
          </div>

          {/* Reservation Agreement */}
          <div className="rounded-2xl border border-black/[0.07] p-3 bg-white space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[#1C1C1E]">Reservation Agreement</p>
              <button type="button" onClick={() => generateReservationAgreement(selAgreementId || null)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E5E5EA] bg-[#F2F2F7] text-xs font-semibold text-[#1C1C1E] active:opacity-70">
                <Eye size={12} /> Preview
              </button>
            </div>
            <select value={selAgreementId} onChange={e => setSelAgreementId(e.target.value)}
              className="w-full text-xs rounded-xl border border-[#E5E5EA] bg-[#F2F2F7] px-3 py-2 text-[#1C1C1E] focus:outline-none">
              <option value="">— Select a reservation —</option>
              {pdfReservations.map(r => (
                <option key={r.reservation_id} value={r.reservation_id}>
                  {r.reservation_id} — {r.client_name} ({r.inventory_code})
                </option>
              ))}
            </select>
          </div>

          {/* Buyer Information Form */}
          <div className="rounded-2xl border border-black/[0.07] p-3 bg-white space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[#1C1C1E]">Buyer Information Form</p>
              <button type="button" onClick={() => generateBuyerInformationForm(selBuyerInfoId || null)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E5E5EA] bg-[#F2F2F7] text-xs font-semibold text-[#1C1C1E] active:opacity-70">
                <Eye size={12} /> Preview
              </button>
            </div>
            <select value={selBuyerInfoId} onChange={e => setSelBuyerInfoId(e.target.value)}
              className="w-full text-xs rounded-xl border border-[#E5E5EA] bg-[#F2F2F7] px-3 py-2 text-[#1C1C1E] focus:outline-none">
              <option value="">— Select a reservation —</option>
              {pdfReservations.map(r => (
                <option key={r.reservation_id} value={r.reservation_id}>
                  {r.reservation_id} — {r.client_name} ({r.inventory_code})
                </option>
              ))}
            </select>
          </div>

          {/* Sample Computation */}
          <div className="rounded-2xl border border-black/[0.07] p-3 bg-white flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[#1C1C1E]">Sample Computation</p>
            <button type="button" onClick={() => generateSampleComputation()}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E5E5EA] bg-[#F2F2F7] text-xs font-semibold text-[#1C1C1E] active:opacity-70">
              <Eye size={12} /> Preview
            </button>
          </div>

          {/* SOA */}
          <div className="rounded-2xl border border-black/[0.07] p-3 bg-white space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[#1C1C1E]">Statement of Account (SOA)</p>
              <button type="button" onClick={() => generateSOA(selSOAId || null)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E5E5EA] bg-[#F2F2F7] text-xs font-semibold text-[#1C1C1E] active:opacity-70">
                <Eye size={12} /> Preview
              </button>
            </div>
            <select value={selSOAId} onChange={e => setSelSOAId(e.target.value)}
              className="w-full text-xs rounded-xl border border-[#E5E5EA] bg-[#F2F2F7] px-3 py-2 text-[#1C1C1E] focus:outline-none">
              <option value="">— Select a reservation —</option>
              {pdfReservations.map(r => (
                <option key={r.reservation_id} value={r.reservation_id}>
                  {r.reservation_id} — {r.client_name} ({r.inventory_code})
                </option>
              ))}
            </select>
          </div>

        </div>
      </GlassCard>

      {/* ── Email Test ────────────────────────────────────── */}
      <GlassCard className="p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[rgba(192,61,37,0.10)] flex items-center justify-center shrink-0">
            <Send size={16} className="text-[#C03D25]" />
          </div>
          <div className="flex-1">
            <p className="text-base font-bold text-[#1C1C1E]">Email Test</p>
            <p className="text-[11px] text-[#8E8E93]">Send a test email via Microsoft Graph API with optional PDF attachment</p>
          </div>
        </div>

        <div className="space-y-3">

          {/* To */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Recipient Email</p>
            <input type="email" value={testTo} onChange={e => setTestTo(e.target.value)}
              placeholder="recipient@example.com"
              className="w-full text-xs rounded-xl border border-[#E5E5EA] bg-[#F2F2F7] px-3 py-2 text-[#1C1C1E] focus:outline-none" />
          </div>

          {/* Subject */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Subject</p>
            <input type="text" value={testSubject} onChange={e => setTestSubject(e.target.value)}
              className="w-full text-xs rounded-xl border border-[#E5E5EA] bg-[#F2F2F7] px-3 py-2 text-[#1C1C1E] focus:outline-none" />
          </div>

          {/* Body */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Message</p>
            <textarea value={testBody} onChange={e => setTestBody(e.target.value)} rows={3}
              className="w-full text-xs rounded-xl border border-[#E5E5EA] bg-[#F2F2F7] px-3 py-2 text-[#1C1C1E] focus:outline-none resize-none" />
          </div>

          {/* PDF Attachment */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider flex items-center gap-1">
              <Paperclip size={11} /> PDF Attachment
            </p>
            <select value={testDocKey} onChange={e => { setTestDocKey(e.target.value as DocKey); setTestClientId(''); setTestResId(''); setTestResult(null); }}
              className="w-full text-xs rounded-xl border border-[#E5E5EA] bg-[#F2F2F7] px-3 py-2 text-[#1C1C1E] focus:outline-none">
              {(Object.entries(TEST_DOCS) as [DocKey, DocDef][]).map(([key, d]) => (
                <option key={key} value={key}>{d.label}</option>
              ))}
            </select>
            {testDocDef.selector === 'client' && (
              <select value={testClientId} onChange={e => setTestClientId(e.target.value)}
                className="w-full text-xs rounded-xl border border-[#E5E5EA] bg-[#F2F2F7] px-3 py-2 text-[#1C1C1E] focus:outline-none">
                <option value="">— Select a client —</option>
                {pdfClients.map(c => (
                  <option key={c.client_id ?? ''} value={c.client_id ?? ''}>
                    {c.client_id} — {c.last_name}, {c.first_name}
                  </option>
                ))}
              </select>
            )}
            {testDocDef.selector === 'reservation' && (
              <select value={testResId} onChange={e => setTestResId(e.target.value)}
                className="w-full text-xs rounded-xl border border-[#E5E5EA] bg-[#F2F2F7] px-3 py-2 text-[#1C1C1E] focus:outline-none">
                <option value="">— Select a reservation —</option>
                {pdfReservations.map(r => (
                  <option key={r.reservation_id} value={r.reservation_id}>
                    {r.reservation_id} — {r.client_name} ({r.inventory_code})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Result */}
          {testResult && (
            <div className={`rounded-2xl p-3 flex items-start gap-2 ${testResult.ok ? 'bg-green-50' : 'bg-red-50'}`}>
              {testResult.ok
                ? <CheckCircle2 size={15} className="text-green-600 shrink-0 mt-0.5" />
                : <AlertTriangle size={15} className="text-red-500 shrink-0 mt-0.5" />
              }
              <p className={`text-xs font-medium flex-1 ${testResult.ok ? 'text-green-700' : 'text-red-600'}`}>
                {testResult.message}
              </p>
              <button type="button" onClick={() => setTestResult(null)} className="shrink-0 text-[#8E8E93] active:opacity-60">
                <X size={13} />
              </button>
            </div>
          )}

          <button type="button" disabled={testSending || !testIsReady} onClick={handleTestSend}
            className={`w-full py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              testSending || !testIsReady ? 'bg-[#E5E5EA] text-[#C7C7CC] cursor-not-allowed' : 'bg-[#C03D25] text-white active:opacity-80'
            }`}>
            {testSending
              ? <><Loader2 size={15} className="animate-spin" />{testDocKey !== 'none' ? 'Generating PDF & Sending…' : 'Sending…'}</>
              : <><Send size={15} />{testDocKey !== 'none' ? 'Generate PDF & Send' : 'Send Test Email'}</>
            }
          </button>

        </div>
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
                  className="relative w-full h-40 rounded-2xl overflow-hidden bg-[#F2F2F7] border-2 border-dashed border-[#C03D25]/20 cursor-pointer flex items-center justify-center active:opacity-80">
                  {form.cover_photo_url ? (
                    <>
                      <Image src={form.cover_photo_url} alt="Cover" fill className="object-cover" sizes="100vw" />
                      <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
                        <div className="bg-white/90 rounded-xl px-3 py-1.5 flex items-center gap-1.5">
                          <Camera size={13} className="text-[#C03D25]" />
                          <span className="text-xs font-semibold text-[#1C1C1E]">Change Photo</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      {uploadingCategory === 'cover'
                        ? <Loader2 size={24} className="text-[#C03D25] animate-spin" />
                        : <><Camera size={28} className="text-[#C03D25]/40" /><p className="text-sm text-[#8E8E93]">Tap to upload cover photo</p></>
                      }
                    </div>
                  )}
                </div>
                <input ref={coverFileRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
              </div>

              {/* Basic Info */}
              <div className="space-y-3">
                <p className="text-xs font-bold text-[#C03D25] uppercase tracking-wider">Basic Info</p>
                {field('name',     'Project Name', <Building2 size={11} />)}
                {field('location', 'Location',     <MapPin size={11} />)}
              </div>

              {/* Classification */}
              <div className="space-y-3">
                <p className="text-xs font-bold text-[#C03D25] uppercase tracking-wider">Classification</p>
                <div className="grid grid-cols-2 gap-3">
                  {field('property_type',  'Property Type',  <Tag size={11} />)}
                  {field('residence_type', 'Residence Type', <Tag size={11} />)}
                </div>
              </div>

              {/* Details */}
              <div className="space-y-3">
                <p className="text-xs font-bold text-[#C03D25] uppercase tracking-wider">Details</p>
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
                  className="w-full px-3 py-2.5 rounded-xl border border-black/[0.1] bg-[#F2F2F7] text-sm text-[#1C1C1E] outline-none focus:border-[#C03D25]/50 focus:bg-white transition-colors resize-none"
                />
              </div>

              {/* Photo categories */}
              <div className="space-y-4">
                <p className="text-xs font-bold text-[#C03D25] uppercase tracking-wider">Project Photos</p>
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
                className="w-full py-4 rounded-2xl bg-[#C03D25] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:opacity-80">
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
