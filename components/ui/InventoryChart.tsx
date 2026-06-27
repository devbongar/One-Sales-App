'use client';

import { useState, useMemo } from 'react';
import { Home, Car, Bike, LayoutGrid, Layers, BarChart3, Grid3X3, FileDown } from 'lucide-react';
import { type InventoryUnit } from '@/lib/inventory';

// ─── Types ────────────────────────────────────────────────────────────────────

export type UnitCategory = 'Residential' | 'Car Parking' | 'Motorcycle Parking' | '';
export type ChartViewMode = 'chart' | 'grid';

export interface InventoryChartProps {
  // Required
  project:      string;
  tower:        string;
  inventoryUnits: InventoryUnit[];
  onSelectUnit: (unit: InventoryUnit) => void;

  // Optional — marks a unit as "Current" (non-selectable)
  excludeCode?: string | null;

  // Optional controlled props — when omitted, component manages state internally
  unitCategory?:         UnitCategory;
  onUnitCategoryChange?: (v: UnitCategory) => void;
  floor?:                string;
  onFloorChange?:        (v: string) => void;
  floors?:               string[];        // if omitted, derived from inventoryUnits
  unitType?:             string;
  onUnitTypeChange?:     (v: string) => void;
  unitTypes?:            string[];        // if omitted, derived from inventoryUnits
  viewMode?:             ChartViewMode;
  onViewModeChange?:     (v: ChartViewMode) => void;

  // Layout
  showCategoryTabs?: boolean; // default true
  showFilters?:      boolean; // show floor/unitType dropdowns, default true
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const UNIT_CATEGORIES = [
  { value: 'Residential'        as const, label: 'Residential',   icon: <Home  size={16} /> },
  { value: 'Car Parking'        as const, label: 'Car Parking',   icon: <Car   size={16} /> },
  { value: 'Motorcycle Parking' as const, label: 'Motor Parking', icon: <Bike  size={16} /> },
];

const pad2 = (s: string) =>
  /^\d+$/.test(s ?? '') ? String(parseInt(s) || 0).padStart(2, '0') : (s ?? '');

function statusColor(status?: string) {
  switch (status?.toLowerCase()) {
    case 'available':   return 'bg-[#DCFCE7] text-[#166534]';
    case 'unavailable': return 'bg-[#E5E7EB] text-[#6B7280]';
    case 'reserved':    return 'bg-[#FFEDD5] text-[#9A3412]';
    case 'booked':      return 'bg-[#FEE2E2] text-[#991B1B]';
    default:            return 'bg-[#E5E7EB] text-[#6B7280]';
  }
}

function statusRgb(s?: string): { bg: [number,number,number]; fg: [number,number,number] } {
  switch (s?.toLowerCase()) {
    case 'available':   return { bg: [220,252,231], fg: [22,101,52] };
    case 'reserved':    return { bg: [255,237,213], fg: [154,52,18] };
    case 'booked':      return { bg: [254,226,226], fg: [153,27,27] };
    case 'unavailable': return { bg: [229,231,235], fg: [107,114,128] };
    default:            return { bg: [229,231,235], fg: [107,114,128] };
  }
}

// ─── Inline filter dropdown ───────────────────────────────────────────────────

function FilterSelect({
  icon, label, value, options, onChange, disabled, placeholder,
}: {
  icon: React.ReactNode; label: string; value: string;
  options: string[]; onChange: (v: string) => void;
  disabled?: boolean; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-black/[0.06] last:border-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(p => !p)}
        className="w-full flex items-center gap-3 py-2.5 px-1 disabled:opacity-40"
      >
        <span className="text-[#C03D25] shrink-0">{icon}</span>
        <span className="flex-1 text-sm font-medium text-[#1C1C1E] text-left">{label}</span>
        <span className={`text-sm truncate max-w-[140px] ${value ? 'text-[#1C1C1E]' : 'text-[#8E8E93]'}`}>
          {value || placeholder || 'Select'}
        </span>
      </button>
      {open && options.length > 0 && (
        <div className="pb-2 space-y-0.5 max-h-40 overflow-y-auto">
          {value && (
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              className="w-full text-left px-3 py-2 rounded-xl text-xs text-[#8E8E93]"
            >
              Clear
            </button>
          )}
          {options.map(o => (
            <button key={o} type="button"
              onClick={() => { onChange(o === value ? '' : o); setOpen(false); }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm ${
                o === value ? 'bg-[#C03D25]/10 text-[#C03D25] font-semibold' : 'text-[#1C1C1E] active:bg-gray-100'
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InventoryChart({
  project, tower, inventoryUnits, onSelectUnit, excludeCode,
  unitCategory:    unitCategoryProp,   onUnitCategoryChange,
  floor:           floorProp,          onFloorChange,
  floors:          floorsProp,
  unitType:        unitTypeProp,        onUnitTypeChange,
  unitTypes:       unitTypesProp,
  viewMode:        viewModeProp,        onViewModeChange,
  showCategoryTabs = true,
  showFilters      = true,
}: InventoryChartProps) {
  // ── Internal state (used when controlled props are absent) ──────────────────
  const [internalCategory, setInternalCategory] = useState<UnitCategory>('Residential');
  const [internalFloor,    setInternalFloor]    = useState('');
  const [internalUnitType, setInternalUnitType] = useState('');
  const [internalViewMode, setInternalViewMode] = useState<ChartViewMode>('chart');

  const unitCategory = unitCategoryProp   !== undefined ? unitCategoryProp   : internalCategory;
  const floor        = floorProp          !== undefined ? floorProp          : internalFloor;
  const unitType     = unitTypeProp       !== undefined ? unitTypeProp       : internalUnitType;
  const viewMode     = viewModeProp       !== undefined ? viewModeProp       : internalViewMode;

  function setUnitCategory(v: UnitCategory) {
    if (onUnitCategoryChange) onUnitCategoryChange(v);
    else { setInternalCategory(v); setInternalFloor(''); setInternalUnitType(''); }
  }
  function setFloor(v: string) {
    if (onFloorChange) onFloorChange(v);
    else setInternalFloor(v);
  }
  function setUnitType(v: string) {
    if (onUnitTypeChange) onUnitTypeChange(v);
    else setInternalUnitType(v);
  }
  function setViewMode(v: ChartViewMode) {
    if (onViewModeChange) onViewModeChange(v);
    else setInternalViewMode(v);
  }

  // ── Filtered units ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let units = inventoryUnits;
    if (unitCategory === 'Residential') {
      units = units.filter(u => !u.unit_type?.includes('Car Parking') && !u.unit_type?.includes('Motorcycle Parking'));
    } else if (unitCategory === 'Car Parking') {
      units = units.filter(u => u.unit_type?.includes('Car Parking'));
    } else if (unitCategory === 'Motorcycle Parking') {
      units = units.filter(u => u.unit_type?.includes('Motorcycle Parking'));
    }
    if (floor)    units = units.filter(u => u.floor === floor);
    if (unitType) units = units.filter(u => u.unit_type === unitType);
    return units;
  }, [inventoryUnits, unitCategory, floor, unitType]);

  // ── Derive floors & unit types from inventory if not provided ───────────────
  const floors = useMemo(() => {
    if (floorsProp) return floorsProp;
    const base = unitCategory
      ? inventoryUnits.filter(u => {
          if (unitCategory === 'Residential') return !u.unit_type?.includes('Car Parking') && !u.unit_type?.includes('Motorcycle Parking');
          if (unitCategory === 'Car Parking')        return u.unit_type?.includes('Car Parking');
          if (unitCategory === 'Motorcycle Parking') return u.unit_type?.includes('Motorcycle Parking');
          return true;
        })
      : inventoryUnits;
    return [...new Set(base.map(u => u.floor))].filter(Boolean)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [floorsProp, inventoryUnits, unitCategory]);

  const unitTypes = useMemo(() => {
    if (unitTypesProp) return unitTypesProp;
    if (unitCategory !== 'Residential') return [];
    return [...new Set(inventoryUnits.filter(u =>
      !u.unit_type?.includes('Car Parking') && !u.unit_type?.includes('Motorcycle Parking')
    ).map(u => u.unit_type))].filter(Boolean).sort();
  }, [unitTypesProp, inventoryUnits, unitCategory]);

  // ── Chart data ──────────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c = { available: 0, booked: 0, reserved: 0, unavailable: 0 };
    filtered.forEach(u => { const s = u.status?.toLowerCase() as keyof typeof c; if (s in c) c[s]++; });
    return c;
  }, [filtered]);

  const uniqueFloors = useMemo(() =>
    [...new Set(filtered.map(u => u.floor))].filter(Boolean)
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' })),
    [filtered]);

  const uniqueUnitNos = useMemo(() =>
    [...new Set(filtered.map(u => u.unit_no))].filter(Boolean)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })),
    [filtered]);

  const unitMap = useMemo(() => {
    const m = new Map<string, Map<string, string>>();
    filtered.forEach(u => {
      if (!m.has(u.floor)) m.set(u.floor, new Map());
      m.get(u.floor)!.set(u.unit_no, u.status);
    });
    return m;
  }, [filtered]);

  const unitCodeMap = useMemo(() => {
    const m = new Map<string, string | null>();
    filtered.forEach(u => m.set(`${u.floor}__${u.unit_no}`, u.inventory_code));
    return m;
  }, [filtered]);

  const availableUnits = useMemo(() =>
    filtered.filter(u => u.status?.toLowerCase() === 'available' && u.inventory_code !== excludeCode)
      .sort((a, b) => a.floor.localeCompare(b.floor, undefined, { numeric: true }) || a.unit_no.localeCompare(b.unit_no)),
    [filtered, excludeCode]);

  const totalUnits = counts.available + counts.booked + counts.reserved + counts.unavailable;

  const LEGENDS = [
    { label: 'Available',   bg: 'bg-[#DCFCE7]', text: 'text-[#166534]', count: counts.available },
    { label: 'Booked',      bg: 'bg-[#FEE2E2]', text: 'text-[#991B1B]', count: counts.booked },
    { label: 'Reserved',    bg: 'bg-[#FFEDD5]', text: 'text-[#9A3412]', count: counts.reserved },
    { label: 'Unavailable', bg: 'bg-[#E5E7EB]', text: 'text-[#6B7280]', count: counts.unavailable },
  ];

  // ── PDF export ──────────────────────────────────────────────────────────────
  const generatePDF = async () => {
    const { jsPDF } = await import('jspdf');
    const pageW = 297, pageH = 210, mg = 12;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const coral: [number,number,number] = [192,61,37];
    const dark:  [number,number,number] = [28,28,30];
    const lt:    [number,number,number] = [142,142,147];
    const HDR = 22;
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });

    let logoB64 = '', logoW = 18, logoH = 18;
    try {
      const res = await fetch('/document logo.png');
      const blob = await res.blob();
      logoB64 = await new Promise<string>(resolve => {
        const r = new FileReader(); r.onloadend = () => resolve(r.result as string); r.readAsDataURL(blob);
      });
      const dims = await new Promise<{ w: number; h: number }>(resolve => {
        const img = new Image(); img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve({ w:1,h:1 }); img.src = logoB64;
      });
      logoH = 18; logoW = Math.round((dims.w / dims.h) * logoH);
    } catch {}

    const COLS_PER_TABLE = 33, ROWS_PER_TABLE = 20, FOOTER_H = 16;
    const floorColW = 16;
    const tableDataW = pageW - mg * 2 - floorColW;
    const unitColW = tableDataW / COLS_PER_TABLE;
    const rowH = 7;
    const TABLE_TOP = HDR + 24.5;
    const FOOTER_LINE_Y = pageH - FOOTER_H;
    const fs = 6.5, cellFs = 5;

    const unitChunks: string[][] = [];
    for (let i = 0; i < uniqueUnitNos.length; i += COLS_PER_TABLE)
      unitChunks.push(uniqueUnitNos.slice(i, i + COLS_PER_TABLE));
    if (unitChunks.length === 0) unitChunks.push([]);

    const floorChunks: string[][] = [];
    for (let i = 0; i < uniqueFloors.length; i += ROWS_PER_TABLE)
      floorChunks.push(uniqueFloors.slice(i, i + ROWS_PER_TABLE));
    if (floorChunks.length === 0) floorChunks.push([]);

    type TableEntry = { floorChunk: string[]; unitChunk: string[] };
    const allTables: TableEntry[] = [];
    for (const fc of floorChunks) for (const uc of unitChunks) allTables.push({ floorChunk: fc, unitChunk: uc });

    let curPage = 0, curY = TABLE_TOP;
    const positioned: { table: TableEntry; page: number; y: number }[] = [];
    for (const table of allTables) {
      const tH = rowH * (table.floorChunk.length + 1);
      if (positioned.length > 0 && curY + tH > FOOTER_LINE_Y) { curPage++; curY = TABLE_TOP; }
      positioned.push({ table, page: curPage, y: curY });
      curY += tH + rowH;
    }
    const totalPages = curPage + 1;
    const pageGroups: { table: TableEntry; y: number }[][] = Array.from({ length: totalPages }, () => []);
    for (const { table, page, y } of positioned) pageGroups[page].push({ table, y });

    const drawTable = ({ floorChunk, unitChunk }: TableEntry, topY: number) => {
      const hdrBg: [number,number,number] = [229,231,235];
      const hdrFg: [number,number,number] = [55,65,81];
      doc.setDrawColor(210,210,210); doc.setLineWidth(0.15);
      doc.setFillColor(...hdrBg); doc.rect(mg, topY, floorColW, rowH, 'FD');
      doc.setFont('helvetica','bold'); doc.setFontSize(fs); doc.setTextColor(...hdrFg);
      doc.text('Floor', mg + floorColW / 2, topY + rowH * 0.65, { align: 'center' });
      unitChunk.forEach((unitNo, i) => {
        const x = mg + floorColW + i * unitColW;
        doc.setFillColor(...hdrBg); doc.rect(x, topY, unitColW, rowH, 'FD');
        doc.setFont('helvetica','bold'); doc.setFontSize(fs); doc.setTextColor(...hdrFg);
        doc.text(pad2(unitNo), x + unitColW / 2, topY + rowH * 0.65, { align: 'center' });
      });
      floorChunk.forEach((fl, ri) => {
        const y = topY + (ri + 1) * rowH;
        doc.setFillColor(243,244,246); doc.rect(mg, y, floorColW, rowH, 'FD');
        doc.setFont('helvetica','bold'); doc.setFontSize(fs); doc.setTextColor(...hdrFg);
        doc.text(fl, mg + floorColW / 2, y + rowH * 0.65, { align: 'center' });
        unitChunk.forEach((unitNo, ci) => {
          const x = mg + floorColW + ci * unitColW;
          const status = unitMap.get(fl)?.get(unitNo);
          if (status === undefined) {
            doc.setFillColor(55,65,81); doc.rect(x, y, unitColW, rowH, 'FD');
          } else {
            const { bg, fg } = statusRgb(status);
            doc.setFillColor(...bg); doc.rect(x, y, unitColW, rowH, 'FD');
            doc.setFont('helvetica','normal'); doc.setFontSize(cellFs); doc.setTextColor(...fg);
            doc.text(pad2(fl) + pad2(unitNo), x + unitColW / 2, y + rowH * 0.65, { align: 'center' });
          }
        });
      });
    };

    pageGroups.forEach((pageChunks, pageIdx) => {
      if (pageIdx > 0) doc.addPage();
      doc.setFillColor(...coral); doc.rect(0, 0, pageW, HDR, 'F');
      if (logoB64) doc.addImage(logoB64, 'PNG', mg, (HDR - logoH) / 2, logoW, logoH);
      doc.setTextColor(255,255,255);
      doc.setFont('helvetica','bold'); doc.setFontSize(14);
      doc.text('AVAILABILITY CHART', pageW - mg, 10, { align: 'right' });
      doc.setFont('helvetica','normal'); doc.setFontSize(7.5);
      doc.text(`${dateStr}  ·  ${timeStr}`, pageW - mg, 17, { align: 'right' });

      const infoLabels = ['PROJECT','TOWER','CATEGORY', ...(floor ? ['FLOOR'] : []), ...(unitType ? ['UNIT TYPE'] : [])];
      const infoValues = [project, tower, unitCategory, ...(floor ? [floor] : []), ...(unitType ? [unitType] : [])];
      const infoColW = (pageW - mg * 2) / infoLabels.length;
      const infoY = HDR + 5;
      infoLabels.forEach((lbl, i) => {
        const x = mg + i * infoColW;
        doc.setFont('helvetica','bold'); doc.setFontSize(6.5); doc.setTextColor(...lt);
        doc.text(lbl, x, infoY);
        doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(...dark);
        doc.text(infoValues[i], x, infoY + 5);
      });

      const divY = HDR + 13;
      doc.setDrawColor(210,210,220); doc.setLineWidth(0.4);
      doc.line(mg, divY, pageW - mg, divY);

      const legY = divY + 5.5;
      let lx = mg;
      [{ label:'Available',s:'available',count:counts.available },{ label:'Reserved',s:'reserved',count:counts.reserved },{ label:'Booked',s:'booked',count:counts.booked },{ label:'Unavailable',s:'unavailable',count:counts.unavailable }].forEach(({ label, count, s }) => {
        const { bg, fg } = statusRgb(s);
        doc.setFillColor(...bg); doc.roundedRect(lx, legY - 3, 10, 4.5, 0.8, 0.8, 'F');
        doc.setFont('helvetica','bold'); doc.setFontSize(6.5); doc.setTextColor(...fg);
        doc.text(String(count), lx + 5, legY, { align: 'center' });
        doc.setTextColor(...dark); doc.setFont('helvetica','normal'); doc.setFontSize(7);
        doc.text(label, lx + 12, legY);
        lx += 42;
      });
      doc.setTextColor(...lt); doc.setFont('helvetica','normal'); doc.setFontSize(7);
      doc.text(`Total: ${totalUnits} units`, pageW - mg, legY, { align: 'right' });
      if (totalPages > 1) {
        doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(...lt);
        doc.text(`Page ${pageIdx + 1} of ${totalPages}`, pageW / 2, legY, { align: 'center' });
      }
      pageChunks.forEach(({ table, y }) => drawTable(table, y));

      const footY = pageH - FOOTER_H + 2;
      doc.setDrawColor(...coral); doc.setLineWidth(0.3);
      doc.line(mg, footY, pageW - mg, footY);
      doc.setFont('helvetica','bold'); doc.setFontSize(6.5); doc.setTextColor(...coral);
      doc.text('DISCLAIMER', mg, footY + 4);
      doc.setFont('helvetica','normal'); doc.setFontSize(6.5); doc.setTextColor(...lt);
      doc.text(doc.splitTextToSize('Unit availability is subject to change without prior notice. This document is for reference purposes only and does not constitute a binding offer or reservation.', pageW - mg * 2), mg, footY + 7.5);
      doc.text(`Generated: ${dateStr}  at  ${timeStr}`, pageW - mg, footY + 12, { align: 'right' });
    });

    doc.save(`Availability_${project}_${tower}_${Date.now()}.pdf`);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (filtered.length === 0 && !unitCategory) return null;

  return (
    <div className="space-y-3">
      {/* Category tabs */}
      {showCategoryTabs && (
        <div className="flex gap-2">
          {UNIT_CATEGORIES.map(({ value, label, icon }) => {
            const active = unitCategory === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setUnitCategory(value)}
                className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-2xl border-2 text-xs font-semibold transition-all ${
                  active
                    ? 'bg-[#C03D25]/10 border-[#C03D25] text-[#C03D25]'
                    : 'bg-white border-[#E5E5EA] text-[#6C6C70]'
                }`}
              >
                <span className={active ? 'text-[#C03D25]' : 'text-[#8E8E93]'}>{icon}</span>
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Floor + Unit Type filters */}
      {showFilters && unitCategory && (floors.length > 0 || unitTypes.length > 0) && (
        <div className="bg-white/70 rounded-2xl border border-black/[0.06] px-3 py-1">
          {floors.length > 0 && (
            <FilterSelect
              icon={<Layers size={15} />}
              label="Floor"
              value={floor}
              options={floors}
              onChange={setFloor}
              placeholder="All floors"
            />
          )}
          {unitCategory === 'Residential' && unitTypes.length > 0 && (
            <FilterSelect
              icon={<LayoutGrid size={15} />}
              label="Unit Type"
              value={unitType}
              options={unitTypes}
              onChange={setUnitType}
              placeholder="All types"
            />
          )}
        </div>
      )}

      {/* Chart card */}
      {unitCategory && filtered.length > 0 && (
        <div className="bg-white/70 rounded-2xl border border-black/[0.06] p-4 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-[#C03D25]"><BarChart3 size={13} /></span>
                <p className="text-[#6C6C70] text-[11px] font-semibold uppercase tracking-wider">Availability Chart</p>
              </div>
              <p className="text-[#1C1C1E] text-[11px] font-medium mt-0.5 pl-[19px]">Total: {totalUnits} units</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setViewMode('chart')}
                className={`p-2.5 rounded-xl border-2 transition-all ${viewMode === 'chart' ? 'bg-[#C03D25]/10 border-[#C03D25] text-[#C03D25]' : 'border-[#E5E5EA] text-[#8E8E93]'}`}>
                <BarChart3 size={18} />
              </button>
              <button type="button" onClick={() => setViewMode('grid')}
                className={`p-2.5 rounded-xl border-2 transition-all ${viewMode === 'grid' ? 'bg-[#C03D25]/10 border-[#C03D25] text-[#C03D25]' : 'border-[#E5E5EA] text-[#8E8E93]'}`}>
                <Grid3X3 size={18} />
              </button>
              <div className="w-px h-6 bg-black/[0.08]" />
              <button type="button" onClick={generatePDF}
                className="p-2.5 rounded-xl border-2 border-[#E5E5EA] text-[#8E8E93] active:bg-[#F2F2F7]">
                <FileDown size={18} />
              </button>
            </div>
          </div>

          {/* Chart view */}
          {viewMode === 'chart' && (
            <>
              <div className="flex flex-wrap gap-x-3 gap-y-2">
                {LEGENDS.map(({ label, bg, text, count }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <div className={`${bg} ${text} rounded-md px-2 py-0.5 text-[11px] font-bold min-w-[28px] text-center`}>{count}</div>
                    <span className="text-[#6C6C70] text-[11px]">{label}</span>
                  </div>
                ))}
              </div>
              <div className="overflow-auto rounded-xl border border-black/[0.06]" style={{ maxHeight: '400px' }}>
                <table className="border-collapse text-xs" style={{ minWidth: `${(uniqueUnitNos.length + 1) * 70}px` }}>
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-20 bg-[#E5E7EB] font-bold text-[#374151] px-3 py-2 border-b-2 border-r border-black/[0.1] whitespace-nowrap min-w-[64px] text-center">Floor</th>
                      {uniqueUnitNos.map(unitNo => (
                        <th key={unitNo} className="bg-[#E5E7EB] font-bold text-[#374151] px-1 py-2 border-b-2 border-r border-black/[0.1] whitespace-nowrap min-w-[64px] text-center">{pad2(unitNo)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {uniqueFloors.map(fl => (
                      <tr key={fl}>
                        <td className="sticky left-0 z-10 bg-[#F3F4F6] font-semibold text-[#374151] px-3 py-2.5 border-b border-r border-black/[0.08] whitespace-nowrap min-w-[64px] text-center">{fl}</td>
                        {uniqueUnitNos.map(unitNo => {
                          const status  = unitMap.get(fl)?.get(unitNo);
                          const hasUnit = status !== undefined;
                          const code    = unitCodeMap.get(`${fl}__${unitNo}`);
                          const isCurrent   = !!excludeCode && code === excludeCode;
                          const isAvailable = hasUnit && status?.toLowerCase() === 'available' && !isCurrent;
                          return (
                            <td
                              key={unitNo}
                              onClick={() => {
                                if (isAvailable) {
                                  const unit = filtered.find(u => u.floor === fl && u.unit_no === unitNo);
                                  if (unit) onSelectUnit(unit);
                                }
                              }}
                              title={isCurrent ? 'Current unit' : undefined}
                              className={`px-1 py-2.5 border-b border-r border-white/60 text-center whitespace-nowrap min-w-[64px] font-medium
                                ${!hasUnit ? 'bg-[#374151]'
                                  : isCurrent ? 'bg-[#FEF9C3] text-[#854D0E] cursor-not-allowed'
                                  : isAvailable ? statusColor(status) + ' cursor-pointer active:opacity-60'
                                  : statusColor(status) + ' cursor-not-allowed'}`}
                            >
                              {hasUnit ? (isCurrent ? `${pad2(fl)}${pad2(unitNo)} ★` : `${pad2(fl)}${pad2(unitNo)}`) : ''}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Grid view */}
          {viewMode === 'grid' && (
            <>
              <p className="text-[#6C6C70] text-xs font-medium px-1">
                <span className="text-[#1C1C1E] font-bold text-sm">{availableUnits.length}</span>{' '}available units
              </p>
              <div className="grid grid-cols-2 gap-2 overflow-y-auto" style={{ maxHeight: '420px' }}>
                {availableUnits.map(u => {
                  const catIcon = UNIT_CATEGORIES.find(c => c.value === unitCategory)?.icon;
                  return (
                    <div
                      key={`${u.floor}-${u.unit_no}`}
                      onClick={() => onSelectUnit(u)}
                      className="bg-[#F2F2F7] rounded-2xl p-4 flex flex-col gap-2.5 shadow-md shadow-black/10 relative overflow-hidden cursor-pointer active:opacity-70"
                    >
                      {u.promo_discount && (() => {
                        const n = parseFloat(u.promo_discount);
                        const pct = !isNaN(n) ? (n > 0 && n < 1 ? Math.round(n * 100) : Math.round(n)) : null;
                        return pct ? (
                          <div className="absolute top-0 right-3 w-12 flex flex-col items-center pt-1.5 pb-4 bg-[#166534] text-white z-10"
                            style={{ clipPath: 'polygon(0 0, 100% 0, 100% 78%, 50% 100%, 0 78%)' }}>
                            <span className="text-[7px] font-semibold leading-tight tracking-wide uppercase">Up to</span>
                            <span className="text-sm font-extrabold leading-none">{pct}%</span>
                          </div>
                        ) : null;
                      })()}
                      <div className="flex items-center gap-1 min-w-0 pr-10">
                        {catIcon && <span className="text-[#C03D25] shrink-0" style={{ fontSize: 12 }}>{catIcon}</span>}
                        <span className="text-sm font-bold text-[#1C1C1E] leading-tight truncate">{pad2(u.floor)}{pad2(u.unit_no)}</span>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[10px] text-[#8E8E93]">Tower: <span className="text-[#1C1C1E] font-medium">{tower}</span></p>
                        <p className="text-[10px] text-[#8E8E93]">Floor: <span className="text-[#1C1C1E] font-medium">{u.floor}</span></p>
                        <p className="text-[10px] text-[#8E8E93]">Area: <span className="text-[#1C1C1E] font-medium">{u.unit_area} sqm</span></p>
                      </div>
                      <div className="border-t border-black/[0.08]" />
                      <div className="flex items-center justify-between">
                        <span className="text-[#8E8E93] text-xs font-semibold uppercase tracking-wide">Price</span>
                        <span className="text-[#C03D25] text-sm font-bold">₱{Number(u.total_list_price).toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
