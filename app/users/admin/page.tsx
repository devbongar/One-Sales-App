'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { AlertTriangle, Calendar, ChevronLeft, ChevronRight, CheckCircle2, DollarSign, CalendarDays, Loader2, Save, Plus, Trash2, Eraser, Building2, Layers, Percent, Home, ShieldCheck, GripVertical, Users, Crown, UserPlus, Network, FileCheck, Eye, EyeOff, KeyRound, Briefcase, Globe, Check, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import PageShell from '@/components/layout/PageShell';
import {
  fetchReservationFees,
  saveReservationFees,
  deleteReservationFees,
  fetchSalesPositions,
  saveSalesPositions,
  deleteSalesPositions,
  fetchDropdownOptions,
  saveDropdownOptions,
  deleteDropdownOptions,
  fetchDueDateAssignments,
  saveDueDateAssignments,
  fetchProjectTowers,
  saveProjectTowers,
  deleteProjectTowers,
  fetchVatSettings,
  saveVatSettings,
  deleteVatSettings,
  fetchHicSettings,
  saveHicSettings,
  deleteHicSettings,
  fetchAccessRoles,
  saveAccessRole,
  deleteAccessRole,
  ReservationFeeRecord,
  SalesPositionRecord,
  DueDateAssignment,
  ProjectTowerRecord,
  VatSettingRecord,
  HicSettingRecord,
  AccessRoleRecord,
} from '@/lib/admin';
import { fetchProjects, fetchTowers } from '@/lib/inventory';
import {
  previewTurnoverDueDateFixes,
  applyTurnoverDueDateFixes,
  fetchReceivableLines,
  computeExpectedSchedule,
  previewRepair,
  repairSchedule,
  DueDateFixPreview,
  ReceivableLine,
  ExpectedLine,
  RepairPreviewItem,
  RepairResult,
} from '@/lib/receivables';
import { supabase } from '@/lib/supabase';

/* ─── Design tokens ───────────────────────────────────────────────────── */
const overlayInputCls =
  'w-full px-3 py-2.5 rounded-xl border border-black/[0.10] bg-white text-sm text-[#1C1C1E] outline-none focus:border-[#C03D25]/40 focus:ring-1 focus:ring-[#C03D25]/20 transition-colors placeholder:text-[#C7C7CC]';

const cardStyle: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid rgba(0,0,0,0.08)',
  boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
};


/* ─── Setup items ─────────────────────────────────────────────────────── */
interface SetupItem {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const SETUP_ITEMS: SetupItem[] = [
  {
    id: 'reservation-fee',
    label: 'Dropdown Settings',
    description: 'Manage unit types, fees, and sales positions',
    icon: <DollarSign size={22} />,
  },
  {
    id: 'due-date',
    label: 'Due Date Settings',
    description: 'Configure due date rules by reservation day',
    icon: <CalendarDays size={22} />,
  },
  {
    id: 'project-settings',
    label: 'Project Settings',
    description: 'Manage turnover dates per project and tower',
    icon: <Building2 size={22} />,
  },
  {
    id: 'vat-settings',
    label: 'VAT Settings',
    description: 'Set VAT threshold per product type',
    icon: <Percent size={22} />,
  },
  {
    id: 'hic-settings',
    label: 'HIC Settings',
    description: 'Set HIC target amount per product type',
    icon: <Home size={22} />,
  },
  {
    id: 'access-rights',
    label: 'Access Rights',
    description: 'View role definitions and feature permissions',
    icon: <ShieldCheck size={22} />,
  },
  {
    id: 'user-management',
    label: 'User Management',
    description: 'Create accounts and assign roles to users',
    icon: <Users size={22} />,
  },
  {
    id: 'fix-due-dates',
    label: 'Fix Turnover Due Dates',
    description: 'Correct retention/loan due dates after turnover date is set',
    icon: <Calendar size={22} />,
  },
  {
    id: 'check-due-dates',
    label: 'Check Due Dates',
    description: 'Verify generated collection schedules are correct',
    icon: <FileCheck size={22} />,
  },
];

/* ─── Shared row types ────────────────────────────────────────────────── */
interface FeeRow {
  key: string;
  originalUnitType: string;
  unitType: string;
  fee: string;
  isNew: boolean;
}

interface PositionRow {
  key: string;
  originalPosition: string;
  position: string;
  positionCode: string;
  isNew: boolean;
}

interface OptionRow {
  key: string;
  originalValue: string;
  value: string;
  isNew: boolean;
}

function fmtFee(num: number): string {
  return num === 0 ? '' : num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ─── Paint-mode Due Date ─────────────────────────────────────────────── */
interface PaintRule {
  key: string;
  color: string;
  dueDate: string;
  sameMonth: boolean;
}

const RULE_COLORS = ['#C03D25', '#5E5CE6', '#34C759', '#FF9500', '#AF52DE'];

function InteractiveCalendar({
  dayMap,
  rules,
  activeTool,
  onPaintDay,
}: {
  dayMap: Record<number, string>;
  rules: PaintRule[];
  activeTool: string | null;
  onPaintDay: (day: number) => void;
}) {
  const isPainting = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const getRuleForDay = (day: number) => {
    const ruleKey = dayMap[day];
    return ruleKey ? rules.find(r => r.key === ruleKey) : undefined;
  };

  const getDayFromPoint = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y);
    const dayEl = el?.closest('[data-day]') as HTMLElement | null;
    return dayEl ? parseInt(dayEl.dataset.day!) : null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activeTool) return;
    e.preventDefault();
    isPainting.current = true;
    containerRef.current?.setPointerCapture(e.pointerId);
    const day = getDayFromPoint(e.clientX, e.clientY);
    if (day !== null) onPaintDay(day);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPainting.current || !activeTool) return;
    const day = getDayFromPoint(e.clientX, e.clientY);
    if (day !== null) onPaintDay(day);
  };

  const handlePointerUp = () => { isPainting.current = false; };

  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const padEnd = (7 - (31 % 7)) % 7;

  return (
    <div
      ref={containerRef}
      className="grid grid-cols-7 gap-1.5 select-none"
      style={{ touchAction: activeTool ? 'none' : 'auto' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {days.map(day => {
        const rule = getRuleForDay(day);
        const dueDay = rule ? parseInt(rule.dueDate) : NaN;
        const isDueDay = !isNaN(dueDay) && dueDay === day;
        return (
          <div
            key={day}
            data-day={day}
            className="aspect-square rounded-xl flex items-center justify-center text-xs font-semibold relative"
            style={{
              background: rule ? `${rule.color}22` : '#F2F2F7',
              color: rule ? rule.color : '#C7C7CC',
              boxShadow: isDueDay ? `0 0 0 2px ${rule!.color}` : undefined,
              cursor: activeTool ? 'crosshair' : 'default',
            }}
          >
            <span className="pointer-events-none">{day}</span>
            {isDueDay && (
              <span
                className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full pointer-events-none"
                style={{ background: rule!.color }}
              />
            )}
          </div>
        );
      })}
      {Array.from({ length: padEnd }).map((_, i) => (
        <div key={`pad-${i}`} className="aspect-square" />
      ))}
    </div>
  );
}

function DueDateSettingsOverlay({ onClose }: { onClose: () => void }) {
  const [rules, setRules] = useState<PaintRule[]>([]);
  const [dayMap, setDayMap] = useState<Record<number, string>>({});
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [selectedRuleKey, setSelectedRuleKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [loadError, setLoadError] = useState('');
  const originalDays = useRef<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const assignments = await fetchDueDateAssignments();
      // Group by (due_date, same_month) → reconstruct rules
      const ruleMap = new Map<string, { dueDate: number; sameMonth: boolean; days: number[] }>();
      for (const a of assignments) {
        const k = `${a.due_date}-${a.same_month}`;
        if (!ruleMap.has(k)) ruleMap.set(k, { dueDate: a.due_date, sameMonth: a.same_month, days: [] });
        ruleMap.get(k)!.days.push(a.day);
      }

      let colorIdx = 0;
      const newRules: PaintRule[] = [];
      const newDayMap: Record<number, string> = {};

      for (const [, { dueDate, sameMonth, days }] of ruleMap) {
        const key = `rule-${colorIdx}-${dueDate}`;
        const color = RULE_COLORS[colorIdx % RULE_COLORS.length];
        newRules.push({ key, color, dueDate: String(dueDate), sameMonth });
        for (const day of days) newDayMap[day] = key;
        colorIdx++;
      }

      setRules(newRules);
      setDayMap(newDayMap);
      originalDays.current = new Set(assignments.map(a => a.day));
      setActiveTool(null);
      setSelectedRuleKey(null);
    } catch (e: any) { console.error('[due-date] load error:', e); setLoadError(e?.message ?? 'Failed to load due date settings.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const assignments: DueDateAssignment[] = [];
      for (const [dayStr, ruleKey] of Object.entries(dayMap)) {
        const day = parseInt(dayStr);
        const rule = rules.find(r => r.key === ruleKey);
        if (!rule) continue;
        const due_date = parseInt(rule.dueDate);
        if (isNaN(due_date) || due_date < 1 || due_date > 31) continue;
        assignments.push({ day, due_date, same_month: rule.sameMonth });
      }
      const assignedDays = new Set(assignments.map(a => a.day));
      const removedDays = [...originalDays.current].filter(d => !assignedDays.has(d));
      await saveDueDateAssignments(assignments, removedDays);
      await load();
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2000);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const paintDay = useCallback((day: number) => {
    if (!activeTool) return;
    setDayMap(prev => {
      const next = { ...prev };
      if (activeTool === 'eraser') {
        delete next[day];
      } else {
        next[day] = activeTool;
      }
      return next;
    });
  }, [activeTool]);

  const addRule = () => {
    const usedColors = new Set(rules.map(r => r.color));
    const color = RULE_COLORS.find(c => !usedColors.has(c)) ?? RULE_COLORS[rules.length % RULE_COLORS.length];
    const key = `rule-new-${Date.now()}`;
    setRules(prev => [...prev, { key, color, dueDate: '', sameMonth: false }]);
    setActiveTool(key);
    setSelectedRuleKey(key);
  };

  const deleteRule = (ruleKey: string) => {
    setRules(prev => prev.filter(r => r.key !== ruleKey));
    setDayMap(prev => {
      const next: Record<number, string> = {};
      for (const [d, k] of Object.entries(prev)) {
        if (k !== ruleKey) next[parseInt(d)] = k;
      }
      return next;
    });
    if (activeTool === ruleKey) setActiveTool(null);
    if (selectedRuleKey === ruleKey) setSelectedRuleKey(null);
  };

  const selectedRule = rules.find(r => r.key === selectedRuleKey) ?? null;
  const uncoveredCount = Array.from({ length: 31 }, (_, i) => i + 1).filter(d => !dayMap[d]).length;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#F2F2F7]" style={{ animation: 'overlaySlideUp 0.32s cubic-bezier(0.32,0.72,0,1) both' }}>
      <style>{`@keyframes overlaySlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
      {/* Nav */}
      <div className="flex items-center justify-between px-4 pt-14 pb-4 shrink-0 bg-white border-b border-black/[0.06]">
        <button onClick={onClose} className="p-2.5 rounded-2xl bg-gray-100 text-[#1C1C1E] active:opacity-70 transition-opacity">
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-[#1C1C1E] font-bold text-base">Due Date Settings</h1>
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-[#C03D25] text-white text-sm font-bold shadow-md active:scale-95 transition-all disabled:opacity-50"
        >
          <Save size={14} />
          {saving ? 'Saving…' : savedMsg ? 'Saved!' : 'Save'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-10 space-y-4">
        {loadError && (
          <div className="rounded-2xl px-4 py-3 text-xs text-[#FF3B30] font-medium" style={{ background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.2)' }}>
            Load error: {loadError}
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={32} className="text-[#C03D25] animate-spin" />
          </div>
        ) : (
          <>
            {/* ── Calendar ── */}
            <div>
              <div className="flex items-center justify-between px-1 mb-2">
                <p className="text-xs font-bold uppercase tracking-widest text-[#8E8E93]">Calendar</p>
                {activeTool && (
                  <p className="text-xs text-[#8E8E93]">
                    {activeTool === 'eraser' ? 'Tap to clear days' : 'Tap or drag to paint'}
                  </p>
                )}
              </div>
              <div className="rounded-3xl bg-white p-4" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                <InteractiveCalendar
                  dayMap={dayMap}
                  rules={rules}
                  activeTool={activeTool}
                  onPaintDay={paintDay}
                />
              </div>
            </div>

            {/* ── Rules ── */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[#8E8E93] px-1 mb-2">Rules</p>
              <div className="rounded-3xl bg-white" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>

                {/* Tool chips */}
                <div className="flex items-center gap-2 px-4 py-3 flex-wrap border-b border-black/[0.06]">
                  {rules.map(rule => {
                    const isActive = activeTool === rule.key;
                    const dayCount = Object.values(dayMap).filter(k => k === rule.key).length;
                    return (
                      <button
                        key={rule.key}
                        onPointerDown={e => e.stopPropagation()}
                        onClick={() => {
                          setActiveTool(isActive ? null : rule.key);
                          setSelectedRuleKey(selectedRuleKey === rule.key ? null : rule.key);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                        style={{
                          background: isActive ? `${rule.color}22` : '#F2F2F7',
                          color: isActive ? rule.color : '#8E8E93',
                          border: `2px solid ${isActive ? rule.color : 'transparent'}`,
                        }}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: rule.color }} />
                        Due {rule.dueDate || '?'}
                        {dayCount > 0 && <span className="opacity-60 ml-0.5">·{dayCount}</span>}
                      </button>
                    );
                  })}

                  {/* Eraser */}
                  <button
                    onPointerDown={e => e.stopPropagation()}
                    onClick={() => {
                      setActiveTool(prev => prev === 'eraser' ? null : 'eraser');
                      setSelectedRuleKey(null);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                    style={{
                      background: activeTool === 'eraser' ? 'rgba(255,59,48,0.12)' : '#F2F2F7',
                      color: activeTool === 'eraser' ? '#FF3B30' : '#8E8E93',
                      border: `2px solid ${activeTool === 'eraser' ? '#FF3B30' : 'transparent'}`,
                    }}
                  >
                    <Eraser size={12} />
                    Eraser
                  </button>

                  {/* Add rule */}
                  {rules.length < RULE_COLORS.length && (
                    <button
                      onPointerDown={e => e.stopPropagation()}
                      onClick={addRule}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold text-[#C03D25] bg-[#C03D25]/10 transition-all active:opacity-70"
                    >
                      <Plus size={12} />
                      Add Rule
                    </button>
                  )}
                </div>

                {/* Rule editor */}
                {selectedRule && (
                  <div className="px-4 py-3 border-b border-black/[0.06]">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: selectedRule.color }} />
                      <p className="text-xs font-semibold text-[#1C1C1E]">Edit Rule</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-xs text-[#8E8E93] shrink-0">Due day</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={selectedRule.dueDate}
                          onChange={e => {
                            const digits = e.target.value.replace(/\D/g, '').slice(0, 2);
                            setRules(prev => prev.map(r => r.key === selectedRule.key ? { ...r, dueDate: digits } : r));
                          }}
                          placeholder="1–31"
                          className={overlayInputCls + ' text-center w-20'}
                        />
                      </div>
                      <div className="flex rounded-xl overflow-hidden border border-black/[0.08] text-xs font-semibold shrink-0">
                        <button
                          type="button"
                          onClick={() => setRules(prev => prev.map(r => r.key === selectedRule.key ? { ...r, sameMonth: true } : r))}
                          className="px-3 py-1.5 transition-colors"
                          style={selectedRule.sameMonth ? { background: selectedRule.color, color: '#fff' } : { background: '#F9FAFB', color: '#8E8E93' }}
                        >
                          Same Mo.
                        </button>
                        <button
                          type="button"
                          onClick={() => setRules(prev => prev.map(r => r.key === selectedRule.key ? { ...r, sameMonth: false } : r))}
                          className="px-3 py-1.5 transition-colors border-l border-black/[0.08]"
                          style={!selectedRule.sameMonth ? { background: selectedRule.color, color: '#fff' } : { background: '#F9FAFB', color: '#8E8E93' }}
                        >
                          Next Mo.
                        </button>
                      </div>
                      <button
                        onClick={() => deleteRule(selectedRule.key)}
                        className="p-2 rounded-xl text-[#FF3B30] bg-[#FF3B30]/10 active:bg-[#FF3B30]/20 transition-colors shrink-0"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Coverage legend */}
                <div className="px-4 py-3 space-y-2">
                  {rules.length === 0 && (
                    <p className="text-xs text-[#8E8E93] text-center py-1">Add a rule, then paint days on the calendar above.</p>
                  )}
                  {rules.map(rule => {
                    const dayCount = Object.values(dayMap).filter(k => k === rule.key).length;
                    const dueDay = parseInt(rule.dueDate);
                    return (
                      <div key={rule.key} className="flex items-center gap-2.5">
                        <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: `${rule.color}20`, border: `2px solid ${rule.color}` }} />
                        <span className="text-xs text-[#1C1C1E]">
                          Due <span className="font-semibold">{isNaN(dueDay) ? '?' : dueDay}</span>
                          <span className="text-[#8E8E93]"> · {rule.sameMonth ? 'Same month' : 'Next month'}</span>
                          <span className="text-[#8E8E93]"> · {dayCount} day{dayCount !== 1 ? 's' : ''}</span>
                        </span>
                      </div>
                    );
                  })}
                  {rules.length > 0 && (
                    uncoveredCount > 0 ? (
                      <div className="flex items-center gap-2.5">
                        <div className="w-3 h-3 rounded-sm shrink-0 bg-[#F2F2F7] border-2 border-[#E5E5EA]" />
                        <span className="text-xs text-[#8E8E93]">{uncoveredCount} day{uncoveredCount !== 1 ? 's' : ''} unassigned</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm shrink-0 bg-[#DCFCE7] border-2 border-[#34C759]" />
                        <span className="text-xs text-[#166534] font-medium">All 31 days covered</span>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Project Settings Overlay ────────────────────────────────────────── */
interface TowerRow {
  key: string;
  project: string;
  tower: string;
  turnoverDate: string;
  isNew: boolean;
}

function ProjectSettingsOverlay({ onClose }: { onClose: () => void }) {
  const [rows, setRows]             = useState<TowerRow[]>([]);
  const [deletedKeys, setDeletedKeys] = useState<{ project: string; tower: string }[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [savedMsg, setSavedMsg]     = useState(false);
  const [loadError, setLoadError]   = useState('');
  const [saveError, setSaveError]   = useState('');

  // Add-form state
  const [showAdd, setShowAdd]           = useState(false);
  const [allProjects, setAllProjects]   = useState<string[]>([]);
  const [towerOpts, setTowerOpts]       = useState<string[]>([]);
  const [addProject, setAddProject]     = useState('');
  const [addTower, setAddTower]         = useState('');
  const [addDate, setAddDate]           = useState('');
  const [towersLoading, setTowersLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [records, projects] = await Promise.all([
        fetchProjectTowers(),
        fetchProjects(),
      ]);
      setRows(records.map(r => ({
        key: `${r.project}||${r.tower}`,
        project: r.project,
        tower: r.tower,
        turnoverDate: r.turnover_date ?? '',
        isNew: false,
      })));
      setDeletedKeys([]);
      setAllProjects(projects);
    } catch (e: any) { console.error('[project-settings] load error:', e); setLoadError(e?.message ?? 'Failed to load project settings.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Load towers when project is picked in add form
  useEffect(() => {
    if (!addProject) { setTowerOpts([]); setAddTower(''); return; }
    setTowersLoading(true);
    fetchTowers(addProject)
      .then(t => { setTowerOpts(t); setAddTower(''); })
      .catch(console.error)
      .finally(() => setTowersLoading(false));
  }, [addProject]);

  const handleAdd = () => {
    if (!addProject || !addTower) return;
    const key = `${addProject}||${addTower}`;
    if (rows.some(r => r.key === key)) return; // already exists
    setRows(prev => [...prev, { key, project: addProject, tower: addTower, turnoverDate: addDate, isNew: true }]);
    setAddProject(''); setAddTower(''); setAddDate(''); setShowAdd(false);
  };

  const deleteRow = (row: TowerRow) => {
    setRows(prev => prev.filter(r => r.key !== row.key));
    if (!row.isNew) setDeletedKeys(prev => [...prev, { project: row.project, tower: row.tower }]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (deletedKeys.length > 0) await deleteProjectTowers(deletedKeys);
      const records: ProjectTowerRecord[] = rows.map(r => ({
        project: r.project,
        tower: r.tower,
        turnover_date: r.turnoverDate || null,
      }));
      if (records.length > 0) await saveProjectTowers(records);
      await load();
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2000);
    } catch (e: any) { console.error('[project-settings] save error:', e); setSaveError(e?.message ?? 'Failed to save project settings.'); }
    finally { setSaving(false); }
  };

  // Group existing rows by project
  const grouped = rows.reduce<Record<string, TowerRow[]>>((acc, row) => {
    (acc[row.project] ??= []).push(row);
    return acc;
  }, {});

  const selectCls = 'w-full px-3 py-2.5 rounded-xl border border-black/[0.10] bg-white text-sm text-[#1C1C1E] outline-none focus:border-[#C03D25]/40 transition-colors';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#F2F2F7]" style={{ animation: 'overlaySlideUp 0.32s cubic-bezier(0.32,0.72,0,1) both' }}>
      <style>{`@keyframes overlaySlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
      {/* Nav */}
      <div className="flex items-center justify-between px-4 pt-14 pb-4 shrink-0 bg-white border-b border-black/[0.06]">
        <button onClick={onClose} className="p-2.5 rounded-2xl bg-gray-100 text-[#1C1C1E] active:opacity-70 transition-opacity">
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-[#1C1C1E] font-bold text-base">Project Settings</h1>
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-[#C03D25] text-white text-sm font-bold shadow-md active:scale-95 transition-all disabled:opacity-50"
        >
          <Save size={14} />
          {saving ? 'Saving…' : savedMsg ? 'Saved!' : 'Save'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-10 space-y-4">
        {(loadError || saveError) && (
          <div className="rounded-2xl px-4 py-3 text-xs text-[#FF3B30] font-medium" style={{ background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.2)' }}>
            {loadError || saveError}
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={32} className="text-[#C03D25] animate-spin" />
          </div>
        ) : (
          <>
            {/* Rows grouped by project */}
            {Object.entries(grouped).map(([project, projectRows]) => (
              <div key={project}>
                <p className="text-xs font-bold uppercase tracking-widest text-[#8E8E93] px-1 mb-2">{project}</p>
                <div className="rounded-3xl overflow-hidden" style={cardStyle}>
                  <div className="flex items-center px-4 py-3 border-b border-black/[0.06] bg-[#F9FAFB]">
                    <span className="flex-1 text-xs font-bold uppercase tracking-widest text-[#8E8E93]">Tower</span>
                    <span className="w-36 text-xs font-bold uppercase tracking-widest text-[#8E8E93] text-center">Turnover Date</span>
                    <span className="w-9" />
                  </div>
                  {projectRows.map(row => (
                    <div key={row.key} className="flex items-center px-4 py-3 gap-3 border-b border-black/[0.06] last:border-0">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Layers size={13} className="text-[#C7C7CC] shrink-0" />
                        <span className="text-sm font-medium text-[#1C1C1E] truncate">{row.tower}</span>
                      </div>
                      <input
                        type="date"
                        value={row.turnoverDate}
                        onChange={e => setRows(prev => prev.map(r => r.key === row.key ? { ...r, turnoverDate: e.target.value } : r))}
                        className={overlayInputCls + ' w-36 text-center text-xs'}
                      />
                      <button
                        onClick={() => deleteRow(row)}
                        className="p-2 rounded-xl text-[#FF3B30] bg-[#FF3B30]/10 active:bg-[#FF3B30]/20 transition-colors shrink-0"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {rows.length === 0 && !showAdd && (
              <p className="text-xs text-[#8E8E93] text-center py-6">No towers configured yet. Tap below to add one.</p>
            )}

            {/* Add form */}
            {showAdd && (
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#8E8E93] px-1 mb-2">Add Tower</p>
                <div className="rounded-3xl overflow-hidden space-y-0" style={cardStyle}>
                  {/* Project */}
                  <div className="px-4 py-3 border-b border-black/[0.06] space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Building2 size={13} className="text-[#C7C7CC] shrink-0" />
                      <span className="text-xs font-medium text-[#8E8E93]">Project</span>
                    </div>
                    <select
                      value={addProject}
                      onChange={e => setAddProject(e.target.value)}
                      className={selectCls}
                    >
                      <option value="">Select project…</option>
                      {allProjects.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>

                  {/* Tower */}
                  <div className="px-4 py-3 border-b border-black/[0.06] space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Layers size={13} className="text-[#C7C7CC] shrink-0" />
                      <span className="text-xs font-medium text-[#8E8E93]">Tower</span>
                    </div>
                    <select
                      value={addTower}
                      onChange={e => setAddTower(e.target.value)}
                      disabled={!addProject || towersLoading}
                      className={selectCls + (!addProject || towersLoading ? ' opacity-40' : '')}
                    >
                      <option value="">
                        {!addProject ? 'Select project first' : towersLoading ? 'Loading…' : 'Select tower…'}
                      </option>
                      {towerOpts.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>

                  {/* Turnover Date */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-black/[0.06]">
                    <CalendarDays size={15} className="text-[#C03D25] shrink-0" />
                    <span className="flex-1 text-sm font-medium text-[#1C1C1E]">Turnover Date</span>
                    <input
                      type="date"
                      value={addDate}
                      onChange={e => setAddDate(e.target.value)}
                      className="text-sm text-[#1C1C1E] bg-transparent outline-none text-right"
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 px-4 py-3">
                    <button
                      onClick={handleAdd}
                      disabled={!addProject || !addTower}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-[#C03D25] text-white text-sm font-semibold disabled:opacity-40 active:opacity-80"
                    >
                      <Plus size={14} />
                      Add
                    </button>
                    <button
                      onClick={() => { setShowAdd(false); setAddProject(''); setAddTower(''); setAddDate(''); }}
                      className="flex-1 py-2.5 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] text-sm font-semibold active:opacity-70"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Add Tower button */}
            {!showAdd && (
              <button
                onClick={() => setShowAdd(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-3xl text-[#C03D25] text-sm font-semibold border-2 border-dashed border-[#C03D25]/30 active:bg-[#C03D25]/5 transition-colors"
              >
                <Plus size={16} />
                Add Tower
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Dropdown Settings Overlay ───────────────────────────────────────── */
function DropdownSettingsOverlay({ onClose }: { onClose: () => void }) {
  /* — Reservation fee state — */
  const [feeRows, setFeeRows] = useState<FeeRow[]>([]);
  const [deletedFeeKeys, setDeletedFeeKeys] = useState<string[]>([]);

  /* — Sales position state — */
  const [posRows, setPosRows] = useState<PositionRow[]>([]);
  const [deletedPosKeys, setDeletedPosKeys] = useState<string[]>([]);

  /* — Gender state — */
  const [genderRows, setGenderRows] = useState<OptionRow[]>([]);
  const [deletedGenderKeys, setDeletedGenderKeys] = useState<string[]>([]);

  /* — Civil status state — */
  const [civilRows, setCivilRows] = useState<OptionRow[]>([]);
  const [deletedCivilKeys, setDeletedCivilKeys] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [fees, positions, genders, civils] = await Promise.all([
        fetchReservationFees(),
        fetchSalesPositions(),
        fetchDropdownOptions('gender'),
        fetchDropdownOptions('civil_status'),
      ]);
      setFeeRows(fees.map((r) => ({
        key: r.unit_type,
        originalUnitType: r.unit_type,
        unitType: r.unit_type,
        fee: fmtFee(Number(r.fee)),
        isNew: false,
      })));
      setDeletedFeeKeys([]);
      setPosRows(positions.map((r) => ({
        key: r.position,
        originalPosition: r.position,
        position: r.position,
        positionCode: r.position_code,
        isNew: false,
      })));
      setDeletedPosKeys([]);
      setGenderRows(genders.map((v) => ({ key: v, originalValue: v, value: v, isNew: false })));
      setDeletedGenderKeys([]);
      setCivilRows(civils.map((v) => ({ key: v, originalValue: v, value: v, isNew: false })));
      setDeletedCivilKeys([]);
    } catch (e: any) {
      console.error('[dropdown-settings] load error:', e);
      setLoadError(e?.message ?? 'Failed to load dropdown settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save reservation fees (handle renames by deleting old PKs)
      const renamedFeeKeys = feeRows
        .filter((r) => !r.isNew && r.originalUnitType !== r.unitType.trim())
        .map((r) => r.originalUnitType);
      await deleteReservationFees([...deletedFeeKeys, ...renamedFeeKeys]);
      const feeRecords: ReservationFeeRecord[] = feeRows
        .filter((r) => r.unitType.trim() !== '')
        .map((r) => ({
          unit_type: r.unitType.trim(),
          fee: parseFloat(r.fee.replace(/,/g, '')) || 0,
        }));
      await saveReservationFees(feeRecords);

      // Save sales positions (handle renames)
      const renamedPosKeys = posRows
        .filter((r) => !r.isNew && r.originalPosition !== r.position.trim())
        .map((r) => r.originalPosition);
      await deleteSalesPositions([...deletedPosKeys, ...renamedPosKeys]);
      const posRecords: SalesPositionRecord[] = posRows
        .filter((r) => r.position.trim() !== '')
        .map((r) => ({
          position: r.position.trim(),
          position_code: r.positionCode.trim(),
        }));
      await saveSalesPositions(posRecords);

      // Save gender (handle renames)
      const renamedGenderKeys = genderRows
        .filter((r) => !r.isNew && r.originalValue !== r.value.trim())
        .map((r) => r.originalValue);
      await deleteDropdownOptions('gender', [...deletedGenderKeys, ...renamedGenderKeys]);
      await saveDropdownOptions('gender', genderRows.filter((r) => r.value.trim() !== '').map((r) => r.value.trim()));

      // Save civil status (handle renames)
      const renamedCivilKeys = civilRows
        .filter((r) => !r.isNew && r.originalValue !== r.value.trim())
        .map((r) => r.originalValue);
      await deleteDropdownOptions('civil_status', [...deletedCivilKeys, ...renamedCivilKeys]);
      await saveDropdownOptions('civil_status', civilRows.filter((r) => r.value.trim() !== '').map((r) => r.value.trim()));

      await load();
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2000);
    } catch (e: any) {
      console.error('[dropdown-settings] save error:', e);
      setSaveError(e?.message ?? 'Failed to save dropdown settings.');
    } finally {
      setSaving(false);
    }
  };

  /* — Fee row helpers — */
  const updateFee = (key: string, value: string) =>
    setFeeRows((prev) => prev.map((r) => r.key === key ? { ...r, fee: value } : r));

  const handleFeeFocus = (key: string) =>
    setFeeRows((prev) => prev.map((r) =>
      r.key === key ? { ...r, fee: r.fee.replace(/,/g, '') } : r
    ));

  const handleFeeBlur = (key: string) =>
    setFeeRows((prev) => prev.map((r) => {
      if (r.key !== key) return r;
      const raw = r.fee.replace(/,/g, '');
      if (raw === '') return r;
      const num = parseFloat(raw);
      return { ...r, fee: isNaN(num) ? r.fee : fmtFee(num) };
    }));

  const deleteFeeRow = (row: FeeRow) => {
    setFeeRows((prev) => prev.filter((r) => r.key !== row.key));
    if (!row.isNew) setDeletedFeeKeys((prev) => [...prev, row.unitType]);
  };

  const addFeeRow = () => {
    const key = `new-fee-${Date.now()}`;
    setFeeRows((prev) => [...prev, { key, originalUnitType: '', unitType: '', fee: '', isNew: true }]);
  };

  /* — Position row helpers — */
  const deletePosRow = (row: PositionRow) => {
    setPosRows((prev) => prev.filter((r) => r.key !== row.key));
    if (!row.isNew) setDeletedPosKeys((prev) => [...prev, row.position]);
  };

  const addPosRow = () => {
    const key = `new-pos-${Date.now()}`;
    setPosRows((prev) => [...prev, { key, originalPosition: '', position: '', positionCode: '', isNew: true }]);
  };

  /* — Option row helpers (reusable for gender & civil status) — */
  function makeOptionHelpers(
    setRows: React.Dispatch<React.SetStateAction<OptionRow[]>>,
    setDeletedKeys: React.Dispatch<React.SetStateAction<string[]>>,
    prefix: string,
  ) {
    const deleteRow = (row: OptionRow) => {
      setRows((prev) => prev.filter((r) => r.key !== row.key));
      if (!row.isNew) setDeletedKeys((prev) => [...prev, row.value]);
    };
    const addRow = () => {
      const key = `new-${prefix}-${Date.now()}`;
      setRows((prev) => [...prev, { key, originalValue: '', value: '', isNew: true }]);
    };
    return { deleteRow, addRow };
  }

  const gender = makeOptionHelpers(setGenderRows, setDeletedGenderKeys, 'gender');
  const civil  = makeOptionHelpers(setCivilRows,  setDeletedCivilKeys,  'civil');

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#F2F2F7]" style={{ animation: 'overlaySlideUp 0.32s cubic-bezier(0.32,0.72,0,1) both' }}>
      <style>{`@keyframes overlaySlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
      {/* Nav */}
      <div className="flex items-center justify-between px-4 pt-14 pb-4 shrink-0 bg-white border-b border-black/[0.06]">
        <button
          onClick={onClose}
          className="p-2.5 rounded-2xl bg-gray-100 text-[#1C1C1E] active:opacity-70 transition-opacity"
        >
          <ChevronLeft size={20} />
        </button>

        <h1 className="text-[#1C1C1E] font-bold text-base">Dropdown Settings</h1>

        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-[#C03D25] text-white text-sm font-bold shadow-md active:scale-95 transition-all disabled:opacity-50"
        >
          <Save size={14} />
          {saving ? 'Saving…' : savedMsg ? 'Saved!' : 'Save'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-10 space-y-4">
        {(loadError || saveError) && (
          <div className="rounded-2xl px-4 py-3 text-xs text-[#FF3B30] font-medium" style={{ background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.2)' }}>
            {loadError || saveError}
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={32} className="text-[#C03D25] animate-spin" />
          </div>
        ) : (
          <>
            {/* ── Reservation Fee card ── */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[#8E8E93] px-1 mb-2">
                Reservation Fee
              </p>
              <div className="rounded-3xl overflow-hidden" style={cardStyle}>
                <div className="flex items-center px-4 py-3 border-b border-black/[0.06] bg-[#F9FAFB]">
                  <span className="flex-1 text-xs font-bold uppercase tracking-widest text-[#8E8E93]">
                    Unit Type
                  </span>
                  <span className="w-40 text-xs font-bold uppercase tracking-widest text-[#8E8E93] text-right pr-9">
                    Fee
                  </span>
                </div>

                {feeRows.map((row) => (
                  <div key={row.key} className="flex items-center px-4 py-3 gap-3 border-b border-black/[0.06]">
                    <input
                      type="text"
                      value={row.unitType}
                      onChange={(e) =>
                        setFeeRows((prev) => prev.map((r) =>
                          r.key === row.key ? { ...r, unitType: e.target.value } : r
                        ))
                      }
                      placeholder="Unit type name"
                      className={overlayInputCls + ' flex-1'}
                    />
                    <div className="w-40 flex items-center gap-1">
                      <span className="text-[#8E8E93] text-sm shrink-0">₱</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.fee}
                        onChange={(e) => updateFee(row.key, e.target.value)}
                        onFocus={() => handleFeeFocus(row.key)}
                        onBlur={() => handleFeeBlur(row.key)}
                        placeholder="0.00"
                        className={overlayInputCls + ' text-right'}
                      />
                    </div>
                    <button
                      onClick={() => deleteFeeRow(row)}
                      className="p-2 rounded-xl text-[#FF3B30] bg-[#FF3B30]/10 active:bg-[#FF3B30]/20 transition-colors shrink-0"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}

                <button
                  onClick={addFeeRow}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 text-[#C03D25] text-sm font-semibold active:bg-black/[0.03] transition-colors"
                >
                  <Plus size={16} />
                  Add Unit Type
                </button>
              </div>
            </div>

            {/* ── Sales Position card ── */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[#8E8E93] px-1 mb-2">
                Sales Position
              </p>
              <div className="rounded-3xl overflow-hidden" style={cardStyle}>
                <div className="flex items-center px-4 py-3 border-b border-black/[0.06] bg-[#F9FAFB]">
                  <span className="flex-1 text-xs font-bold uppercase tracking-widest text-[#8E8E93]">
                    Position
                  </span>
                  <span className="w-36 text-xs font-bold uppercase tracking-widest text-[#8E8E93] text-right pr-9">
                    Code
                  </span>
                </div>

                {posRows.map((row) => (
                  <div key={row.key} className="flex items-center px-4 py-3 gap-3 border-b border-black/[0.06]">
                    <input
                      type="text"
                      value={row.position}
                      onChange={(e) =>
                        setPosRows((prev) => prev.map((r) =>
                          r.key === row.key ? { ...r, position: e.target.value } : r
                        ))
                      }
                      placeholder="Position name"
                      className={overlayInputCls + ' flex-1'}
                    />
                    <div className="w-36">
                      <input
                        type="text"
                        value={row.positionCode}
                        onChange={(e) =>
                          setPosRows((prev) => prev.map((r) =>
                            r.key === row.key ? { ...r, positionCode: e.target.value } : r
                          ))
                        }
                        placeholder="e.g. SA"
                        className={overlayInputCls + ' text-right'}
                      />
                    </div>
                    <button
                      onClick={() => deletePosRow(row)}
                      className="p-2 rounded-xl text-[#FF3B30] bg-[#FF3B30]/10 active:bg-[#FF3B30]/20 transition-colors shrink-0"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}

                <button
                  onClick={addPosRow}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 text-[#C03D25] text-sm font-semibold active:bg-black/[0.03] transition-colors"
                >
                  <Plus size={16} />
                  Add Position
                </button>
              </div>
            </div>

            {/* ── Personal Info section ── */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[#8E8E93] px-1 mb-2">
                Personal Info
              </p>
              <div className="space-y-3">

                {/* Gender */}
                <div className="rounded-3xl overflow-hidden" style={cardStyle}>
                  <div className="flex items-center px-4 py-3 border-b border-black/[0.06] bg-[#F9FAFB]">
                    <span className="flex-1 text-xs font-bold uppercase tracking-widest text-[#8E8E93]">
                      Gender
                    </span>
                  </div>
                  {genderRows.map((row) => (
                    <div key={row.key} className="flex items-center px-4 py-3 gap-3 border-b border-black/[0.06]">
                      <input
                        type="text"
                        value={row.value}
                        onChange={(e) =>
                          setGenderRows((prev) => prev.map((r) =>
                            r.key === row.key ? { ...r, value: e.target.value } : r
                          ))
                        }
                        placeholder="e.g. Non-Binary"
                        className={overlayInputCls + ' flex-1'}
                      />
                      <button
                        onClick={() => gender.deleteRow(row)}
                        className="p-2 rounded-xl text-[#FF3B30] bg-[#FF3B30]/10 active:bg-[#FF3B30]/20 transition-colors shrink-0"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={gender.addRow}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 text-[#C03D25] text-sm font-semibold active:bg-black/[0.03] transition-colors"
                  >
                    <Plus size={16} />
                    Add Gender
                  </button>
                </div>

                {/* Civil Status */}
                <div className="rounded-3xl overflow-hidden" style={cardStyle}>
                  <div className="flex items-center px-4 py-3 border-b border-black/[0.06] bg-[#F9FAFB]">
                    <span className="flex-1 text-xs font-bold uppercase tracking-widest text-[#8E8E93]">
                      Civil Status
                    </span>
                  </div>
                  {civilRows.map((row) => (
                    <div key={row.key} className="flex items-center px-4 py-3 gap-3 border-b border-black/[0.06]">
                      <input
                        type="text"
                        value={row.value}
                        onChange={(e) =>
                          setCivilRows((prev) => prev.map((r) =>
                            r.key === row.key ? { ...r, value: e.target.value } : r
                          ))
                        }
                        placeholder="e.g. Annulled"
                        className={overlayInputCls + ' flex-1'}
                      />
                      <button
                        onClick={() => civil.deleteRow(row)}
                        className="p-2 rounded-xl text-[#FF3B30] bg-[#FF3B30]/10 active:bg-[#FF3B30]/20 transition-colors shrink-0"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={civil.addRow}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 text-[#C03D25] text-sm font-semibold active:bg-black/[0.03] transition-colors"
                  >
                    <Plus size={16} />
                    Add Civil Status
                  </button>
                </div>

              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── VAT Settings Overlay ────────────────────────────────────────────── */
interface VatRow {
  key: string;
  originalProductType: string;
  productType: string;
  threshold: string;
  isNew: boolean;
}

function fmtThreshold(num: number): string {
  return num === 0 ? '' : num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function VatSettingsOverlay({ onClose }: { onClose: () => void }) {
  const [rows, setRows]           = useState<VatRow[]>([]);
  const [deletedKeys, setDeletedKeys] = useState<string[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [savedMsg, setSavedMsg]   = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const records = await fetchVatSettings();
      setRows(records.map(r => ({
        key: r.product_type,
        originalProductType: r.product_type,
        productType: r.product_type,
        threshold: fmtThreshold(Number(r.vat_threshold)),
        isNew: false,
      })));
      setDeletedKeys([]);
    } catch (e: any) { console.error('[vat-settings] load error:', e); setLoadError(e?.message ?? 'Failed to load VAT settings.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      // Delete removed + renamed original PKs
      const renamedKeys = rows
        .filter(r => !r.isNew && r.originalProductType !== r.productType.trim())
        .map(r => r.originalProductType);
      await deleteVatSettings([...deletedKeys, ...renamedKeys]);

      const records: VatSettingRecord[] = rows
        .filter(r => r.productType.trim() !== '')
        .map(r => ({
          product_type: r.productType.trim(),
          vat_threshold: parseFloat(r.threshold.replace(/,/g, '')) || 0,
        }));
      await saveVatSettings(records);

      await load();
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2000);
    } catch (e: any) { console.error('[vat-settings] save error:', e); setSaveError(e?.message ?? 'Failed to save VAT settings.'); }
    finally { setSaving(false); }
  };

  const updateThreshold = (key: string, value: string) =>
    setRows(prev => prev.map(r => r.key === key ? { ...r, threshold: value } : r));

  const handleThresholdFocus = (key: string) =>
    setRows(prev => prev.map(r => r.key === key ? { ...r, threshold: r.threshold.replace(/,/g, '') } : r));

  const handleThresholdBlur = (key: string) =>
    setRows(prev => prev.map(r => {
      if (r.key !== key) return r;
      const raw = r.threshold.replace(/,/g, '');
      if (raw === '') return r;
      const num = parseFloat(raw);
      return { ...r, threshold: isNaN(num) ? r.threshold : fmtThreshold(num) };
    }));

  const deleteRow = (row: VatRow) => {
    setRows(prev => prev.filter(r => r.key !== row.key));
    if (!row.isNew) setDeletedKeys(prev => [...prev, row.originalProductType]);
  };

  const addRow = () => {
    const key = `new-vat-${Date.now()}`;
    setRows(prev => [...prev, { key, originalProductType: '', productType: '', threshold: '', isNew: true }]);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#F2F2F7]" style={{ animation: 'overlaySlideUp 0.32s cubic-bezier(0.32,0.72,0,1) both' }}>
      <style>{`@keyframes overlaySlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
      {/* Nav */}
      <div className="flex items-center justify-between px-4 pt-14 pb-4 shrink-0 bg-white border-b border-black/[0.06]">
        <button onClick={onClose} className="p-2.5 rounded-2xl bg-gray-100 text-[#1C1C1E] active:opacity-70 transition-opacity">
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-[#1C1C1E] font-bold text-base">VAT Settings</h1>
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-[#C03D25] text-white text-sm font-bold shadow-md active:scale-95 transition-all disabled:opacity-50"
        >
          <Save size={14} />
          {saving ? 'Saving…' : savedMsg ? 'Saved!' : 'Save'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-10 space-y-4">
        {(loadError || saveError) && (
          <div className="rounded-2xl px-4 py-3 text-xs text-[#FF3B30] font-medium" style={{ background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.2)' }}>
            {loadError || saveError}
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={32} className="text-[#C03D25] animate-spin" />
          </div>
        ) : (
          <>
            {/* Info note */}
            <div className="rounded-2xl px-4 py-3 text-xs text-[#6C6C70]" style={{ background: 'rgba(192,61,37,0.06)', border: '1px solid rgba(192,61,37,0.12)' }}>
              <span className="font-semibold text-[#C03D25]">Rule: </span>
              If Net List Price &gt; threshold → 12% VAT applies. If NLP ≤ threshold → VAT exempt. Product types with no entry will block computation.
            </div>

            {/* Table */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[#8E8E93] px-1 mb-2">Product Types</p>
              <div className="rounded-3xl overflow-hidden" style={cardStyle}>
                <div className="flex items-center px-4 py-3 border-b border-black/[0.06] bg-[#F9FAFB]">
                  <span className="flex-1 text-xs font-bold uppercase tracking-widest text-[#8E8E93]">Product Type</span>
                  <span className="w-44 text-xs font-bold uppercase tracking-widest text-[#8E8E93] text-right pr-9">NLP Threshold</span>
                </div>

                {rows.length === 0 && (
                  <p className="text-xs text-[#8E8E93] text-center py-5 px-4">
                    No product types configured. Tap below to add one.
                  </p>
                )}

                {rows.map(row => (
                  <div key={row.key} className="flex items-center px-4 py-3 gap-3 border-b border-black/[0.06]">
                    <input
                      type="text"
                      value={row.productType}
                      onChange={e => setRows(prev => prev.map(r => r.key === row.key ? { ...r, productType: e.target.value } : r))}
                      placeholder="e.g. RFO"
                      className={overlayInputCls + ' flex-1'}
                    />
                    <div className="w-44 flex items-center gap-1">
                      <span className="text-[#8E8E93] text-sm shrink-0">₱</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.threshold}
                        onChange={e => updateThreshold(row.key, e.target.value)}
                        onFocus={() => handleThresholdFocus(row.key)}
                        onBlur={() => handleThresholdBlur(row.key)}
                        placeholder="0.00"
                        className={overlayInputCls + ' text-right'}
                      />
                    </div>
                    <button
                      onClick={() => deleteRow(row)}
                      className="p-2 rounded-xl text-[#FF3B30] bg-[#FF3B30]/10 active:bg-[#FF3B30]/20 transition-colors shrink-0"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}

                <button
                  onClick={addRow}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 text-[#C03D25] text-sm font-semibold active:bg-black/[0.03] transition-colors"
                >
                  <Plus size={16} />
                  Add Product Type
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── HIC Settings Overlay ────────────────────────────────────────────── */
interface HicRow {
  key: string;
  originalProductType: string;
  productType: string;
  target: string;
  isNew: boolean;
}

function fmtTarget(num: number): string {
  return num === 0 ? '' : num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function HicSettingsOverlay({ onClose }: { onClose: () => void }) {
  const [rows, setRows]             = useState<HicRow[]>([]);
  const [deletedKeys, setDeletedKeys] = useState<string[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [savedMsg, setSavedMsg]     = useState(false);
  const [loadError, setLoadError]   = useState('');
  const [saveError, setSaveError]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const records = await fetchHicSettings();
      console.log('[hic-settings] loaded:', records);
      setRows(records.map(r => ({
        key: r.product_type,
        originalProductType: r.product_type,
        productType: r.product_type,
        target: fmtTarget(Number(r.hic_target)),
        isNew: false,
      })));
      setDeletedKeys([]);
    } catch (e: any) {
      console.error('[hic-settings] load error:', e);
      setLoadError(e?.message ?? 'Failed to load HIC settings.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const renamedKeys = rows
        .filter(r => !r.isNew && r.originalProductType !== r.productType.trim())
        .map(r => r.originalProductType);
      await deleteHicSettings([...deletedKeys, ...renamedKeys]);

      const records: HicSettingRecord[] = rows
        .filter(r => r.productType.trim() !== '')
        .map(r => ({
          product_type: r.productType.trim(),
          hic_target: parseFloat(r.target.replace(/,/g, '')) || 0,
        }));
      console.log('[hic-settings] saving:', records);
      await saveHicSettings(records);

      await load();
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2000);
    } catch (e: any) {
      console.error('[hic-settings] save error:', e);
      setSaveError(e?.message ?? 'Failed to save HIC settings.');
    } finally { setSaving(false); }
  };

  const updateTarget = (key: string, value: string) =>
    setRows(prev => prev.map(r => r.key === key ? { ...r, target: value } : r));

  const handleTargetFocus = (key: string) =>
    setRows(prev => prev.map(r => r.key === key ? { ...r, target: r.target.replace(/,/g, '') } : r));

  const handleTargetBlur = (key: string) =>
    setRows(prev => prev.map(r => {
      if (r.key !== key) return r;
      const raw = r.target.replace(/,/g, '');
      if (raw === '') return r;
      const num = parseFloat(raw);
      return { ...r, target: isNaN(num) ? r.target : fmtTarget(num) };
    }));

  const deleteRow = (row: HicRow) => {
    setRows(prev => prev.filter(r => r.key !== row.key));
    if (!row.isNew) setDeletedKeys(prev => [...prev, row.originalProductType]);
  };

  const addRow = () => {
    const key = `new-hic-${Date.now()}`;
    setRows(prev => [...prev, { key, originalProductType: '', productType: '', target: '', isNew: true }]);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#F2F2F7]" style={{ animation: 'overlaySlideUp 0.32s cubic-bezier(0.32,0.72,0,1) both' }}>
      <style>{`@keyframes overlaySlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
      {/* Nav */}
      <div className="flex items-center justify-between px-4 pt-14 pb-4 shrink-0 bg-white border-b border-black/[0.06]">
        <button onClick={onClose} className="p-2.5 rounded-2xl bg-gray-100 text-[#1C1C1E] active:opacity-70 transition-opacity">
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-[#1C1C1E] font-bold text-base">HIC Settings</h1>
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-[#C03D25] text-white text-sm font-bold shadow-md active:scale-95 transition-all disabled:opacity-50"
        >
          <Save size={14} />
          {saving ? 'Saving…' : savedMsg ? 'Saved!' : 'Save'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-10 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={32} className="text-[#C03D25] animate-spin" />
          </div>
        ) : (
          <>
            {/* Info note */}
            <div className="rounded-2xl px-4 py-3 text-xs text-[#6C6C70]" style={{ background: 'rgba(192,61,37,0.06)', border: '1px solid rgba(192,61,37,0.12)' }}>
              <span className="font-semibold text-[#C03D25]">Rule: </span>
              The HIC discount reduces the Net List Price down to the target amount. Units with no HIC entry will not show the HIC option in the payment calculator.
            </div>

            {loadError && (
              <div className="rounded-2xl px-4 py-3 text-xs text-[#FF3B30] font-medium" style={{ background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.2)' }}>
                Load error: {loadError}
              </div>
            )}
            {saveError && (
              <div className="rounded-2xl px-4 py-3 text-xs text-[#FF3B30] font-medium" style={{ background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.2)' }}>
                Save error: {saveError}
              </div>
            )}

            {/* Table */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[#8E8E93] px-1 mb-2">Product Types</p>
              <div className="rounded-3xl overflow-hidden" style={cardStyle}>
                <div className="flex items-center px-4 py-3 border-b border-black/[0.06] bg-[#F9FAFB]">
                  <span className="flex-1 text-xs font-bold uppercase tracking-widest text-[#8E8E93]">Product Type</span>
                  <span className="w-44 text-xs font-bold uppercase tracking-widest text-[#8E8E93] text-right pr-9">HIC Target</span>
                </div>

                {rows.length === 0 && (
                  <p className="text-xs text-[#8E8E93] text-center py-5 px-4">
                    No product types configured. Tap below to add one.
                  </p>
                )}

                {rows.map(row => (
                  <div key={row.key} className="flex items-center px-4 py-3 gap-3 border-b border-black/[0.06]">
                    <input
                      type="text"
                      value={row.productType}
                      onChange={e => setRows(prev => prev.map(r => r.key === row.key ? { ...r, productType: e.target.value } : r))}
                      placeholder="e.g. RFO"
                      className={overlayInputCls + ' flex-1'}
                    />
                    <div className="w-44 flex items-center gap-1">
                      <span className="text-[#8E8E93] text-sm shrink-0">₱</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.target}
                        onChange={e => updateTarget(row.key, e.target.value)}
                        onFocus={() => handleTargetFocus(row.key)}
                        onBlur={() => handleTargetBlur(row.key)}
                        placeholder="0.00"
                        className={overlayInputCls + ' text-right'}
                      />
                    </div>
                    <button
                      onClick={() => deleteRow(row)}
                      className="p-2 rounded-xl text-[#FF3B30] bg-[#FF3B30]/10 active:bg-[#FF3B30]/20 transition-colors shrink-0"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}

                <button
                  onClick={addRow}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 text-[#C03D25] text-sm font-semibold active:bg-black/[0.03] transition-colors"
                >
                  <Plus size={16} />
                  Add Product Type
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Access Rights Overlay ───────────────────────────────────────────── */

const ROLE_ICONS: { key: string; Icon: LucideIcon }[] = [
  { key: 'Users',       Icon: Users },
  { key: 'Crown',       Icon: Crown },
  { key: 'UserPlus',    Icon: UserPlus },
  { key: 'DollarSign',  Icon: DollarSign },
  { key: 'Network',     Icon: Network },
  { key: 'FileCheck',   Icon: FileCheck },
  { key: 'Building2',   Icon: Building2 },
  { key: 'ShieldCheck', Icon: ShieldCheck },
  { key: 'Briefcase',   Icon: Briefcase },
  { key: 'Globe',       Icon: Globe },
  { key: 'KeyRound',    Icon: KeyRound },
  { key: 'Eye',         Icon: Eye },
];

function getRoleIcon(id: number | null): LucideIcon {
  if (id === null) return ShieldCheck;
  return ROLE_ICONS[(id - 1) % ROLE_ICONS.length].Icon;
}

interface RoleRow {
  key: string;
  id: number | null;
  roleName: string;
  description: string;
  color: string;
  sortOrder: number;
  isNew: boolean;
}

function SortableRoleRow({
  row, isExpanded, onToggle, onUpdate, onDelete,
}: {
  row: RoleRow;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<RoleRow>) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.key });

  const RoleIcon = getRoleIcon(row.id);

  const wrapStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 20 : undefined,
  };

  return (
    <div ref={setNodeRef} style={wrapStyle}>
      <div
        className="rounded-3xl overflow-hidden"
        style={{
          ...cardStyle,
          boxShadow: isDragging
            ? '0 8px 32px rgba(0,0,0,0.18)'
            : '0 2px 12px rgba(0,0,0,0.06)',
        }}
      >
        {/* Header row */}
        <div className="flex items-center gap-3 px-4 py-3.5">
          {/* Drag handle */}
          <div
            className="touch-none shrink-0 cursor-grab active:cursor-grabbing p-1 -ml-1 rounded-lg active:bg-black/[0.04]"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={16} className="text-[#C7C7CC]" />
          </div>

          {/* Icon avatar */}
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 bg-[#C03D25]/10">
            <RoleIcon size={18} className="text-[#C03D25]" />
          </div>

          {/* Info — tap to expand */}
          <button
            type="button"
            onClick={onToggle}
            className="flex-1 flex items-center gap-3 text-left min-w-0"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-[#1C1C1E] truncate">
                  {row.roleName || <span className="text-[#C7C7CC] font-normal italic">Unnamed Role</span>}
                </p>
                {row.isNew && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">NEW</span>
                )}
              </div>
              {row.description && (
                <p className="text-xs text-[#8E8E93] truncate mt-0.5 leading-snug">{row.description}</p>
              )}
            </div>

            <ChevronRight
              size={15}
              className="text-[#C7C7CC] shrink-0 transition-transform duration-200"
              style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
            />
          </button>
        </div>

        {/* Expanded editor */}
        {isExpanded && (
          <div className="border-t border-black/[0.07] px-4 py-4 space-y-4 bg-[#FAFAFA]">

            {/* Role ID */}
            {row.id && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider">Role ID</p>
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#F2F2F7] border border-black/[0.06]">
                  <span className="text-sm font-mono font-bold text-[#1C1C1E]">{row.id}</span>
                  <span className="text-[10px] text-[#C7C7CC] ml-auto">read-only · used for assignment</span>
                </div>
              </div>
            )}

            {/* Role Name */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider">Role Name</p>
              <input
                type="text"
                value={row.roleName}
                onChange={e => onUpdate({ roleName: e.target.value })}
                placeholder="e.g. Sales Manager"
                className={overlayInputCls}
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider">Description</p>
              <textarea
                value={row.description}
                onChange={e => onUpdate({ description: e.target.value })}
                placeholder="Describe what this role can see and do in the app…"
                rows={3}
                className={overlayInputCls + ' resize-none'}
              />
            </div>

            {/* Delete */}
            <div className="pt-1 border-t border-black/[0.06]">
              <button
                type="button"
                onClick={onDelete}
                className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-[#FF3B30] bg-[#FF3B30]/10 border border-[#FF3B30]/20 text-xs font-semibold active:opacity-70 transition-opacity"
              >
                <Trash2 size={13} />
                Delete Role
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AccessRightsOverlay({ onClose }: { onClose: () => void }) {
  const [rows, setRows]         = useState<RoleRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [deletedIds, setDeletedIds] = useState<number[]>([]);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [loadError, setLoadError]     = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const records = await fetchAccessRoles();
      setRows(records.map(r => ({
        key:         String(r.id),
        id:          r.id,
        roleName:    r.role_name,
        description: r.description ?? '',
        color:       r.color,
        sortOrder:   r.sort_order,
        isNew:       false,
      })));
      setDeletedIds([]);
    } catch (e: any) {
      console.error(e);
      setLoadError(e?.message ?? String(e));
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setRows(prev => {
      const oldIdx = prev.findIndex(r => r.key === active.id);
      const newIdx = prev.findIndex(r => r.key === over.id);
      const reordered = arrayMove(prev, oldIdx, newIdx);
      return reordered.map((r, i) => ({ ...r, sortOrder: i + 1 }));
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const id of deletedIds) await deleteAccessRole(id);
      for (const row of rows) {
        await saveAccessRole({
          id:          row.id ?? undefined,
          role_name:   row.roleName.trim() || 'Unnamed Role',
          description: row.description.trim() || null,
          color:       row.color,
          sort_order:  row.sortOrder,
        });
      }
      await load();
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2000);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const addRow = () => {
    const key = `new-${Date.now()}`;
    setRows(prev => [...prev, {
      key, id: null, roleName: '', description: '', color: '#C03D25',
      sortOrder: (prev[prev.length - 1]?.sortOrder ?? 0) + 1,
      isNew: true,
    }]);
    setExpandedKey(key);
  };

  const deleteRow = (row: RoleRow) => {
    setRows(prev => prev.filter(r => r.key !== row.key));
    if (row.id) setDeletedIds(prev => [...prev, row.id!]);
    if (expandedKey === row.key) setExpandedKey(null);
  };

  const updateRow = (key: string, patch: Partial<RoleRow>) =>
    setRows(prev => prev.map(r => r.key === key ? { ...r, ...patch } : r));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#F2F2F7]" style={{ animation: 'overlaySlideUp 0.32s cubic-bezier(0.32,0.72,0,1) both' }}>
      <style>{`@keyframes overlaySlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

      {/* Nav */}
      <div className="flex items-center justify-between px-4 pt-14 pb-4 shrink-0 bg-white border-b border-black/[0.06]">
        <button onClick={onClose} className="p-2.5 rounded-2xl bg-gray-100 text-[#1C1C1E] active:opacity-70 transition-opacity">
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-[#1C1C1E] font-bold text-base">Access Rights</h1>
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-[#C03D25] text-white text-sm font-bold shadow-md active:scale-95 transition-all disabled:opacity-50"
        >
          <Save size={14} />
          {saving ? 'Saving…' : savedMsg ? 'Saved!' : 'Save'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-10 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={32} className="text-[#C03D25] animate-spin" />
          </div>
        ) : loadError ? (
          <div className="rounded-2xl px-4 py-4 space-y-1" style={{ background: 'rgba(255,59,48,0.06)', border: '1px solid rgba(255,59,48,0.2)' }}>
            <p className="text-xs font-bold text-[#FF3B30]">Failed to load roles</p>
            <p className="text-xs text-[#6C6C70] font-mono break-all">{loadError}</p>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-2xl" style={{ background: 'rgba(192,61,37,0.05)', border: '1px solid rgba(192,61,37,0.12)' }}>
              <ShieldCheck size={14} className="text-[#C03D25] mt-0.5 shrink-0" />
              <p className="text-xs text-[#6C6C70] leading-relaxed">
                Drag the grip handle to reorder roles. Tap a role card to edit its name, description, and color. Changes take effect after saving.
              </p>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={rows.map(r => r.key)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {rows.length === 0 && (
                    <div className="rounded-3xl py-10 flex flex-col items-center gap-2" style={cardStyle}>
                      <ShieldCheck size={28} className="text-[#C7C7CC]" />
                      <p className="text-sm text-[#8E8E93]">No roles yet. Add one below.</p>
                    </div>
                  )}
                  {rows.map(row => (
                    <SortableRoleRow
                      key={row.key}
                      row={row}
                      isExpanded={expandedKey === row.key}
                      onToggle={() => setExpandedKey(expandedKey === row.key ? null : row.key)}
                      onUpdate={patch => updateRow(row.key, patch)}
                      onDelete={() => deleteRow(row)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            <button
              onClick={addRow}
              className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-3xl text-[#C03D25] text-sm font-semibold border-2 border-dashed border-[#C03D25]/30 active:bg-[#C03D25]/5 transition-colors"
            >
              <Plus size={16} />
              Add Role
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── User Management ────────────────────────────────────────────────── */

interface UserProfile {
  id: string;
  full_name: string;
  display_name: string | null;
  email: string;
  role_id: number | null;
  seller_id: string | null;
  created_at: string;
  access_roles: { role_name: string } | null;
}

function getInitialsUM(name: string) {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function UserManagementOverlay({ onClose }: { onClose: () => void }) {
  const [users, setUsers]           = useState<UserProfile[]>([]);
  const [roles, setRoles]           = useState<{ id: number; role_name: string }[]>([]);
  const [loading, setLoading]       = useState(true);
  const [loadError, setLoadError]   = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser]     = useState<UserProfile | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true); setLoadError(null);
    try {
      const [usersRes, rolesRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetchAccessRoles(),
      ]);
      const { users: u, error } = await usersRes.json();
      if (error) throw new Error(error);
      setUsers(u ?? []);
      setRoles(rolesRes.map(r => ({ id: r.id, role_name: r.role_name })));
    } catch (e: any) {
      setLoadError(e.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#F2F2F7]" style={{ animation: 'overlaySlideUp 0.32s cubic-bezier(0.32,0.72,0,1) both' }}>
      <style>{`@keyframes overlaySlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

      {/* Nav */}
      <div className="flex items-center justify-between px-4 pt-14 pb-4 shrink-0 bg-white border-b border-black/[0.06]">
        <button onClick={onClose} className="p-2.5 rounded-2xl bg-gray-100 text-[#1C1C1E] active:opacity-70">
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-[#1C1C1E] font-bold text-base">User Management</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-[#C03D25] text-white text-sm font-bold shadow-md active:scale-95 transition-all"
        >
          <Plus size={14} />
          Add User
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-10 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={32} className="text-[#C03D25] animate-spin" />
          </div>
        ) : loadError ? (
          <div className="rounded-2xl px-4 py-4" style={{ background: 'rgba(255,59,48,0.06)', border: '1px solid rgba(255,59,48,0.2)' }}>
            <p className="text-xs font-bold text-[#FF3B30]">{loadError}</p>
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-3xl py-10 flex flex-col items-center gap-2" style={cardStyle}>
            <Users size={28} className="text-[#C7C7CC]" />
            <p className="text-sm text-[#8E8E93]">No users yet. Add one above.</p>
          </div>
        ) : (
          users.map(u => (
            <button
              key={u.id}
              type="button"
              onClick={() => setEditUser(u)}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-3xl text-left active:scale-[0.98] transition-all"
              style={cardStyle}
            >
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 bg-[#C03D25]/10">
                <span className="text-sm font-bold text-[#C03D25]">{getInitialsUM(u.full_name || u.email)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#1C1C1E] truncate">
                  {u.display_name || u.full_name || '—'}
                </p>
                <p className="text-xs text-[#8E8E93] truncate">{u.email}</p>
              </div>
              {u.access_roles?.role_name ? (
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#C03D25]/10 text-[#C03D25] shrink-0">
                  {u.access_roles.role_name}
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#F2F2F7] text-[#8E8E93] shrink-0">
                  No Role
                </span>
              )}
              <ChevronRight size={15} className="text-[#C7C7CC] shrink-0" />
            </button>
          ))
        )}
      </div>

      {/* Create User Sheet */}
      {showCreate && (
        <CreateUserSheet
          roles={roles}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadUsers(); }}
        />
      )}

      {/* Edit User Sheet */}
      {editUser && (
        <EditUserSheet
          user={editUser}
          roles={roles}
          onClose={() => setEditUser(null)}
          onSaved={() => { setEditUser(null); loadUsers(); }}
        />
      )}
    </div>
  );
}

function CreateUserSheet({
  roles, onClose, onCreated,
}: { roles: { id: number; role_name: string }[]; onClose: () => void; onCreated: () => void }) {
  const [fullName,     setFullName]     = useState('');
  const [displayName,  setDisplayName]  = useState('');
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [showPass,     setShowPass]     = useState(false);
  const [roleId,       setRoleId]       = useState<number | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  async function handleCreate() {
    if (!fullName.trim() || !email.trim() || !password.trim()) {
      setError('Full name, email, and password are required.'); return;
    }
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName.trim(), display_name: displayName.trim() || null, email: email.trim(), password, role_id: roleId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to create user'); return; }
      onCreated();
    } catch (e: any) {
      setError(e.message ?? 'Server error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-60 flex items-end" style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full bg-white rounded-t-3xl px-5 pt-5 pb-10 space-y-4 max-h-[90vh] overflow-y-auto" style={{ animation: 'overlaySlideUp 0.28s cubic-bezier(0.32,0.72,0,1) both' }}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-[#1C1C1E]">Create User</h2>
          <button onClick={onClose} className="p-2 rounded-xl bg-[#F2F2F7] active:opacity-70"><X size={16} /></button>
        </div>

        <div className="space-y-1.5">
          <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider">Full Name</p>
          <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
            placeholder="e.g. Juan dela Cruz" className={overlayInputCls} />
        </div>

        <div className="space-y-1.5">
          <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider">Display Name <span className="normal-case font-normal text-[#C7C7CC]">optional</span></p>
          <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
            placeholder="e.g. Juan" className={overlayInputCls} />
          <p className="text-[10px] text-[#8E8E93] px-1">Shown in the app instead of full name</p>
        </div>

        <div className="space-y-1.5">
          <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider">Email</p>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="juan@company.com" className={overlayInputCls} />
        </div>

        <div className="space-y-1.5">
          <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider">Password</p>
          <div className="relative">
            <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Min. 8 characters" className={overlayInputCls + ' pr-10'} />
            <button type="button" onClick={() => setShowPass(p => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#C7C7CC] active:opacity-70">
              {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider">Role</p>
          <div className="space-y-2">
            {roles.map(r => (
              <button key={r.id} type="button" onClick={() => setRoleId(roleId === r.id ? null : r.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-colors text-left ${
                  roleId === r.id
                    ? 'bg-[#C03D25]/08 border-[#C03D25]/30'
                    : 'bg-[#F2F2F7] border-transparent'
                }`}>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  roleId === r.id ? 'border-[#C03D25] bg-[#C03D25]' : 'border-[#C7C7CC]'
                }`}>
                  {roleId === r.id && <Check size={11} className="text-white" />}
                </div>
                <span className={`text-sm font-medium ${roleId === r.id ? 'text-[#C03D25]' : 'text-[#1C1C1E]'}`}>
                  {r.role_name}
                </span>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-xs text-[#FF3B30] px-1">{error}</p>
        )}

        <button
          type="button"
          onClick={handleCreate}
          disabled={saving}
          className="w-full py-4 rounded-2xl bg-[#C03D25] text-white text-sm font-bold shadow-md active:opacity-80 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? <><Loader2 size={16} className="animate-spin" /> Creating…</> : 'Create Account'}
        </button>
      </div>
    </div>
  );
}

interface SellerLinkRecord {
  seller_name: string;
  seller_id: string | null;
  first_name: string | null;
  email_address: string | null;
  sales_director: string | null;
}

function EditUserSheet({
  user, roles, onClose, onSaved,
}: { user: UserProfile; roles: { id: number; role_name: string }[]; onClose: () => void; onSaved: () => void }) {
  const [fullName,      setFullName]      = useState(user.full_name ?? '');
  const [displayName,   setDisplayName]   = useState(user.display_name ?? '');
  const [roleId,        setRoleId]        = useState<number | null>(user.role_id);
  const [sellerId,      setSellerId]      = useState<string | null>(user.seller_id ?? null);
  const [saving,        setSaving]        = useState(false);
  const [deleting,      setDeleting]      = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  // Salesperson lookup for dropdown
  const [sellers,        setSellers]        = useState<SellerLinkRecord[]>([]);
  const [sellerSearch,   setSellerSearch]   = useState('');
  const [showSellerList, setShowSellerList] = useState(false);

  useEffect(() => {
    supabase.from('Salesperson')
      .select('"Seller Name", "Seller Id", "FIRST NAME", "Email Address", "Sales Director"')
      .order('"Seller Name"')
      .then(({ data }) => {
        setSellers((data ?? []).map((r: any) => ({
          seller_name:    r['Seller Name'],
          seller_id:      r['Seller Id'] ?? null,
          first_name:     r['FIRST NAME'] ?? null,
          email_address:  r['Email Address'] ?? null,
          sales_director: r['Sales Director'] ?? null,
        })));
      });
  }, []);

  const linkedSeller = sellerId ? (sellers.find(s => s.seller_id === sellerId) ?? null) : null;

  const filteredSellers = sellers.filter(s =>
    !sellerSearch.trim() ||
    s.seller_name.toLowerCase().includes(sellerSearch.toLowerCase()) ||
    (s.seller_id ?? '').toLowerCase().includes(sellerSearch.toLowerCase()) ||
    (s.email_address ?? '').toLowerCase().includes(sellerSearch.toLowerCase())
  );

  async function handleSaveRole() {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName.trim() || null, role_id: roleId, display_name: displayName.trim() || null, seller_id: sellerId }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error); return; }
      onSaved();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' });
      onSaved();
    } catch (e: any) { setError(e.message); }
    finally { setDeleting(false); }
  }

  return (
    <div className="fixed inset-0 z-60 flex items-end" style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full bg-white rounded-t-3xl px-5 pt-5 pb-10 space-y-4 max-h-[90vh] overflow-y-auto" style={{ animation: 'overlaySlideUp 0.28s cubic-bezier(0.32,0.72,0,1) both' }}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#C03D25]/10 flex items-center justify-center">
              <span className="text-sm font-bold text-[#C03D25]">{getInitialsUM(user.full_name || user.email)}</span>
            </div>
            <div>
              <p className="text-sm font-bold text-[#1C1C1E]">{user.full_name || '—'}</p>
              <p className="text-xs text-[#8E8E93]">{user.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-[#F2F2F7] active:opacity-70"><ChevronLeft size={16} /></button>
        </div>

        <div className="space-y-1.5">
          <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider">Full Name</p>
          <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
            placeholder="e.g. Juan dela Cruz" className={overlayInputCls} />
        </div>

        <div className="space-y-1.5">
          <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider">Display Name <span className="normal-case font-normal text-[#C7C7CC]">optional</span></p>
          <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
            placeholder="e.g. Juan" className={overlayInputCls} />
          <p className="text-[10px] text-[#8E8E93] px-1">Shown in the app instead of full name</p>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider">Assign Role</p>
          <div className="space-y-2">
            {roles.map(r => (
              <button key={r.id} type="button" onClick={() => setRoleId(roleId === r.id ? null : r.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-colors text-left ${
                  roleId === r.id
                    ? 'bg-[#C03D25]/08 border-[#C03D25]/30'
                    : 'bg-[#F2F2F7] border-transparent'
                }`}>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  roleId === r.id ? 'border-[#C03D25] bg-[#C03D25]' : 'border-[#C7C7CC]'
                }`}>
                  {roleId === r.id && <Check size={11} className="text-white" />}
                </div>
                <span className={`text-sm font-medium ${roleId === r.id ? 'text-[#C03D25]' : 'text-[#1C1C1E]'}`}>
                  {r.role_name}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Salesperson Record ── */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider">Salesperson Record</p>

          {linkedSeller ? (
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-green-50 border border-green-200">
              <Network size={16} className="text-green-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#1C1C1E] truncate">{linkedSeller.seller_name}</p>
                <p className="text-xs text-[#8E8E93] truncate">ID: {linkedSeller.seller_id}</p>
                {linkedSeller.sales_director && (
                  <p className="text-xs text-[#8E8E93] truncate">Director: {linkedSeller.sales_director}</p>
                )}
              </div>
              <button type="button" disabled={saving} onClick={async () => {
                setSaving(true); setError(null);
                try {
                  const res = await fetch(`/api/admin/users/${user.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ seller_id: null }),
                  });
                  if (!res.ok) { const d = await res.json(); setError(d.error); return; }
                  setSellerId(null);
                } catch (e: any) { setError(e.message); }
                finally { setSaving(false); }
              }}
                className="text-[10px] font-bold text-[#FF3B30] px-2.5 py-1 rounded-full bg-red-50 shrink-0 active:opacity-70 disabled:opacity-40">
                {saving ? '…' : 'Unlink'}
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setShowSellerList(v => !v)}
              className="w-full flex items-center gap-2 px-4 py-3 rounded-2xl bg-[#F2F2F7] border border-dashed border-black/10 text-sm text-[#8E8E93] active:opacity-70">
              <Network size={15} />
              {showSellerList ? 'Cancel' : 'Link to a Salesperson Record'}
            </button>
          )}

          {showSellerList && !linkedSeller && (
            <div className="space-y-2">
              <input
                type="text"
                value={sellerSearch}
                onChange={e => setSellerSearch(e.target.value)}
                placeholder="Search by name, ID, or email…"
                className={overlayInputCls}
                autoFocus
              />
              <div className="max-h-48 overflow-y-auto rounded-2xl border border-black/[0.08] divide-y divide-black/[0.05] bg-white">
                {filteredSellers.length === 0 ? (
                  <p className="text-xs text-[#8E8E93] text-center py-4">No results</p>
                ) : filteredSellers.map(s => (
                  <button
                    key={s.seller_id ?? s.seller_name}
                    type="button"
                    onClick={() => {
                      setSellerId(s.seller_id);
                      setFullName(s.seller_name);
                      if (s.first_name) setDisplayName(s.first_name);
                      setShowSellerList(false);
                      setSellerSearch('');
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-[#F2F2F7]"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#1C1C1E] truncate">{s.seller_name}</p>
                      <p className="text-xs text-[#8E8E93] truncate">{s.seller_id}{s.email_address ? ` · ${s.email_address}` : ''}</p>
                    </div>
                    <ChevronRight size={14} className="text-[#C7C7CC] shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-xs text-[#FF3B30] px-1">{error}</p>}

        <button type="button" onClick={handleSaveRole} disabled={saving}
          className="w-full py-4 rounded-2xl bg-[#C03D25] text-white text-sm font-bold active:opacity-80 disabled:opacity-50 flex items-center justify-center gap-2">
          {saving ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : 'Save Changes'}
        </button>

        <button type="button" onClick={() => setConfirmDelete(true)}
          className="w-full py-3.5 rounded-2xl bg-[#FF3B30]/10 text-[#FF3B30] text-sm font-semibold active:opacity-70">
          Delete Account
        </button>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-70 flex items-end" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full bg-white rounded-t-3xl px-6 pt-6 pb-10 space-y-5">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center">
                <Trash2 size={22} className="text-red-500" />
              </div>
              <p className="text-base font-bold text-[#1C1C1E]">Delete Account?</p>
              <p className="text-sm text-[#6C6C70]">This will permanently delete {user.full_name || user.email}'s account.</p>
            </div>
            <button type="button" onClick={handleDelete} disabled={deleting}
              className="w-full py-3.5 rounded-2xl bg-red-500 text-white text-sm font-bold active:opacity-80 disabled:opacity-50">
              {deleting ? 'Deleting…' : 'Yes, Delete'}
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)}
              className="w-full py-3.5 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] text-sm font-semibold">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Check Due Dates overlay ────────────────────────────────────────── */

interface ResSummary {
  reservation_id: string;
  client_name: string;
  inventory_code: string;
  payment_scheme: string;
  first_payment_agreed: boolean;
  line_count: number;
  first_due: string;
  last_due: string;
}

function CheckDueDatesOverlay({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'all' | 'single'>('single');

  // Single mode
  const [query,        setQuery]        = useState('');
  const [suggestions,  setSuggestions]  = useState<{ reservation_id: string; client_name: string; inventory_code: string }[]>([]);
  const [showSug,      setShowSug]      = useState(false);
  const [sugLoading,   setSugLoading]   = useState(false);
  const sugTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading,            setLoading]           = useState(false);
  const [lines,              setLines]             = useState<ReceivableLine[] | null>(null);
  const [expected,           setExpected]          = useState<ExpectedLine[] | null>(null);
  const [singleFpa,          setSingleFpa]         = useState<boolean>(false);
  const [singleError,        setSingleError]       = useState<string | null>(null);
  const [previewing,      setPreviewing]      = useState(false);
  const [repairPreview,   setRepairPreview]   = useState<RepairPreviewItem[] | null>(null);
  const [selectedFixes,   setSelectedFixes]   = useState<Set<string>>(new Set());
  const [repairing,       setRepairing]       = useState(false);
  const [repairResult,    setRepairResult]     = useState<RepairResult | null>(null);
  const [repairError,     setRepairError]      = useState<string | null>(null);
  const [lastCheckedId,   setLastCheckedId]   = useState<string | null>(null);

  // All mode
  const [allLoading,  setAllLoading]  = useState(false);
  const [summaries,   setSummaries]   = useState<ResSummary[] | null>(null);
  const [allError,    setAllError]    = useState<string | null>(null);
  const [expandedId,       setExpandedId]       = useState<string | null>(null);
  const [expandLines,      setExpandLines]      = useState<ReceivableLine[]>([]);
  const [expandExpected,   setExpandExpected]   = useState<ExpectedLine[]>([]);
  const [expandLoading,    setExpandLoading]    = useState(false);
  const [checkedIds,       setCheckedIds]       = useState<Map<string, 'ok' | 'issues'>>(new Map());
  const [checkingAll,      setCheckingAll]      = useState(false);
  const [checkAllProgress, setCheckAllProgress] = useState({ current: 0, total: 0 });

  function handleQueryChange(val: string) {
    setQuery(val);
    setLines(null);
    setSingleError(null);
    if (sugTimerRef.current) clearTimeout(sugTimerRef.current);
    if (!val.trim()) { setSuggestions([]); setShowSug(false); return; }
    sugTimerRef.current = setTimeout(async () => {
      setSugLoading(true);
      const q = val.trim().toUpperCase();
      const { data } = await supabase
        .from('reservations')
        .select('reservation_id, client_name, inventory_code')
        .or(`reservation_id.ilike.%${q}%,client_name.ilike.%${val.trim()}%,inventory_code.ilike.%${q}%`)
        .limit(8);
      setSuggestions((data ?? []) as { reservation_id: string; client_name: string; inventory_code: string }[]);
      setShowSug(true);
      setSugLoading(false);
    }, 280);
  }

  async function loadSchedule(id: string) {
    setQuery(id);
    setShowSug(false);
    setSuggestions([]);
    setLoading(true); setSingleError(null); setLines(null); setExpected(null); setSingleFpa(false);
    setRepairResult(null); setRepairError(null); setLastCheckedId(id);
    try {
      const [result, exp, resRow] = await Promise.all([
        fetchReceivableLines(id),
        computeExpectedSchedule(id),
        supabase.from('reservations').select('first_payment_agreed').eq('reservation_id', id).single(),
      ]);
      if (result.length === 0) setSingleError(`No collection schedule found for ${id}.`);
      else {
        setLines(result);
        setExpected(exp);
        setSingleFpa(!!(resRow.data as any)?.first_payment_agreed);
      }
    } catch (e: any) {
      setSingleError(e?.message ?? 'Fetch failed');
    } finally {
      setLoading(false);
    }
  }

  async function handlePreviewRepair() {
    if (!lastCheckedId) return;
    setPreviewing(true); setRepairError(null);
    try {
      const preview = await previewRepair(lastCheckedId);
      setRepairPreview(preview);
      setSelectedFixes(new Set(preview.map((p) => p.type_of_payment)));
    } catch (e: any) {
      setRepairError(e?.message ?? 'Preview failed');
    } finally {
      setPreviewing(false);
    }
  }

  async function handleConfirmRepair() {
    if (!lastCheckedId || selectedFixes.size === 0) return;
    setRepairing(true); setRepairError(null);
    try {
      const result = await repairSchedule(lastCheckedId, selectedFixes);
      setRepairResult(result);
      setRepairPreview(null);
      const [updatedLines, updatedExp] = await Promise.all([
        fetchReceivableLines(lastCheckedId),
        computeExpectedSchedule(lastCheckedId),
      ]);
      // Refresh single mode view
      setLines(updatedLines); setExpected(updatedExp);
      // Refresh All mode expanded view if open
      if (expandedId === lastCheckedId) {
        setExpandLines(updatedLines); setExpandExpected(updatedExp);
        setCheckedIds((prev) => new Map(prev).set(lastCheckedId, 'ok'));
      }
    } catch (e: any) {
      setRepairError(e?.message ?? 'Repair failed');
    } finally {
      setRepairing(false);
    }
  }

  async function handleSearch() {
    const id = query.trim().toUpperCase();
    if (!id) return;
    await loadSchedule(id);
  }

  async function handleLoadAll() {
    setAllLoading(true); setAllError(null); setSummaries(null);
    try {
      const [{ data, error }, { data: resData }] = await Promise.all([
        supabase.from('receivables_database')
          .select('reservation_id, client_name, inventory_code, due_date, payment_scheme')
          .order('due_date'),
        supabase.from('reservations')
          .select('reservation_id, first_payment_agreed'),
      ]);
      if (error) throw error;
      const fpaMap = new Map<string, boolean>(
        ((resData ?? []) as { reservation_id: string; first_payment_agreed: boolean | null }[])
          .map((r) => [r.reservation_id, !!r.first_payment_agreed])
      );
      const rows = (data ?? []) as { reservation_id: string; client_name: string; inventory_code: string; due_date: string; payment_scheme: string }[];
      const map = new Map<string, ResSummary>();
      for (const r of rows) {
        if (!map.has(r.reservation_id)) {
          map.set(r.reservation_id, {
            reservation_id: r.reservation_id,
            client_name: r.client_name,
            inventory_code: r.inventory_code,
            payment_scheme: r.payment_scheme,
            first_payment_agreed: fpaMap.get(r.reservation_id) ?? false,
            line_count: 0,
            first_due: r.due_date,
            last_due: r.due_date,
          });
        }
        const s = map.get(r.reservation_id)!;
        s.line_count++;
        if (r.due_date < s.first_due) s.first_due = r.due_date;
        if (r.due_date > s.last_due)  s.last_due  = r.due_date;
      }
      setSummaries([...map.values()]);
    } catch (e: any) {
      setAllError(e?.message ?? 'Fetch failed');
    } finally {
      setAllLoading(false);
    }
  }

  async function handleExpand(resId: string) {
    if (expandedId === resId) { setExpandedId(null); return; }
    setExpandedId(resId);
    setExpandLines([]); setExpandExpected([]);
    setExpandLoading(true);
    try {
      const [stored, exp] = await Promise.all([
        fetchReceivableLines(resId),
        computeExpectedSchedule(resId),
      ]);
      setExpandLines(stored);
      setExpandExpected(exp);
      const hasIssues = exp.some((e) => {
        const s = stored.find((l) => l.type_of_payment === e.type_of_payment);
        if (!s) return true;
        if (s.payment_status === 'Paid') return false;
        return s.due_date !== e.expected_due_date;
      });
      setCheckedIds((prev) => new Map(prev).set(resId, hasIssues ? 'issues' : 'ok'));
    } catch { setExpandLines([]); setExpandExpected([]); }
    finally { setExpandLoading(false); }
  }

  function handleAllFix(resId: string) {
    setLastCheckedId(resId);
    setRepairResult(null); setRepairError(null);
    handlePreviewRepairFor(resId);
  }

  async function handleCheckAll() {
    if (!summaries || summaries.length === 0) return;
    setCheckingAll(true);
    setCheckAllProgress({ current: 0, total: summaries.length });
    const results = new Map<string, 'ok' | 'issues'>();
    for (let i = 0; i < summaries.length; i++) {
      const resId = summaries[i].reservation_id;
      try {
        const [stored, exp] = await Promise.all([
          fetchReceivableLines(resId),
          computeExpectedSchedule(resId),
        ]);
        const hasIssues = exp.some((e) => {
          const s = stored.find((l) => l.type_of_payment === e.type_of_payment);
          if (!s) return true;
          if (s.payment_status === 'Paid') return false;
          return s.due_date !== e.expected_due_date;
        });
        results.set(resId, hasIssues ? 'issues' : 'ok');
      } catch {
        // skip on error
      }
      setCheckAllProgress({ current: i + 1, total: summaries.length });
    }
    setCheckedIds(results);
    setCheckingAll(false);
  }

  async function handlePreviewRepairFor(resId: string) {
    setPreviewing(true); setRepairError(null);
    try {
      const preview = await previewRepair(resId);
      setRepairPreview(preview);
      setSelectedFixes(new Set(preview.map((p) => p.type_of_payment)));
    } catch (e: any) {
      setRepairError(e?.message ?? 'Preview failed');
    } finally {
      setPreviewing(false);
    }
  }

  const schemeLabel: Record<string, string> = {
    spot_cash: 'Spot Cash', deferred_cash: 'Deferred Cash',
    spot_dp: 'Spot DP', stretched_dp: 'Stretched DP',
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#F2F2F7]" style={{ animation: 'overlaySlideUp 0.32s cubic-bezier(0.32,0.72,0,1) both' }}>
      <style>{`@keyframes overlaySlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

      {/* Nav */}
      <div className="flex items-center justify-between px-4 pt-14 pb-4 shrink-0 bg-white border-b border-black/[0.06]">
        <button onClick={onClose} className="p-2.5 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] active:scale-[0.92]" style={{ transition: 'transform 100ms ease-out' }}>
          <ChevronLeft size={20} />
        </button>
        <p className="text-[#1C1C1E] font-bold text-sm">Check Due Dates</p>
        <div className="w-10" />
      </div>

      {/* Mode toggle */}
      <div className="px-4 py-3 bg-white border-b border-black/[0.06] shrink-0">
        <div className="flex gap-2 p-1 rounded-2xl bg-[#F2F2F7]">
          {(['single', 'all'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
              style={mode === m
                ? { background: '#fff', color: '#1C1C1E', boxShadow: '0 1px 6px rgba(0,0,0,0.10)' }
                : { color: '#8E8E93' }}
            >
              {m === 'single' ? 'Single Transaction' : 'All Transactions'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-10">

        {/* ── Single mode ── */}
        {mode === 'single' && (
          <>
            <div className="relative">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  onFocus={() => suggestions.length > 0 && setShowSug(true)}
                  onBlur={() => setTimeout(() => setShowSug(false), 150)}
                  placeholder="Search by reservation ID, client name, or unit…"
                  className={overlayInputCls + ' flex-1'}
                  autoComplete="off"
                />
                <button
                  onClick={handleSearch}
                  disabled={loading || !query.trim()}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 shrink-0"
                  style={{ background: '#C03D25' }}
                >
                  {loading ? <Loader2 size={15} className="animate-spin" /> : 'Check'}
                </button>
              </div>

              {/* Suggestions dropdown */}
              {showSug && (
                <div className="absolute left-0 right-14 top-full mt-1 z-10 rounded-2xl bg-white border border-black/[0.08] shadow-lg overflow-hidden">
                  {sugLoading ? (
                    <div className="flex justify-center py-3">
                      <Loader2 size={16} className="text-[#C03D25] animate-spin" />
                    </div>
                  ) : suggestions.length === 0 ? (
                    <p className="text-xs text-[#8E8E93] text-center py-3">No results</p>
                  ) : (
                    <div className="divide-y divide-black/[0.05] max-h-56 overflow-y-auto">
                      {suggestions.map((s) => (
                        <button
                          key={s.reservation_id}
                          type="button"
                          onMouseDown={() => loadSchedule(s.reservation_id)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-[#F2F2F7]"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[#1C1C1E] truncate">{s.client_name}</p>
                            <p className="text-xs text-[#8E8E93] truncate">{s.reservation_id} · {s.inventory_code}</p>
                          </div>
                          <ChevronRight size={14} className="text-[#C7C7CC] shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {singleError && (
              <div className="flex items-start gap-2 px-4 py-3 rounded-2xl bg-red-50 border border-red-200">
                <AlertTriangle size={15} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{singleError}</p>
              </div>
            )}

            {lines && expected && (() => {
              const storedMap = new Map(lines.map((l) => [l.type_of_payment, l]));
              const issues = expected.filter((e) => {
                const stored = storedMap.get(e.type_of_payment);
                if (!stored) return true; // missing
                if (stored.payment_status === 'Paid') return false; // paid — skip
                return stored.due_date !== e.expected_due_date;
              });
              const allOk = issues.length === 0;

              return (
                <>
                  {/* Summary banner */}
                  <div
                    className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                    style={{
                      background: allOk ? 'rgba(52,199,89,0.10)' : 'rgba(255,59,48,0.08)',
                      border: `1px solid ${allOk ? 'rgba(52,199,89,0.25)' : 'rgba(255,59,48,0.20)'}`,
                    }}
                  >
                    {allOk
                      ? <CheckCircle2 size={18} className="text-[#34C759] shrink-0" />
                      : <AlertTriangle size={18} className="text-[#FF3B30] shrink-0" />}
                    <div>
                      <p className="text-sm font-bold" style={{ color: allOk ? '#1A7F37' : '#C03D25' }}>
                        {allOk ? 'All lines correct' : `${issues.length} issue${issues.length !== 1 ? 's' : ''} found`}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        <p className="text-xs text-[#8E8E93]">
                          {lines[0].client_name} · {lines[0].inventory_code} · {lines.length} lines
                        </p>
                        {singleFpa && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,122,255,0.10)', color: '#0066CC' }}>
                            1st DP in advance
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Line-by-line */}
                  <div className="rounded-3xl bg-white overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
                    <div className="divide-y divide-black/[0.05]">

                      {/* Expected lines — show each with status */}
                      {expected.map((e) => {
                        const stored = storedMap.get(e.type_of_payment);
                        const missing = !stored;
                        const isPaid = stored?.payment_status === 'Paid';
                        const wrong = stored && stored.due_date !== e.expected_due_date;
                        const wrongAndPaid = wrong && isPaid;
                        const wrongAndUnpaid = wrong && !isPaid;
                        const ok = !missing && !wrong;
                        return (
                          <div key={e.type_of_payment} className="px-4 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  {ok
                                    ? <CheckCircle2 size={13} className="text-[#34C759] shrink-0" />
                                    : missing
                                      ? <AlertTriangle size={13} className="text-[#FF9500] shrink-0" />
                                      : wrongAndPaid
                                        ? <CheckCircle2 size={13} className="text-[#8E8E93] shrink-0" />
                                        : <AlertTriangle size={13} className="text-[#FF3B30] shrink-0" />}
                                  <p className="text-xs font-semibold text-[#1C1C1E] truncate">{e.type_of_payment}</p>
                                </div>
                                {missing && (
                                  <p className="text-xs text-[#FF9500] mt-1 pl-5 font-medium">Line missing</p>
                                )}
                                {wrongAndUnpaid && stored && (
                                  <div className="mt-1 pl-5 space-y-0.5">
                                    <p className="text-xs text-[#FF3B30]">Stored: {fmtDate(stored.due_date)}</p>
                                    <p className="text-xs text-[#1A7F37]">Expected: {fmtDate(e.expected_due_date)}</p>
                                  </div>
                                )}
                                {wrongAndPaid && stored && (
                                  <div className="mt-1 pl-5 space-y-0.5">
                                    <p className="text-xs text-[#8E8E93]">Paid on: {fmtDate(stored.due_date)} · Expected: {fmtDate(e.expected_due_date)}</p>
                                    <p className="text-[10px] text-[#8E8E93]">Already paid — date preserved</p>
                                  </div>
                                )}
                                {ok && stored && (
                                  <p className="text-xs text-[#8E8E93] mt-0.5 pl-5">{fmtDate(stored.due_date)}</p>
                                )}
                              </div>
                              {stored && (
                                <div className="text-right shrink-0">
                                  <p className="text-xs font-bold text-[#1C1C1E]">₱{stored.total_amount_due.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                                  <span
                                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                    style={{
                                      background: stored.payment_status === 'Paid' ? 'rgba(52,199,89,0.12)' : 'rgba(142,142,147,0.12)',
                                      color: stored.payment_status === 'Paid' ? '#1A7F37' : '#6C6C70',
                                    }}
                                  >
                                    {stored.payment_status}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* Extra lines in DB that aren't expected */}
                      {lines.filter((l) => !expected.some((e) => e.type_of_payment === l.type_of_payment)).map((l) => (
                        <div key={l.id} className="px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <AlertTriangle size={13} className="text-[#FF9500] shrink-0" />
                                <p className="text-xs font-semibold text-[#1C1C1E] truncate">{l.type_of_payment}</p>
                              </div>
                              <p className="text-xs text-[#FF9500] mt-1 pl-5 font-medium">Unexpected line</p>
                              <p className="text-xs text-[#8E8E93] pl-5">{fmtDate(l.due_date)}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs font-bold text-[#1C1C1E]">₱{l.total_amount_due.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              );
            })()}

            {/* Repair feedback */}
            {repairResult && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-green-50 border border-green-200">
                <CheckCircle2 size={16} className="text-[#34C759] shrink-0" />
                <p className="text-sm text-[#1A7F37] font-medium">
                  Fixed: {repairResult.updatedDates} date{repairResult.updatedDates !== 1 ? 's' : ''} corrected
                  {repairResult.insertedLines > 0 ? `, ${repairResult.insertedLines} line${repairResult.insertedLines !== 1 ? 's' : ''} inserted` : ''}
                </p>
              </div>
            )}

            {repairError && (
              <div className="flex items-start gap-2 px-4 py-3 rounded-2xl bg-red-50 border border-red-200">
                <AlertTriangle size={15} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{repairError}</p>
              </div>
            )}

            {/* Fix Issues button — shown when there are actionable issues */}
            {lines && expected && (() => {
              const hasIssues = expected.some((e) => {
                const s = lines.find((l) => l.type_of_payment === e.type_of_payment);
                if (!s) return true;
                if (s.payment_status === 'Paid') return false;
                return s.due_date !== e.expected_due_date;
              });
              if (!hasIssues) return null;
              return (
                <button
                  onClick={handlePreviewRepair}
                  disabled={previewing}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
                  style={{ background: '#C03D25' }}
                >
                  {previewing ? <><Loader2 size={16} className="animate-spin" /> Loading…</> : 'Fix Issues'}
                </button>
              );
            })()}

          </>
        )}

        {/* ── All mode ── */}
        {mode === 'all' && (
          <>
            {!summaries && !allLoading && (
              <button
                onClick={handleLoadAll}
                className="w-full py-3.5 rounded-2xl text-sm font-bold text-white"
                style={{ background: '#C03D25' }}
              >
                Load All Transactions
              </button>
            )}

            {allLoading && (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 size={28} className="text-[#C03D25] animate-spin" />
                <p className="text-sm text-[#8E8E93]">Loading all schedules…</p>
              </div>
            )}

            {allError && (
              <div className="flex items-start gap-2 px-4 py-3 rounded-2xl bg-red-50 border border-red-200">
                <AlertTriangle size={15} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{allError}</p>
              </div>
            )}

            {summaries && (
              <>
                {/* Check All button + progress */}
                {checkingAll ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-4">
                    <Loader2 size={32} className="text-[#C03D25] animate-spin" />
                    <div className="text-center">
                      <p className="text-sm font-bold text-[#1C1C1E]">Checking schedules…</p>
                      <p className="text-xs text-[#8E8E93] mt-1">{checkAllProgress.current} of {checkAllProgress.total}</p>
                    </div>
                    {/* Progress bar */}
                    <div className="w-48 h-1.5 rounded-full bg-[#E5E5EA] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#C03D25] transition-all"
                        style={{ width: `${checkAllProgress.total > 0 ? (checkAllProgress.current / checkAllProgress.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between px-1">
                    <p className="text-xs text-[#8E8E93]">{summaries.length} reservations with schedules</p>
                    <button
                      onClick={handleCheckAll}
                      className="text-xs font-bold text-[#C03D25] active:opacity-70 px-3 py-1.5 rounded-xl bg-[#C03D25]/08"
                      style={{ background: 'rgba(192,61,37,0.08)' }}
                    >
                      Check All for Issues
                    </button>
                  </div>
                )}
                {summaries.map((s) => {
                  const status = checkedIds.get(s.reservation_id);
                  const isExpanded = expandedId === s.reservation_id;
                  return (
                    <div key={s.reservation_id} className="rounded-3xl bg-white overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
                      <button
                        className="w-full flex items-start justify-between gap-3 px-4 py-3 text-left active:bg-[#F2F2F7]"
                        onClick={() => handleExpand(s.reservation_id)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {status === 'ok'     && <CheckCircle2 size={13} className="text-[#34C759] shrink-0" />}
                            {status === 'issues' && <AlertTriangle size={13} className="text-[#FF3B30] shrink-0" />}
                            <p className="text-sm font-semibold text-[#1C1C1E] truncate">{s.client_name}</p>
                          </div>
                          <p className="text-xs text-[#8E8E93] truncate">{s.inventory_code} · {s.reservation_id}</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-xs text-[#8E8E93]">{schemeLabel[s.payment_scheme] ?? s.payment_scheme} · {s.line_count} lines</p>
                            {s.first_payment_agreed && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,122,255,0.10)', color: '#0066CC' }}>
                                1st DP in advance
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#8E8E93]">{fmtDate(s.first_due)} → {fmtDate(s.last_due)}</p>
                        </div>
                        <ChevronRight
                          size={16}
                          className="text-[#C7C7CC] shrink-0 mt-1 transition-transform"
                          style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                        />
                      </button>

                      {isExpanded && (
                        <div className="border-t border-black/[0.06]">
                          {expandLoading ? (
                            <div className="flex justify-center py-4">
                              <Loader2 size={18} className="text-[#C03D25] animate-spin" />
                            </div>
                          ) : (() => {
                            const storedMap = new Map(expandLines.map((l) => [l.type_of_payment, l]));
                            const hasIssues = expandExpected.some((e) => {
                              const st = storedMap.get(e.type_of_payment);
                              if (!st) return true;
                              if (st.payment_status === 'Paid') return false;
                              return st.due_date !== e.expected_due_date;
                            });

                            return (
                              <>
                                <div className="divide-y divide-black/[0.05]">
                                  {expandExpected.map((e) => {
                                    const stored = storedMap.get(e.type_of_payment);
                                    const missing = !stored;
                                    const isPaid = stored?.payment_status === 'Paid';
                                    const wrong = stored && stored.due_date !== e.expected_due_date;
                                    const wrongAndPaid = wrong && isPaid;
                                    const wrongAndUnpaid = wrong && !isPaid;
                                    const ok = !missing && !wrong;
                                    return (
                                      <div key={e.type_of_payment} className="px-4 py-2.5">
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5">
                                              {ok          && <CheckCircle2 size={12} className="text-[#34C759] shrink-0" />}
                                              {missing     && <AlertTriangle size={12} className="text-[#FF9500] shrink-0" />}
                                              {wrongAndUnpaid && <AlertTriangle size={12} className="text-[#FF3B30] shrink-0" />}
                                              {wrongAndPaid   && <CheckCircle2 size={12} className="text-[#8E8E93] shrink-0" />}
                                              <p className="text-xs font-semibold text-[#1C1C1E] truncate">{e.type_of_payment}</p>
                                            </div>
                                            {missing && <p className="text-[10px] text-[#FF9500] pl-4 mt-0.5">Missing</p>}
                                            {wrongAndUnpaid && stored && (
                                              <div className="flex items-center gap-1.5 pl-4 mt-0.5">
                                                <p className="text-[10px] text-[#FF3B30]">{fmtDate(stored.due_date)}</p>
                                                <ChevronRight size={10} className="text-[#C7C7CC]" />
                                                <p className="text-[10px] text-[#1A7F37] font-medium">{fmtDate(e.expected_due_date)}</p>
                                              </div>
                                            )}
                                            {wrongAndPaid && stored && (
                                              <p className="text-[10px] text-[#8E8E93] pl-4 mt-0.5">{fmtDate(stored.due_date)} · Paid — preserved</p>
                                            )}
                                            {ok && stored && (
                                              <p className="text-[10px] text-[#8E8E93] pl-4 mt-0.5">{fmtDate(stored.due_date)}</p>
                                            )}
                                          </div>
                                          {stored && (
                                            <div className="text-right shrink-0">
                                              <p className="text-xs font-bold text-[#1C1C1E]">₱{stored.total_amount_due.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                                style={{
                                                  background: stored.payment_status === 'Paid' ? 'rgba(52,199,89,0.12)' : 'rgba(142,142,147,0.12)',
                                                  color: stored.payment_status === 'Paid' ? '#1A7F37' : '#6C6C70',
                                                }}>
                                                {stored.payment_status}
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {/* Extra unexpected lines */}
                                  {expandLines.filter((l) => !expandExpected.some((e) => e.type_of_payment === l.type_of_payment)).map((l) => (
                                    <div key={l.id} className="px-4 py-2.5">
                                      <div className="flex items-center gap-1.5">
                                        <AlertTriangle size={12} className="text-[#FF9500] shrink-0" />
                                        <p className="text-xs font-semibold text-[#1C1C1E] truncate">{l.type_of_payment}</p>
                                      </div>
                                      <p className="text-[10px] text-[#FF9500] pl-4">Unexpected · {fmtDate(l.due_date)}</p>
                                    </div>
                                  ))}
                                </div>

                                {hasIssues && (
                                  <div className="px-4 py-3 border-t border-black/[0.06]">
                                    <button
                                      onClick={() => handleAllFix(s.reservation_id)}
                                      disabled={previewing}
                                      className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
                                      style={{ background: '#C03D25' }}
                                    >
                                      {previewing && lastCheckedId === s.reservation_id
                                        ? <><Loader2 size={15} className="animate-spin" /> Loading…</>
                                        : 'Fix Issues'}
                                    </button>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}
      </div>

      {/* ── Repair confirmation sheet (shared, both modes) ── */}
      {repairPreview && (
        <div className="fixed inset-0 z-60 flex items-end" style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full bg-white rounded-t-3xl px-5 pt-5 pb-10 max-h-[80vh] flex flex-col" style={{ animation: 'overlaySlideUp 0.28s cubic-bezier(0.32,0.72,0,1) both' }}>
            <div className="flex items-center justify-between mb-4 shrink-0">
              <p className="text-base font-bold text-[#1C1C1E]">Confirm Changes</p>
              <button onClick={() => setRepairPreview(null)} className="p-2 rounded-xl bg-[#F2F2F7] active:scale-[0.92]">
                <X size={16} className="text-[#1C1C1E]" />
              </button>
            </div>

            <div className="flex items-center justify-between mb-3 shrink-0">
              <p className="text-xs text-[#8E8E93]">
                {selectedFixes.size} of {repairPreview.length} selected · Paid lines excluded
              </p>
              <button
                onClick={() => setSelectedFixes(
                  selectedFixes.size === repairPreview.length
                    ? new Set()
                    : new Set(repairPreview.map((p) => p.type_of_payment))
                )}
                className="text-xs font-bold text-[#C03D25] active:opacity-70"
              >
                {selectedFixes.size === repairPreview.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 mb-4">
              {repairPreview.map((item) => {
                const selected = selectedFixes.has(item.type_of_payment);
                return (
                  <button
                    key={item.type_of_payment}
                    type="button"
                    onClick={() => setSelectedFixes((prev) => {
                      const next = new Set(prev);
                      selected ? next.delete(item.type_of_payment) : next.add(item.type_of_payment);
                      return next;
                    })}
                    className="w-full rounded-2xl px-4 py-3 text-left transition-all active:scale-[0.98]"
                    style={{
                      border: selected ? '1.5px solid #C03D25' : '1px solid rgba(0,0,0,0.08)',
                      background: selected ? 'rgba(192,61,37,0.04)' : '#fff',
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-5 h-5 rounded-md shrink-0 mt-0.5 flex items-center justify-center"
                        style={{ background: selected ? '#C03D25' : '#F2F2F7', border: selected ? 'none' : '1.5px solid #C7C7CC' }}
                      >
                        {selected && <Check size={11} className="text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                            style={{
                              background: item.action === 'insert' ? 'rgba(52,199,89,0.12)' : 'rgba(255,149,0,0.12)',
                              color: item.action === 'insert' ? '#1A7F37' : '#A05A00',
                            }}
                          >
                            {item.action === 'insert' ? 'INSERT' : 'UPDATE'}
                          </span>
                          <p className="text-xs font-semibold text-[#1C1C1E] truncate">{item.type_of_payment}</p>
                        </div>
                        {item.action === 'update' && item.current_due_date && (
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-[#FF3B30]">{fmtDate(item.current_due_date)}</p>
                            <ChevronRight size={12} className="text-[#C7C7CC]" />
                            <p className="text-xs text-[#1A7F37] font-medium">{fmtDate(item.correct_due_date)}</p>
                          </div>
                        )}
                        {item.action === 'insert' && (
                          <div className="space-y-0.5">
                            <p className="text-xs text-[#1A7F37]">Due: {fmtDate(item.correct_due_date)}</p>
                            <p className="text-xs text-[#8E8E93]">₱{item.total_amount_due.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="space-y-2 shrink-0">
              <button
                onClick={handleConfirmRepair}
                disabled={repairing || selectedFixes.size === 0}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
                style={{ background: '#C03D25' }}
              >
                {repairing
                  ? <><Loader2 size={16} className="animate-spin" /> Applying…</>
                  : `Apply ${selectedFixes.size} Change${selectedFixes.size !== 1 ? 's' : ''}`}
              </button>
              <button
                onClick={() => setRepairPreview(null)}
                disabled={repairing}
                className="w-full py-3.5 rounded-2xl text-sm font-bold text-[#1C1C1E] bg-[#F2F2F7] disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Fix Turnover Due Dates overlay ─────────────────────────────────── */

function fmtDate(d: string): string {
  const [y, m, day] = d.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(day, 10)}, ${y}`;
}

function FixDueDatesOverlay({ onClose }: { onClose: () => void }) {
  const [scanning, setScanning] = useState(true);
  const [previews, setPreviews] = useState<DueDateFixPreview[]>([]);
  const [applying, setApplying] = useState(false);
  const [done,     setDone]     = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    previewTurnoverDueDateFixes()
      .then(setPreviews)
      .catch((e: any) => setError(e?.message ?? 'Scan failed'))
      .finally(() => setScanning(false));
  }, []);

  const handleApply = async () => {
    setApplying(true);
    try {
      await applyTurnoverDueDateFixes(previews.map((p) => ({ line_id: p.line_id, correct_due_date: p.correct_due_date })));
      setDone(true);
    } catch (e: any) {
      setError(e?.message ?? 'Apply failed');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#F2F2F7]" style={{ animation: 'overlaySlideUp 0.32s cubic-bezier(0.32,0.72,0,1) both' }}>
      <style>{`@keyframes overlaySlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

      {/* Nav */}
      <div className="flex items-center justify-between px-4 pt-14 pb-4 shrink-0 bg-white border-b border-black/[0.06]">
        <button onClick={onClose} className="p-2.5 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] active:scale-[0.92]" style={{ transition: 'transform 100ms ease-out' }}>
          <ChevronLeft size={20} />
        </button>
        <p className="text-[#1C1C1E] font-bold text-sm">Fix Turnover Due Dates</p>
        <div className="w-10" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-10">
        {scanning ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 size={28} className="text-[#C03D25] animate-spin" />
            <p className="text-sm text-[#8E8E93]">Scanning payment lines…</p>
          </div>
        ) : error ? (
          <div className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-red-50 border border-red-200">
            <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        ) : done ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <CheckCircle2 size={40} className="text-[#34C759]" />
            <p className="text-sm font-semibold text-[#1C1C1E]">{previews.length} line{previews.length !== 1 ? 's' : ''} updated</p>
            <button onClick={onClose} className="mt-2 px-6 py-2.5 rounded-2xl text-white text-sm font-bold" style={{ background: '#C03D25' }}>Done</button>
          </div>
        ) : previews.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <CheckCircle2 size={40} className="text-[#34C759]" />
            <p className="text-sm font-semibold text-[#1C1C1E]">All due dates are correct</p>
            <p className="text-xs text-[#8E8E93]">No fixes needed</p>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3 px-4 py-3 bg-[#FFF3CD] rounded-2xl border border-[#FFCA28]/50">
              <AlertTriangle size={15} className="text-[#A05A00] shrink-0 mt-0.5" />
              <p className="text-xs text-[#7A4400] leading-snug">
                {previews.length} payment line{previews.length !== 1 ? 's' : ''} have an incorrect due date based on the now-configured turnover date. Review below and apply to correct them.
              </p>
            </div>

            {previews.map((p) => (
              <div key={p.line_id} className="rounded-3xl bg-white overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
                <div className="px-4 py-3 border-b border-black/[0.06]">
                  <p className="text-sm font-semibold text-[#1C1C1E]">{p.client_name}</p>
                  <p className="text-xs text-[#8E8E93]">{p.inventory_code} · {p.reservation_id}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider mb-2">{p.type_of_payment}</p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 text-center py-2 rounded-xl" style={{ background: 'rgba(255,59,48,0.08)' }}>
                      <p className="text-[10px] text-[#8E8E93] font-medium mb-0.5">Current</p>
                      <p className="text-sm font-bold text-[#C03D25]">{fmtDate(p.current_due_date)}</p>
                    </div>
                    <ChevronRight size={16} className="text-[#C7C7CC] shrink-0" />
                    <div className="flex-1 text-center py-2 rounded-xl" style={{ background: 'rgba(52,199,89,0.08)' }}>
                      <p className="text-[10px] text-[#8E8E93] font-medium mb-0.5">Correct</p>
                      <p className="text-sm font-bold text-[#1A7F37]">{fmtDate(p.correct_due_date)}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {!scanning && !done && !error && previews.length > 0 && (
        <div className="px-4 pb-8 pt-3 bg-white border-t border-black/[0.06] shrink-0">
          <button
            onClick={handleApply}
            disabled={applying}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold disabled:opacity-50"
            style={{ background: '#C03D25', color: '#fff' }}
          >
            {applying
              ? <><Loader2 size={16} className="animate-spin" /> Applying…</>
              : `Apply ${previews.length} Fix${previews.length !== 1 ? 'es' : ''}`}
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Admin landing page ──────────────────────────────────────────────── */
export default function AdminUserPage() {
  const [activeOverlay, setActiveOverlay] = useState<string | null>(null);

  return (
    <>
      <PageShell title="Admin User">
        <div className="px-4 pt-4 pb-24 space-y-3">
          <p className="text-sm text-[#6C6C70] px-1 mb-4">
            Select a setting to configure.
          </p>

          {SETUP_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveOverlay(item.id)}
              className="w-full flex items-center gap-4 px-4 py-4 rounded-3xl text-left active:scale-[0.98] transition-all"
              style={cardStyle}
            >
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(192,61,37,0.10)', color: '#C03D25' }}>
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[#1C1C1E] font-semibold text-sm">{item.label}</p>
                <p className="text-[#6C6C70] text-xs mt-0.5">{item.description}</p>
              </div>
              <ChevronRight size={18} className="text-[#C7C7CC] shrink-0" />
            </button>
          ))}
        </div>
      </PageShell>

      {activeOverlay === 'reservation-fee' && (
        <DropdownSettingsOverlay onClose={() => setActiveOverlay(null)} />
      )}
      {activeOverlay === 'due-date' && (
        <DueDateSettingsOverlay onClose={() => setActiveOverlay(null)} />
      )}
      {activeOverlay === 'project-settings' && (
        <ProjectSettingsOverlay onClose={() => setActiveOverlay(null)} />
      )}
      {activeOverlay === 'vat-settings' && (
        <VatSettingsOverlay onClose={() => setActiveOverlay(null)} />
      )}
      {activeOverlay === 'hic-settings' && (
        <HicSettingsOverlay onClose={() => setActiveOverlay(null)} />
      )}
      {activeOverlay === 'access-rights' && (
        <AccessRightsOverlay onClose={() => setActiveOverlay(null)} />
      )}
      {activeOverlay === 'user-management' && (
        <UserManagementOverlay onClose={() => setActiveOverlay(null)} />
      )}
      {activeOverlay === 'fix-due-dates' && (
        <FixDueDatesOverlay onClose={() => setActiveOverlay(null)} />
      )}
      {activeOverlay === 'check-due-dates' && (
        <CheckDueDatesOverlay onClose={() => setActiveOverlay(null)} />
      )}
    </>
  );
}
