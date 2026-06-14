'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import { Layers, ChevronDown, Check, X } from 'lucide-react';
import { InventoryUnit } from '@/types';

interface OptionItem { value: string; label: string; }

interface SelectRowProps {
  label: string;
  value: string;
  options: OptionItem[];
  disabled: boolean;
  placeholder: string;
  isOpen: boolean;
  onToggle: () => void;
  onChange: (v: string) => void;
  onClear: () => void;
}

function SelectRow({ label, value, options, disabled, placeholder, isOpen, onToggle, onChange, onClear }: SelectRowProps) {
  const selectedLabel = options.find((o) => o.value === value)?.label;

  return (
    <div className={`border-b border-black/[0.06] last:border-0 ${disabled ? 'opacity-40' : ''}`}>
      <div className="flex items-center gap-1 py-3.5 px-1">
        <button
          type="button"
          disabled={disabled}
          onClick={onToggle}
          className="flex-1 flex items-center gap-3 min-w-0"
        >
          <span className="text-[#1C1C1E] text-sm font-medium w-24 shrink-0 text-left">{label}</span>
          <span className={`flex-1 text-right text-sm truncate ${value ? 'text-[#1C1C1E]' : 'text-[#8E8E93]'}`}>
            {selectedLabel ?? placeholder}
          </span>
          <ChevronDown
            size={14}
            className={`text-[#C7C7CC] shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {value && (
          <button
            type="button"
            onClick={onClear}
            className="ml-1 p-1 rounded-full bg-[#E5E5EA] shrink-0"
          >
            <X size={11} className="text-[#8E8E93]" />
          </button>
        )}
      </div>

      {isOpen && options.length > 0 && (
        <div className="pb-2 space-y-0.5 max-h-48 overflow-y-auto">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-colors ${
                o.value === value
                  ? 'bg-[#C03D25]/10 text-[#C03D25] font-semibold'
                  : 'text-[#1C1C1E] hover:bg-gray-50 active:bg-gray-100'
              }`}
            >
              {o.label}
              {o.value === value && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function formatPrice(raw: string | null): { millions: string; full: string } | null {
  if (!raw) return null;
  const num = parseFloat(String(raw).replace(/[₱,\s]/g, ''));
  if (isNaN(num)) return null;
  return {
    millions: '₱' + (num / 1_000_000).toFixed(2) + 'M',
    full:     '₱' + num.toLocaleString('en-PH'),
  };
}

const SS_FILTERS = 'inventoryFilters';
const SS_TOWERS  = 'inventoryTowers';
const SS_UNITS   = 'inventoryUnits';

function loadSession() {
  try {
    return {
      filters: JSON.parse(sessionStorage.getItem(SS_FILTERS) ?? '{}'),
      towers:  JSON.parse(sessionStorage.getItem(SS_TOWERS)  ?? '[]'),
      units:   JSON.parse(sessionStorage.getItem(SS_UNITS)   ?? '[]'),
    };
  } catch { return { filters: {}, towers: [], units: [] }; }
}

const pad2 = (s: string | null) => String(parseInt(s ?? '') || 0).padStart(2, '0');

export default function InventoryPage() {
  const saved = loadSession();

  const [projects, setProjects] = useState<string[]>([]);
  const [towers,   setTowers]   = useState<string[]>(saved.towers);
  const [allUnits, setAllUnits] = useState<InventoryUnit[]>(saved.units);

  const [project,  setProject]  = useState<string>(saved.filters.project  ?? '');
  const [tower,    setTower]    = useState<string>(saved.filters.tower    ?? '');
  const [unitType, setUnitType] = useState<string>(saved.filters.unitType ?? '');
  const [floor,    setFloor]    = useState<string>(saved.filters.floor    ?? '');
  const [loading,  setLoading]  = useState(false);

  const [openRow, setOpenRow] = useState<string | null>(null);
  const toggle = (name: string) => setOpenRow((prev) => (prev === name ? null : name));

  // Persist filters + data to sessionStorage whenever they change
  useEffect(() => {
    sessionStorage.setItem(SS_FILTERS, JSON.stringify({ project, tower, unitType, floor }));
  }, [project, tower, unitType, floor]);

  useEffect(() => {
    sessionStorage.setItem(SS_TOWERS, JSON.stringify(towers));
  }, [towers]);

  useEffect(() => {
    sessionStorage.setItem(SS_UNITS, JSON.stringify(allUnits));
  }, [allUnits]);

  // Load projects on mount
  useEffect(() => {
    fetch('/api/units')
      .then((r) => r.json())
      .then((d) => setProjects(d.projects ?? []))
      .catch(() => {});
  }, []);

  // Fetch towers when project changes
  const fetchTowers = useCallback(async (pn: string) => {
    const r = await fetch(`/api/units?project_name=${encodeURIComponent(pn)}`);
    setTowers((await r.json()).towers ?? []);
  }, []);

  // Fetch ALL units for project+tower — filtering happens client-side
  const fetchAllUnits = useCallback(async (pn: string, t: string) => {
    setLoading(true);
    const r = await fetch(`/api/units?project_name=${encodeURIComponent(pn)}&tower=${encodeURIComponent(t)}`);
    setAllUnits((await r.json()).units ?? []);
    setLoading(false);
  }, []);

  // Derive unit type options from all units
  const unitTypeOptions = useMemo(() =>
    [...new Set(allUnits.map((u) => u.unit_type).filter(Boolean))].sort() as string[],
    [allUnits]
  );

  // Derive floor options — filtered by selected unit type if set
  const floorOptions = useMemo(() => {
    const base = unitType ? allUnits.filter((u) => u.unit_type === unitType) : allUnits;
    return [...new Set(base.map((u) => u.floor).filter(Boolean))].sort() as string[];
  }, [allUnits, unitType]);

  // Displayed units — filtered client-side by unit type and floor
  const displayedUnits = useMemo(() => {
    return allUnits.filter((u) =>
      (!unitType || u.unit_type === unitType) &&
      (!floor    || u.floor    === floor)
    );
  }, [allUnits, unitType, floor]);

  const handleProjectChange = (pn: string) => {
    setProject(pn); setTower(''); setUnitType(''); setFloor('');
    setTowers([]); setAllUnits([]);
    if (pn) fetchTowers(pn);
  };

  const handleTowerChange = (t: string) => {
    setTower(t); setUnitType(''); setFloor('');
    setAllUnits([]);
    if (t) fetchAllUnits(project, t);
  };

  const handleUnitTypeChange = (ut: string) => {
    setUnitType(ut); setFloor('');
  };

  const handleFloorChange = (f: string) => {
    setFloor(f);
  };

  const router = useRouter();

  const handleUnitClick = (unit: InventoryUnit) => {
    sessionStorage.setItem('selectedUnit', JSON.stringify(unit));
    router.push('/sales/unit');
  };

  const showCards = tower && (loading || allUnits.length > 0);

  return (
    <PageShell title="Inventory" backButton>
      <GlassCard strong className="p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-[rgba(192,61,37,0.12)] flex items-center justify-center shrink-0">
          <Layers size={22} className="text-[#C03D25]" />
        </div>
        <div>
          <p className="text-[#1C1C1E] font-semibold">Unit Inventory</p>
          <p className="text-[#6C6C70] text-sm mt-0.5">Select filters to browse available units</p>
        </div>
      </GlassCard>

      <GlassCard className="px-4 py-1">
        <SelectRow
          label="Project"
          value={project}
          options={projects.map((p) => ({ value: p, label: p }))}
          disabled={projects.length === 0}
          placeholder="Select project"
          isOpen={openRow === 'project'}
          onToggle={() => toggle('project')}
          onChange={(v) => { handleProjectChange(v); setOpenRow(null); }}
          onClear={() => { handleProjectChange(''); setOpenRow(null); }}
        />
        <SelectRow
          label="Tower"
          value={tower}
          options={towers.map((t) => ({ value: t, label: t }))}
          disabled={!project}
          placeholder={project ? 'Select tower' : 'Select project first'}
          isOpen={openRow === 'tower'}
          onToggle={() => project && toggle('tower')}
          onChange={(v) => { handleTowerChange(v); setOpenRow(null); }}
          onClear={() => { handleTowerChange(''); setOpenRow(null); }}
        />
        <SelectRow
          label="Unit Type"
          value={unitType}
          options={unitTypeOptions.map((t) => ({ value: t, label: t }))}
          disabled={!tower || unitTypeOptions.length === 0}
          placeholder={tower ? 'All unit types' : 'Select tower first'}
          isOpen={openRow === 'unitType'}
          onToggle={() => tower && unitTypeOptions.length > 0 && toggle('unitType')}
          onChange={(v) => { handleUnitTypeChange(v); setOpenRow(null); }}
          onClear={() => { handleUnitTypeChange(''); setOpenRow(null); }}
        />
        <SelectRow
          label="Floor"
          value={floor}
          options={floorOptions.map((f) => ({ value: f, label: `Floor ${f}` }))}
          disabled={!tower || floorOptions.length === 0}
          placeholder={tower ? 'All floors' : 'Select tower first'}
          isOpen={openRow === 'floor'}
          onToggle={() => tower && floorOptions.length > 0 && toggle('floor')}
          onChange={(v) => { handleFloorChange(v); setOpenRow(null); }}
          onClear={() => { handleFloorChange(''); setOpenRow(null); }}
        />
      </GlassCard>

      {showCards && (
        <div className="space-y-2">
          <p className="text-[#6C6C70] text-xs px-1 font-medium uppercase tracking-wide">
            {displayedUnits.length} unit{displayedUnits.length !== 1 ? 's' : ''} available
            {unitType ? ` · ${unitType}` : ''}
            {floor ? ` · Floor ${floor}` : ''}
          </p>

          {loading ? (
            <GlassCard className="p-8 text-center">
              <p className="text-[#8E8E93] text-sm">Loading units…</p>
            </GlassCard>
          ) : displayedUnits.length === 0 ? (
            <GlassCard className="p-8 text-center">
              <p className="text-[#8E8E93] text-sm">No units match the selected filters.</p>
            </GlassCard>
          ) : (
            <div className="grid grid-cols-3 gap-2 max-h-[42vh] overflow-y-auto pb-2">
              {displayedUnits.map((unit, i) => {
                const price = formatPrice(unit.total_list_price);
                return (
                  <GlassCard
                    key={unit.inventory_code ?? unit.unit_no ?? i}
                    className="p-2.5 flex flex-col gap-1 cursor-pointer active:scale-[0.97] transition-all"
                    onClick={() => handleUnitClick(unit)}
                  >
                    <p className="text-[#1C1C1E] font-bold text-sm leading-tight">
                      {pad2(unit.floor)}{pad2(unit.unit_no)}
                    </p>
                    <p className="text-[#6C6C70] text-[10px] leading-tight">
                      {unit.unit_type}{unit.unit_area != null ? ` (${unit.unit_area} sqm)` : ''}
                    </p>
                    <p className={`text-xs font-bold leading-tight mt-1 ${price ? 'text-[#C03D25]' : 'text-[#8E8E93]'}`}>
                      {price ? price.millions : '—'}
                    </p>
                  </GlassCard>
                );
              })}
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}
