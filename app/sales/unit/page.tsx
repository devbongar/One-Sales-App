'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import GlassButton from '@/components/ui/GlassButton';
import { Building2, Layers, BedDouble, Maximize2, Hash } from 'lucide-react';
import { InventoryUnit } from '@/types';

function formatPriceFull(raw: string | null): string {
  if (!raw) return '—';
  const num = parseFloat(String(raw).replace(/[₱,\s]/g, ''));
  if (isNaN(num)) return '—';
  return '₱' + num.toLocaleString('en-PH');
}

function parseDiscount(raw: string | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s || s === '0' || s === '0%') return null;
  return s.endsWith('%') ? s : s + '%';
}

function StarBadge({ value }: { value: string }) {
  return (
    <div
      className="w-32 h-32 flex flex-col items-center justify-center gap-0.5 shrink-0"
      style={{
        clipPath:
          'polygon(50% 0%,58.5% 18.1%,75% 6.7%,73.3% 26.7%,93.3% 25%,81.9% 41.5%,100% 50%,81.9% 58.5%,93.3% 75%,73.3% 73.3%,75% 93.3%,58.5% 81.9%,50% 100%,41.5% 81.9%,25% 93.3%,26.7% 73.3%,6.7% 75%,18.1% 58.5%,0% 50%,18.1% 41.5%,6.7% 25%,26.7% 26.7%,25% 6.7%,41.5% 18.1%)',
        background: '#E8634A',
      }}
    >
      <span className="text-white text-[11px] font-bold leading-tight text-center">Promo</span>
      <span className="text-white text-[11px] font-bold leading-tight text-center">Discount</span>
      <span className="text-white text-xl font-extrabold leading-tight">{value}</span>
    </div>
  );
}

interface InfoItemProps {
  icon: React.ReactNode;
  value: string | null;
  label: string;
}

function InfoItem({ icon, value, label }: InfoItemProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[#8E8E93]">{icon}</span>
        <span className="text-[#1C1C1E] text-base font-bold leading-tight">{value ?? '—'}</span>
      </div>
      <p className="text-[#8E8E93] text-[11px] font-medium pl-0.5">{label}</p>
    </div>
  );
}

export default function UnitDetailPage() {
  const router = useRouter();
  const [unit, setUnit] = useState<InventoryUnit | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem('selectedUnit');
    if (raw) {
      try { setUnit(JSON.parse(raw)); } catch { router.back(); }
    } else {
      router.back();
    }
  }, [router]);

  if (!unit) return null;

  const discount = parseDiscount(unit.promo_discount);

  return (
    <PageShell title="Unit Details" backButton>
      <div className="bg-white rounded-3xl shadow-sm border border-black/[0.06] overflow-hidden">
        {/* Header */}
        <div className="p-5 pb-4 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[#1C1C1E] text-base font-semibold leading-snug">{unit.project_name ?? '—'}</p>
            <p className="text-[#E8634A] text-2xl font-extrabold mt-1 leading-tight">
              Unit {unit.unit_no ?? '—'}
            </p>
            <p className="text-[#1C1C1E] text-3xl font-extrabold mt-1 leading-tight tracking-tight">
              {formatPriceFull(unit.total_list_price)}
            </p>
          </div>
          {discount && <StarBadge value={discount} />}
        </div>

        <div className="border-t border-black/[0.06] mx-5" />

        {/* Tower / Floor / Unit Type */}
        <div className="px-5 py-4 grid grid-cols-3 gap-4">
          <InfoItem
            icon={<Building2 size={16} />}
            value={unit.tower}
            label="Tower"
          />
          <InfoItem
            icon={<Layers size={16} />}
            value={unit.floor}
            label="Floor"
          />
          <InfoItem
            icon={<BedDouble size={16} />}
            value={unit.unit_type}
            label="Unit Type"
          />
        </div>

        <div className="border-t border-black/[0.06] mx-5" />

        {/* Area / Inventory Code */}
        <div className="px-5 py-4 grid grid-cols-2 gap-4">
          <InfoItem
            icon={<Maximize2 size={16} />}
            value={unit.unit_area != null ? `${unit.unit_area} sqm` : null}
            label="Unit Area"
          />
          <InfoItem
            icon={<Hash size={16} />}
            value={unit.inventory_code}
            label="Inventory Code"
          />
        </div>
      </div>

      <GlassButton
        variant="primary"
        size="lg"
        className="w-full mt-2"
        onClick={() => router.push('/sales/quotation')}
      >
        Get Quotation
      </GlassButton>
    </PageShell>
  );
}
