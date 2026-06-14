'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertTriangle, Building2, Check, CheckCircle2, ChevronLeft, ChevronRight,
  Download, Loader2, Search, SlidersHorizontal, Upload, X,
} from 'lucide-react';
import PageShell from '@/components/layout/PageShell';
import GlassCard from '@/components/ui/GlassCard';
import SearchableSelect from '@/components/ui/SearchableSelect';
import {
  postCollection,
  fetchCollections,
  fetchCollectionApplicationsByIds,
  CollectionRecord,
  CollectionApplication,
} from '@/lib/collections';
import {
  fetchReceivableSummaries,
  fetchReceivableLines,
  generateReceivableLines,
  ReservationReceivableSummary,
  ReceivableLine,
} from '@/lib/receivables';
import { fetchTurnoverDate } from '@/lib/admin';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImportRow {
  reservation_id:             string;
  client_name:                string;
  inventory_code:             string;
  total_outstanding:          number;
  amount_received:            number;
  mode_of_payment:            string;
  acknowledgement_receipt_no: string;
  sales_invoice_number:       string;
  posting_date:               string;
  check_no:                   string;
  check_date:                 string;
  _row:                       number;
}

interface ValidationProblem {
  row:    ImportRow;
  reason: string;
}

interface ValidationResult {
  valid:    ImportRow[];
  problems: ValidationProblem[];
  skipped:  ImportRow[]; // reservation has no outstanding — nothing to collect
  blank:    ImportRow[]; // amount_received or MOP not filled
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPeso(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}


function getInitials(name: string) {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function schemeLabel(s: string) {
  const map: Record<string, string> = {
    spot_cash:     'Spot Cash',
    deferred_cash: 'Deferred Cash',
    spot_dp:       'Spot DP',
    stretched_dp:  'Stretched DP',
  };
  return map[s] ?? s;
}

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  Complete: { background: 'rgba(52,199,89,0.12)',  color: '#1A7F37' },
  Overdue:  { background: 'rgba(255,59,48,0.12)',  color: '#C0001E' },
  Unpaid:   { background: 'rgba(255,159,10,0.12)', color: '#A05A00' },
};

const MODES_OF_PAYMENT = ['Cash', 'Check', 'Online Transfer', 'PDC'];

const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-black/[0.10] bg-white text-sm text-[#1C1C1E] outline-none focus:border-[#C03D25]/40 focus:ring-1 focus:ring-[#C03D25]/20 transition-colors placeholder:text-[#C7C7CC]';

// ─── Excel Export ─────────────────────────────────────────────────────────────

function exportBatch(summaries: ReservationReceivableSummary[]) {
  const toExport = summaries.filter(s => s.outstanding > 0);

  if (toExport.length === 0) {
    alert('No outstanding collections to export.');
    return;
  }

  const rows = toExport.map(s => ({
    reservation_id:             s.reservation_id,
    client_name:                s.client_name,
    inventory_code:             s.inventory_code,
    total_outstanding:          s.outstanding.toFixed(2),
    amount_received:            '',
    mode_of_payment:            '',
    acknowledgement_receipt_no: '',
    sales_invoice_number:       '',
    posting_date:               localToday(),
    check_no:                   '',
    check_date:                 '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 28 }, // reservation_id
    { wch: 28 }, // client_name
    { wch: 16 }, // inventory_code
    { wch: 18 }, // total_outstanding
    { wch: 18 }, // amount_received
    { wch: 18 }, // mode_of_payment
    { wch: 24 }, // acknowledgement_receipt_no
    { wch: 20 }, // sales_invoice_number
    { wch: 12 }, // posting_date
    { wch: 14 }, // check_no
    { wch: 12 }, // check_date
  ];

  const instructions = [
    ['COLLECTION POSTING — IMPORT INSTRUCTIONS'],
    [''],
    ['HOW THIS WORKS:'],
    ['Each row represents one payment received from a buyer.'],
    ['The system will automatically allocate the amount to unpaid lines, oldest-first.'],
    ['Finance never decides allocation — just enter the total amount received.'],
    [''],
    ['COLUMNS YOU MUST FILL IN:'],
    ['amount_received',            'Required. Total amount received from the buyer (PHP)'],
    ['mode_of_payment',            'Required. Must be one of the allowed values listed below.'],
    ['acknowledgement_receipt_no', 'OR / Acknowledgement receipt number'],
    ['sales_invoice_number',       'Sales invoice number'],
    ['posting_date',               'Date of posting (YYYY-MM-DD). Pre-filled with today.'],
    ['check_no',                   'Required only when mode_of_payment = Check'],
    ['check_date',                 'Required only when mode_of_payment = Check (YYYY-MM-DD)'],
    [''],
    ['ALLOWED MODE OF PAYMENT VALUES:'],
    ...MODES_OF_PAYMENT.map((m, i) => [`  ${i + 1}. ${m}`]),
    [''],
    ['LOCKED COLUMNS — DO NOT EDIT:'],
    ['reservation_id',   'Unique reservation identifier used for matching'],
    ['client_name',      'Read-only'],
    ['inventory_code',   'Read-only'],
    ['total_outstanding','Outstanding balance — used for validation. Do not edit.'],
    [''],
    ['NOTE: Rows where amount_received or mode_of_payment is left blank will be skipped on import.'],
  ];
  const wsInstr = XLSX.utils.aoa_to_sheet(instructions);
  wsInstr['!cols'] = [{ wch: 36 }, { wch: 64 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws,     'Collections');
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instructions');
  XLSX.writeFile(wb, `collections-batch-${localToday()}.xlsx`);
}

// ─── Excel Import — Parse ─────────────────────────────────────────────────────

function parseImportFile(file: File): Promise<ImportRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb   = XLSX.read(data, { type: 'array' });
        const ws   = wb.Sheets['Collections'];
        if (!ws) {
          reject(new Error('Sheet "Collections" not found. Make sure you are uploading the exported file.'));
          return;
        }
        const raw  = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
        const rows: ImportRow[] = raw.map((r, i) => ({
          reservation_id:             String(r['reservation_id']             ?? '').trim(),
          client_name:                String(r['client_name']                ?? '').trim(),
          inventory_code:             String(r['inventory_code']             ?? '').trim(),
          total_outstanding:          Number(r['total_outstanding']          ?? 0),
          amount_received:            Number(r['amount_received']            ?? 0),
          mode_of_payment:            String(r['mode_of_payment']            ?? '').trim(),
          acknowledgement_receipt_no: String(r['acknowledgement_receipt_no'] ?? '').trim(),
          sales_invoice_number:       String(r['sales_invoice_number']       ?? '').trim(),
          posting_date:               String(r['posting_date']               ?? '').trim(),
          check_no:                   String(r['check_no']                   ?? '').trim(),
          check_date:                 String(r['check_date']                 ?? '').trim(),
          _row:                       i + 2,
        }));
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsArrayBuffer(file);
  });
}

// ─── Excel Import — Validate ──────────────────────────────────────────────────

async function validateImportRows(
  rows: ImportRow[],
  dbSummaries: ReservationReceivableSummary[],
): Promise<ValidationResult> {
  const problems: ValidationProblem[] = [];
  const valid:    ImportRow[]         = [];
  const skipped:  ImportRow[]         = [];
  const blank:    ImportRow[]         = [];

  const summaryMap = new Map(dbSummaries.map(s => [s.reservation_id, s]));

  for (const row of rows) {
    // Blank — neither amount nor MOP filled (row was not filled in at all)
    if (!row.mode_of_payment && (!row.amount_received || row.amount_received <= 0)) {
      blank.push(row);
      continue;
    }

    // 1a. Amount received
    if (!row.amount_received || row.amount_received <= 0) {
      problems.push({ row, reason: 'Amount received is required and must be greater than zero.' });
      continue;
    }

    // 1b. Mode of payment — present and valid
    if (!row.mode_of_payment) {
      problems.push({ row, reason: 'Mode of payment is required.' });
      continue;
    }
    if (!MODES_OF_PAYMENT.includes(row.mode_of_payment)) {
      problems.push({ row, reason: `"${row.mode_of_payment}" is not an allowed mode of payment. Allowed values: ${MODES_OF_PAYMENT.join(', ')}.` });
      continue;
    }

    // 1c. Acknowledgement receipt no.
    if (!row.acknowledgement_receipt_no) {
      problems.push({ row, reason: 'Acknowledgement receipt no. is required.' });
      continue;
    }

    // 1d. Sales invoice number
    if (!row.sales_invoice_number) {
      problems.push({ row, reason: 'Sales invoice number is required.' });
      continue;
    }

    // 1e. Posting date
    if (!row.posting_date) {
      problems.push({ row, reason: 'Posting date is required.' });
      continue;
    }

    // 1f. Check-specific fields
    const isCheck = row.mode_of_payment === 'Check';
    if (isCheck && !row.check_no) {
      problems.push({ row, reason: 'Check No. is required when mode of payment is "Check".' });
      continue;
    }
    if (isCheck && !row.check_date) {
      problems.push({ row, reason: 'Check Date is required when mode of payment is "Check".' });
      continue;
    }

    // 3. Reservation ID + client name + inventory code must match records
    const summary = summaryMap.get(row.reservation_id);
    if (!summary) {
      problems.push({ row, reason: 'Reservation ID not found in records — it may have been edited.' });
      continue;
    }
    if (summary.client_name.trim().toLowerCase() !== row.client_name.trim().toLowerCase()) {
      problems.push({ row, reason: `Client name does not match records. Expected "${summary.client_name}".` });
      continue;
    }
    if (summary.inventory_code.trim().toLowerCase() !== row.inventory_code.trim().toLowerCase()) {
      problems.push({ row, reason: `Inventory code does not match records. Expected "${summary.inventory_code}".` });
      continue;
    }

    // No outstanding — nothing to collect
    if (summary.outstanding <= 0) {
      skipped.push(row);
      continue;
    }

    valid.push(row);
  }

  return { valid, problems, skipped, blank };
}

// ─── Section Divider ─────────────────────────────────────────────────────────

function SectionDivider({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-2 pt-1 pb-0.5">
      <div className="flex-1 h-px" style={{ background: `${color}30` }} />
      <span className="text-[10px] font-bold uppercase tracking-widest shrink-0" style={{ color }}>
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: `${color}30` }} />
    </div>
  );
}

// ─── Row Card (Import Modal) ──────────────────────────────────────────────────

type RowStatus = 'valid' | 'error' | 'skipped' | 'blank';

function RowCard({ row, status, reason }: { row: ImportRow; status: RowStatus; reason?: string }) {
  const colors = {
    valid:   { bg: 'rgba(52,199,89,0.06)',   border: 'rgba(52,199,89,0.18)',   text: '#1A7F37', badge: 'rgba(52,199,89,0.12)',  label: 'Ready' },
    error:   { bg: 'rgba(255,59,48,0.06)',   border: 'rgba(255,59,48,0.18)',   text: '#C0001E', badge: 'rgba(255,59,48,0.12)',  label: 'Error' },
    skipped: { bg: 'rgba(255,159,10,0.06)',  border: 'rgba(255,159,10,0.18)',  text: '#A05A00', badge: 'rgba(255,159,10,0.12)', label: 'No Outstanding' },
    blank:   { bg: 'rgba(142,142,147,0.06)', border: 'rgba(142,142,147,0.18)', text: '#6C6C70', badge: 'rgba(142,142,147,0.12)',label: 'Not Filled' },
  }[status];

  return (
    <div
      className="rounded-2xl p-3 space-y-1"
      style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <span className="text-[11px] font-bold shrink-0 mt-0.5" style={{ color: colors.text }}>
            #{row._row}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#1C1C1E] truncate">{row.client_name}</p>
            <p className="text-[11px] text-[#6C6C70] truncate">{row.inventory_code}</p>
          </div>
        </div>
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
          style={{ background: colors.badge, color: colors.text }}
        >
          {colors.label}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-0.5 pl-[22px]">
        {row.amount_received > 0 && (
          <span className="text-[11px] text-[#8E8E93]">Amt: <span className="font-medium text-[#1C1C1E]">{fmtPeso(row.amount_received)}</span></span>
        )}
        {row.mode_of_payment && (
          <span className="text-[11px] text-[#8E8E93]">MOP: <span className="font-medium text-[#1C1C1E]">{row.mode_of_payment}</span></span>
        )}
        {row.acknowledgement_receipt_no && (
          <span className="text-[11px] text-[#8E8E93]">OR#: <span className="font-medium text-[#1C1C1E]">{row.acknowledgement_receipt_no}</span></span>
        )}
        {row.sales_invoice_number && (
          <span className="text-[11px] text-[#8E8E93]">SI#: <span className="font-medium text-[#1C1C1E]">{row.sales_invoice_number}</span></span>
        )}
        {row.posting_date && (
          <span className="text-[11px] text-[#8E8E93]">Date: <span className="font-medium text-[#1C1C1E]">{row.posting_date}</span></span>
        )}
        {row.check_no && (
          <span className="text-[11px] text-[#8E8E93]">Chk#: <span className="font-medium text-[#1C1C1E]">{row.check_no}</span></span>
        )}
      </div>

      {status === 'error' && (
        <div
          className="flex items-start gap-1.5 pl-[22px] pt-1.5"
          style={{ borderTop: `1px solid ${colors.border}` }}
        >
          <AlertTriangle size={11} className="shrink-0 mt-0.5" style={{ color: '#C0001E' }} />
          <p className="text-[11px] leading-snug whitespace-pre-line" style={{ color: '#C0001E' }}>
            {reason ?? 'Unknown error'}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Import Validation Modal ──────────────────────────────────────────────────

function ImportValidationModal({
  result,
  onConfirm,
  onCancel,
  posting,
}: {
  result:    ValidationResult;
  onConfirm: () => void;
  onCancel:  () => void;
  posting:   boolean;
}) {
  const hasValid    = result.valid.length > 0;
  const hasProblems = result.problems.length > 0;
  const hasSkipped  = result.skipped.length > 0;
  const hasBlank    = result.blank.length > 0;
  const total       = result.valid.length + result.problems.length + result.skipped.length + result.blank.length;

  return (
    <div className="fixed inset-0 z-[70] flex items-end">
      <div className="absolute inset-0 bg-black/50" onClick={!posting ? onCancel : undefined} />
      <div
        className="relative w-full bg-white rounded-t-3xl pt-5 pb-10 max-h-[82vh] flex flex-col"
        style={{ animation: 'sheetSlideUp 0.28s cubic-bezier(0.32,0.72,0,1) both' }}
      >
        <style>{`@keyframes sheetSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

        <div className="flex items-start justify-between px-5 mb-3 shrink-0">
          <div>
            <p className="text-[#1C1C1E] font-bold text-base">Import Review</p>
            <p className="text-[#8E8E93] text-sm mt-0.5">{total} row{total !== 1 ? 's' : ''} in file</p>
          </div>
          {!posting && (
            <button onClick={onCancel} className="p-2 rounded-2xl bg-[#F2F2F7]">
              <X size={18} className="text-[#1C1C1E]" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 px-5 mb-3 shrink-0">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ background: 'rgba(52,199,89,0.12)', color: '#1A7F37' }}>
            <Check size={11} />
            {result.valid.length} ready
          </div>
          {hasProblems && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background: 'rgba(255,59,48,0.10)', color: '#C0001E' }}>
              <AlertTriangle size={11} />
              {result.problems.length} error{result.problems.length !== 1 ? 's' : ''}
            </div>
          )}
          {hasSkipped && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background: 'rgba(255,159,10,0.10)', color: '#A05A00' }}>
              {result.skipped.length} no outstanding
            </div>
          )}
          {hasBlank && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background: 'rgba(142,142,147,0.10)', color: '#6C6C70' }}>
              {result.blank.length} not filled
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-2 space-y-1.5">
          {hasProblems && (
            <>
              <SectionDivider label={`${result.problems.length} Error${result.problems.length !== 1 ? 's' : ''} — will be skipped`} color="#C0001E" />
              {result.problems.map((p, i) => (
                <RowCard key={`err-${i}`} row={p.row} status="error" reason={p.reason} />
              ))}
            </>
          )}
          {hasSkipped && (
            <>
              <SectionDivider label={`${result.skipped.length} No Outstanding — will be skipped`} color="#A05A00" />
              {result.skipped.map((row, i) => (
                <RowCard key={`skip-${i}`} row={row} status="skipped" />
              ))}
            </>
          )}
          {hasValid && (
            <>
              <SectionDivider label={`${result.valid.length} Ready to post`} color="#1A7F37" />
              {result.valid.map((row, i) => (
                <RowCard key={`ok-${i}`} row={row} status="valid" />
              ))}
            </>
          )}
          {hasBlank && (
            <>
              <SectionDivider label={`${result.blank.length} Not filled`} color="#6C6C70" />
              {result.blank.map((row, i) => (
                <RowCard key={`blank-${i}`} row={row} status="blank" />
              ))}
            </>
          )}
          {total === 0 && (
            <div className="flex items-center justify-center py-10">
              <p className="text-sm text-[#8E8E93] text-center">No rows found in file.</p>
            </div>
          )}
        </div>

        <div className="flex gap-3 px-5 pt-3 shrink-0">
          {!posting && (
            <button
              onClick={onCancel}
              className="flex-1 py-3.5 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] text-sm font-semibold"
            >
              Cancel
            </button>
          )}
          {hasValid && (
            <button
              onClick={onConfirm}
              disabled={posting}
              className="flex-1 py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2"
              style={{ background: '#C03D25', color: '#fff', opacity: posting ? 0.7 : 1 }}
            >
              {posting
                ? <><Loader2 size={15} className="animate-spin" /> Posting…</>
                : <><Check size={15} /> Post {result.valid.length} collection{result.valid.length !== 1 ? 's' : ''}</>
              }
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Import Result Modal ──────────────────────────────────────────────────────

function ImportResultModal({ posted, errored, onClose }: {
  posted: number; errored: number; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative w-full bg-white rounded-t-3xl px-5 pt-6 pb-10 space-y-4"
        style={{ animation: 'sheetSlideUp 0.28s cubic-bezier(0.32,0.72,0,1) both' }}
      >
        <style>{`@keyframes sheetSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
        <div className="flex justify-center">
          <div
            className="w-14 h-14 rounded-3xl flex items-center justify-center"
            style={{ background: errored === 0 ? 'rgba(52,199,89,0.12)' : 'rgba(255,159,10,0.12)' }}
          >
            <CheckCircle2 size={28} style={{ color: errored === 0 ? '#1A7F37' : '#A05A00' }} />
          </div>
        </div>
        <div className="text-center space-y-1">
          <p className="text-[#1C1C1E] font-bold text-base">Import Complete</p>
          <p className="text-[#8E8E93] text-sm">
            {posted} collection{posted !== 1 ? 's' : ''} posted successfully
            {errored > 0 ? `, ${errored} failed` : ''}
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-full py-3.5 rounded-2xl text-sm font-bold"
          style={{ background: '#C03D25', color: '#fff' }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

// ─── Post Collection Sheet ────────────────────────────────────────────────────

function PostCollectionSheet({
  reservationId,
  unpaidLines,
  onClose,
  onPosted,
}: {
  reservationId: string;
  unpaidLines:   ReceivableLine[];
  onClose:       () => void;
  onPosted:      () => void;
}) {
  const today = localToday();
  const totalOutstanding = unpaidLines
    .filter(l => l.due_date < today)
    .reduce(
      (sum, l) => sum + Math.max(0, l.total_amount_due - (l.amount_paid ?? 0)),
      0,
    );

  const [amountStr, setAmountStr] = useState('');
  const [mop,       setMop]       = useState('');
  const [orNo,      setOrNo]      = useState('');
  const [siNo,      setSiNo]      = useState('');
  const [postDate,  setPostDate]  = useState(localToday());
  const [checkNo,   setCheckNo]   = useState('');
  const [checkDate, setCheckDate] = useState('');
  const [posting,   setPosting]   = useState(false);
  const [error,     setError]     = useState('');

  const amount    = parseFloat(amountStr) || 0;
  const isCheck   = mop === 'Check';
  const canSubmit = amount > 0 && mop && postDate && (!isCheck || (checkNo.trim() && checkDate));

  const allocationPreview = useMemo(() => {
    if (amount <= 0) return [];
    let remaining = amount;
    const result: { line: ReceivableLine; applied: number; fullyPaid: boolean }[] = [];
    for (const line of unpaidLines) {
      if (remaining <= 0) break;
      const balance = Math.max(0, line.total_amount_due - (line.amount_paid ?? 0));
      if (balance <= 0) continue;
      const applied = Math.min(remaining, balance);
      result.push({ line, applied, fullyPaid: applied >= balance - 0.005 });
      remaining -= applied;
    }
    return result;
  }, [amount, unpaidLines]);

  const excess = amount > totalOutstanding + 0.005 ? amount - totalOutstanding : 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setPosting(true);
    setError('');
    try {
      await postCollection(reservationId, {
        amount_received:            amount,
        mode_of_payment:            mop,
        acknowledgement_receipt_no: orNo.trim()  || undefined,
        sales_invoice_number:       siNo.trim()  || undefined,
        posting_date:               postDate,
        check_no:                   isCheck ? checkNo.trim() : undefined,
        check_date:                 isCheck ? checkDate      : undefined,
      });
      onPosted();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to post. Please try again.');
      setPosting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl flex flex-col"
        style={{ animation: 'sheetSlideUp 0.28s cubic-bezier(0.32,0.72,0,1) both', maxHeight: '92vh' }}
      >
        <style>{`@keyframes sheetSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-9 h-1 rounded-full bg-[#D1D1D6]" />
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 pb-2 space-y-4">

          {/* Header */}
          <div className="flex items-start justify-between pt-1">
            <div>
              <p className="text-[#1C1C1E] font-bold text-base">Post Collection</p>
              <p className="text-[#8E8E93] text-sm mt-0.5">
                Outstanding: {fmtPeso(totalOutstanding)}
              </p>
            </div>
            <button onClick={onClose} className="p-2 rounded-2xl bg-[#F2F2F7] shrink-0">
              <X size={18} className="text-[#1C1C1E]" />
            </button>
          </div>

          {/* Amount received */}
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-widest">
              Amount Received <span className="text-[#C03D25]">*</span>
            </p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#8E8E93]">PHP</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amountStr}
                onChange={e => setAmountStr(e.target.value)}
                placeholder={totalOutstanding.toFixed(2)}
                className="w-full pl-12 pr-3 py-2.5 rounded-xl border border-black/[0.10] bg-white text-sm text-[#1C1C1E] outline-none focus:border-[#C03D25]/40 focus:ring-1 focus:ring-[#C03D25]/20 transition-colors placeholder:text-[#C7C7CC]"
              />
            </div>
          </div>

          {/* Allocation preview */}
          {allocationPreview.length > 0 && (
            <div className="rounded-2xl p-3 space-y-2.5" style={{ background: '#FDF5F3' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#C03D25' }}>
                Allocation Preview
              </p>
              {allocationPreview.map(({ line, applied, fullyPaid }) => (
                <div key={line.id} className="flex items-start gap-2.5">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: fullyPaid ? 'rgba(52,199,89,0.15)' : 'rgba(0,122,255,0.12)' }}
                  >
                    {fullyPaid
                      ? <Check size={10} style={{ color: '#1A7F37' }} />
                      : <div className="w-2 h-2 rounded-full" style={{ background: '#0058C9' }} />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[#1C1C1E] truncate">{line.type_of_payment}</p>
                    <p className="text-[11px] text-[#8E8E93]">
                      {fmtPeso(applied)}
                      {!fullyPaid && ` of ${fmtPeso(Math.max(0, line.total_amount_due - (line.amount_paid ?? 0)))}`}
                      {' · '}
                      <span style={{ color: fullyPaid ? '#1A7F37' : '#0058C9' }}>
                        {fullyPaid ? 'Fully covered' : 'Partial'}
                      </span>
                    </p>
                  </div>
                </div>
              ))}
              {excess > 0.005 && (
                <p className="text-[11px] px-2.5 py-1.5 rounded-xl" style={{ background: 'rgba(255,159,10,0.12)', color: '#A05A00' }}>
                  {fmtPeso(excess)} exceeds outstanding — excess will not be applied
                </p>
              )}
            </div>
          )}

          {/* Mode of Payment */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-widest">Mode of Payment</p>
            <div className="grid grid-cols-2 gap-2">
              {MODES_OF_PAYMENT.map(m => (
                <button
                  key={m}
                  onClick={() => setMop(m)}
                  className="py-2.5 rounded-2xl text-sm font-semibold border-2 active:scale-[0.97]"
                  style={{
                    ...(mop === m
                      ? { background: '#C03D25', color: '#fff', borderColor: '#C03D25' }
                      : { background: '#F2F2F7', color: '#1C1C1E', borderColor: 'transparent' }),
                    transition: 'background-color 150ms ease, color 150ms ease, border-color 150ms ease, transform 100ms ease-out',
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Check fields */}
          {isCheck && (
            <div className="rounded-2xl bg-[#F2F2F7] p-3 space-y-3">
              <p className="text-[10px] font-bold text-[#8E8E93] uppercase tracking-widest">Check Details</p>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-[#6C6C70]">Check No. <span className="text-[#C03D25]">*</span></p>
                <input type="text" value={checkNo} onChange={e => setCheckNo(e.target.value)} placeholder="e.g. 0012345" className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-[#6C6C70]">Check Date <span className="text-[#C03D25]">*</span></p>
                <input type="date" value={checkDate} onChange={e => setCheckDate(e.target.value)} className={inputCls} />
              </div>
            </div>
          )}

          {/* OR No. */}
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-widest">OR / Acknowledgement No.</p>
            <input type="text" value={orNo} onChange={e => setOrNo(e.target.value)} placeholder="e.g. 0001234" className={inputCls} />
          </div>

          {/* Sales Invoice */}
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-widest">Sales Invoice No.</p>
            <input type="text" value={siNo} onChange={e => setSiNo(e.target.value)} placeholder="e.g. SI-00123" className={inputCls} />
          </div>

          {/* Posting Date */}
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-[#8E8E93] uppercase tracking-widest">
              Posting Date <span className="text-[#C03D25]">*</span>
            </p>
            <input type="date" value={postDate} onChange={e => setPostDate(e.target.value)} className={inputCls} />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">{error}</p>
          )}
        </div>

        {/* Submit */}
        <div className="px-5 pt-3 pb-10 shrink-0">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || posting}
            className="w-full py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98]"
            style={{
              ...(canSubmit && !posting
                ? { background: '#C03D25', color: '#fff' }
                : { background: '#F2F2F7', color: '#C7C7CC' }),
              transition: 'background-color 150ms ease, color 150ms ease, transform 100ms ease-out',
            }}
          >
            {posting
              ? <><Loader2 size={16} className="animate-spin" /> Posting…</>
              : <><Check size={16} /> Post Collection</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Lines Detail Overlay ─────────────────────────────────────────────────────

function LinesOverlay({
  summary,
  onClose,
  onLinePosted,
}: {
  summary:      ReservationReceivableSummary;
  onClose:      () => void;
  onLinePosted: () => void;
}) {
  const [lines,           setLines]           = useState<ReceivableLine[]>([]);
  const [collections,     setCollections]     = useState<CollectionRecord[]>([]);
  const [applications,    setApplications]    = useState<CollectionApplication[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [showPost,        setShowPost]        = useState(false);
  const [turnoverDateOk,  setTurnoverDateOk]  = useState<boolean | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [linesData, collData] = await Promise.all([
        fetchReceivableLines(summary.reservation_id),
        fetchCollections(summary.reservation_id),
      ]);
      setLines(linesData);
      setCollections(collData);
      if (collData.length > 0) {
        setApplications(await fetchCollectionApplicationsByIds(collData.map(c => c.id)));
      }

      // Check turnover date — missing it causes wrong retention payment timing
      const { data: resRow } = await supabase
        .from('reservations')
        .select('tower')
        .eq('reservation_id', summary.reservation_id)
        .maybeSingle();
      if (resRow?.tower) {
        const td = await fetchTurnoverDate(summary.project, resRow.tower);
        setTurnoverDateOk(td !== null);
      } else {
        setTurnoverDateOk(null);
      }
    } finally {
      setLoading(false);
    }
  }, [summary.reservation_id, summary.project]);

  useEffect(() => { load(); }, [load]);

  const today      = localToday();
  const unpaidLines = lines.filter(l => l.payment_status !== 'Paid');

  function lineStatusStyle(line: ReceivableLine): React.CSSProperties {
    if (line.payment_status === 'Paid')    return { background: 'rgba(52,199,89,0.12)', color: '#1A7F37' };
    if (line.payment_status === 'Partial') {
      return line.due_date < today
        ? { background: 'rgba(255,59,48,0.12)', color: '#C0001E' }
        : { background: 'rgba(0,122,255,0.10)', color: '#0058C9' };
    }
    return line.due_date < today
      ? { background: 'rgba(255,59,48,0.12)', color: '#C0001E' }
      : { background: 'rgba(255,159,10,0.12)', color: '#A05A00' };
  }

  function lineStatusLabel(line: ReceivableLine): string {
    if (line.payment_status === 'Paid')    return 'Paid';
    if (line.payment_status === 'Partial') return line.due_date < today ? 'Partial · Overdue' : 'Partial';
    return line.due_date < today ? 'Overdue' : 'Unpaid';
  }

  // For a line, find every collection that contributed to it
  function getLineCollections(lineId: string) {
    return applications
      .filter(a => a.receivable_line_id === lineId)
      .map(a => ({ app: a, coll: collections.find(c => c.id === a.collection_id) }))
      .filter(x => x.coll) as { app: CollectionApplication; coll: CollectionRecord }[];
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#F2F2F7]"
      style={{ animation: 'overlaySlideUp 0.32s cubic-bezier(0.32,0.72,0,1) both' }}
    >
      <style>{`@keyframes overlaySlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

      {/* Nav */}
      <div className="flex items-center justify-between px-4 pt-14 pb-4 shrink-0 bg-white border-b border-black/[0.06]">
        <button
          onClick={onClose}
          className="p-2.5 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] active:scale-[0.92]"
          style={{ transition: 'transform 100ms ease-out' }}
        >
          <ChevronLeft size={20} />
        </button>
        <div className="text-center min-w-0 px-3">
          <p className="text-[#1C1C1E] font-bold text-sm truncate">{summary.client_name}</p>
          <p className="text-[#8E8E93] text-xs">{summary.inventory_code} · {schemeLabel(summary.payment_scheme)}</p>
        </div>
        {unpaidLines.length > 0 ? (
          <button
            onClick={() => setShowPost(true)}
            className="px-3.5 py-2 rounded-2xl text-xs font-bold active:scale-[0.94]"
            style={{ background: '#C03D25', color: '#fff', transition: 'transform 100ms ease-out' }}
          >
            Post
          </button>
        ) : (
          <div className="w-[60px]" />
        )}
      </div>

      {/* Summary strip */}
      <div className="flex items-center gap-4 px-5 py-3 bg-white border-b border-black/[0.06] shrink-0">
        <div className="text-center flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#8E8E93]">Outstanding</p>
          <p className="text-sm font-bold text-[#C03D25]">{fmtPeso(summary.outstanding)}</p>
        </div>
        <div className="w-px h-8 bg-black/[0.06]" />
        <div className="text-center flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#8E8E93]">Paid</p>
          <p className="text-sm font-bold text-[#1C1C1E]">{summary.paid_lines}/{summary.total_lines}</p>
        </div>
        <div className="w-px h-8 bg-black/[0.06]" />
        <div className="text-center flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#8E8E93]">Status</p>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={STATUS_STYLE[summary.status]}>
            {summary.status}
          </span>
        </div>
      </div>

      {/* Turnover date warning */}
      {turnoverDateOk === false && (
        <div className="flex items-start gap-3 px-4 py-3 bg-[#FFF3CD] border-b border-[#FFCA28]/50 shrink-0">
          <AlertTriangle size={16} className="text-[#A05A00] shrink-0 mt-0.5" />
          <p className="text-xs text-[#7A4400] leading-snug">
            <span className="font-bold">Turnover date not set</span> for this project — retention payment timing may be incorrect.
            Set the turnover date in Admin Settings to fix the payment schedule.
          </p>
        </div>
      )}

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 pb-10">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="text-[#C03D25] animate-spin" />
          </div>
        ) : lines.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm font-semibold text-[#1C1C1E]">No payment lines found</p>
          </div>
        ) : (
          <>
            {/* Payment lines */}
            {lines.map(line => {
              const isPaid    = line.payment_status === 'Paid';
              const isPartial = line.payment_status === 'Partial';
              const balance   = Math.max(0, line.total_amount_due - (line.amount_paid ?? 0));
              const paidPct   = line.total_amount_due > 0
                ? Math.min(100, ((line.amount_paid ?? 0) / line.total_amount_due) * 100)
                : 0;
              const lineCols  = getLineCollections(line.id);

              return (
                <div
                  key={line.id}
                  className="rounded-3xl bg-white overflow-hidden"
                  style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}
                >
                  {/* Line header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.06]">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#1C1C1E] truncate">{line.type_of_payment}</p>
                      <p className="text-xs text-[#8E8E93] mt-0.5">Due {fmtDate(line.due_date)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <p className="text-sm font-bold text-[#1C1C1E]">{fmtPeso(line.total_amount_due)}</p>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={lineStatusStyle(line)}>
                        {lineStatusLabel(line)}
                      </span>
                    </div>
                  </div>

                  {/* Partial progress */}
                  {isPartial && (
                    <div className="px-4 py-3 space-y-1.5 bg-[#F9F9F9] border-b border-black/[0.06]">
                      <div className="relative h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.08)' }}>
                        <div
                          className="absolute inset-y-0 left-0 rounded-full"
                          style={{ width: `${paidPct}%`, background: '#0058C9', transition: 'width 400ms cubic-bezier(0.23,1,0.32,1)' }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span style={{ color: '#0058C9', fontWeight: 600 }}>{fmtPeso(line.amount_paid ?? 0)} paid</span>
                        <span className="text-[#8E8E93]">{fmtPeso(balance)} remaining</span>
                      </div>
                    </div>
                  )}

                  {/* Payment history from collections (new model) */}
                  {(isPaid || isPartial) && lineCols.length > 0 && (
                    <div className="px-4 py-2.5 space-y-2 bg-[#F9F9F9]">
                      {lineCols.map(({ app, coll }) => (
                        <div key={app.id}>
                          <div className="flex justify-between text-xs">
                            <span className="text-[#8E8E93]">{fmtDate(coll.posting_date)} · {coll.mode_of_payment}</span>
                            <span className="font-semibold text-[#1C1C1E]">{fmtPeso(app.applied_amount)}</span>
                          </div>
                          {coll.acknowledgement_receipt_no && (
                            <p className="text-[11px] text-[#8E8E93]">OR# {coll.acknowledgement_receipt_no}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Legacy payment info (old-model lines with direct MOP on the line) */}
                  {isPaid && lineCols.length === 0 && line.mode_of_payment && (
                    <div className="px-4 py-2.5 space-y-1 bg-[#F9F9F9]">
                      <div className="flex justify-between text-xs">
                        <span className="text-[#8E8E93]">Mode</span>
                        <span className="font-medium text-[#1C1C1E]">{line.mode_of_payment}</span>
                      </div>
                      {line.mode_of_payment === 'Check' && (
                        <>
                          <div className="flex justify-between text-xs">
                            <span className="text-[#8E8E93]">Check No.</span>
                            <span className="font-medium text-[#1C1C1E]">{line.check_no ?? '—'}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-[#8E8E93]">Check Date</span>
                            <span className="font-medium text-[#1C1C1E]">{line.check_date ? fmtDate(line.check_date) : '—'}</span>
                          </div>
                        </>
                      )}
                      <div className="flex justify-between text-xs">
                        <span className="text-[#8E8E93]">OR / Ack No.</span>
                        <span className="font-medium text-[#1C1C1E]">{line.acknowledgement_receipt_no ?? '—'}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-[#8E8E93]">Posting Date</span>
                        <span className="font-medium text-[#1C1C1E]">{line.posting_date ? fmtDate(line.posting_date) : '—'}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Payment history — new-model collections + legacy per-line payments */}
            {(() => {
              // New model: collections that have at least one application record
              const postedCollections = collections.filter(c =>
                applications.some(a => a.collection_id === c.id)
              );

              // Legacy model: lines paid directly (no collection record, MOP on the line itself)
              const legacyLines = lines.filter(l =>
                l.payment_status === 'Paid' &&
                l.mode_of_payment &&
                !applications.some(a => String(a.receivable_line_id) === String(l.id))
              );

              if (postedCollections.length === 0 && legacyLines.length === 0) return null;

              // Merge and sort by date descending
              type HistoryEntry =
                | { kind: 'collection'; date: string; c: CollectionRecord }
                | { kind: 'legacy';     date: string; l: ReceivableLine };

              const entries: HistoryEntry[] = [
                ...postedCollections.map(c => ({ kind: 'collection' as const, date: c.posting_date, c })),
                ...legacyLines.map(l => ({ kind: 'legacy' as const, date: l.posting_date ?? '', l })),
              ].sort((a, b) => (a.date < b.date ? 1 : -1));

              return (
                <div className="pt-2 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E93] px-1">
                    Payment History
                  </p>

                  {entries.map((entry, idx) => {
                    if (entry.kind === 'collection') {
                      const { c } = entry;
                      const apps  = applications.filter(a => a.collection_id === c.id);
                      const total = apps.reduce((sum, a) => sum + Number(a.applied_amount), 0);
                      return (
                        <div
                          key={`coll-${c.id}`}
                          className="rounded-2xl bg-white px-4 py-3 space-y-1.5"
                          style={{ border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-bold text-[#1C1C1E]">{fmtPeso(c.amount_received)}</p>
                            <span
                              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{ background: 'rgba(142,142,147,0.12)', color: '#3C3C43' }}
                            >
                              {c.mode_of_payment}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs text-[#8E8E93]">
                            <span>{fmtDate(c.posting_date)}</span>
                            {c.acknowledgement_receipt_no && (
                              <span className="font-medium text-[#1C1C1E]">OR# {c.acknowledgement_receipt_no}</span>
                            )}
                          </div>
                          <div className="pt-1.5 space-y-1.5" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                            {apps.map(app => {
                              const covLine  = lines.find(l => String(l.id) === String(app.receivable_line_id));
                              const linePaid = covLine?.payment_status === 'Paid';
                              return (
                                <div key={app.id} className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] text-[#6C6C70] truncate flex-1">
                                    {covLine?.type_of_payment ?? 'Unknown line'}
                                  </span>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[11px] font-semibold text-[#1C1C1E]">
                                      {fmtPeso(Number(app.applied_amount))}
                                    </span>
                                    <span
                                      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                      style={linePaid
                                        ? { background: 'rgba(52,199,89,0.12)', color: '#1A7F37' }
                                        : { background: 'rgba(0,122,255,0.10)', color: '#0058C9' }}
                                    >
                                      {linePaid ? 'Paid' : 'Partial'}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                            {c.amount_received > total + 0.005 && (
                              <p className="text-[11px]" style={{ color: '#A05A00' }}>
                                {fmtPeso(c.amount_received - total)} excess — all lines covered
                              </p>
                            )}
                          </div>
                          {c.sales_invoice_number && (
                            <p className="text-[11px] text-[#8E8E93]">SI# {c.sales_invoice_number}</p>
                          )}
                        </div>
                      );
                    }

                    // Legacy: single paid line, payment data on the line itself
                    const { l } = entry;
                    return (
                      <div
                        key={`leg-${l.id}`}
                        className="rounded-2xl bg-white px-4 py-3 space-y-1.5"
                        style={{ border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-bold text-[#1C1C1E]">{fmtPeso(l.total_amount_due)}</p>
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(142,142,147,0.12)', color: '#3C3C43' }}
                          >
                            {l.mode_of_payment}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-[#8E8E93]">
                          <span>{l.posting_date ? fmtDate(l.posting_date) : '—'}</span>
                          {l.acknowledgement_receipt_no && (
                            <span className="font-medium text-[#1C1C1E]">OR# {l.acknowledgement_receipt_no}</span>
                          )}
                        </div>
                        <div className="pt-1.5 space-y-1.5" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-[#6C6C70] truncate flex-1">
                              {l.type_of_payment}
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[11px] font-semibold text-[#1C1C1E]">
                                {fmtPeso(l.total_amount_due)}
                              </span>
                              <span
                                className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                style={{ background: 'rgba(52,199,89,0.12)', color: '#1A7F37' }}
                              >
                                Paid
                              </span>
                            </div>
                          </div>
                          {l.mode_of_payment === 'Check' && l.check_no && (
                            <p className="text-[11px] text-[#8E8E93]">
                              Chk# {l.check_no}{l.check_date ? ` · ${fmtDate(l.check_date)}` : ''}
                            </p>
                          )}
                          {l.sales_invoice_number && (
                            <p className="text-[11px] text-[#8E8E93]">SI# {l.sales_invoice_number}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </>
        )}
      </div>

      {/* Post Collection Sheet */}
      {showPost && (
        <PostCollectionSheet
          reservationId={summary.reservation_id}
          unpaidLines={unpaidLines}
          onClose={() => setShowPost(false)}
          onPosted={() => {
            setShowPost(false);
            load();
            onLinePosted();
          }}
        />
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CollectionPostingPage() {
  const [summaries,    setSummaries]    = useState<ReservationReceivableSummary[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [filterOpen,   setFilterOpen]   = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [projectFilter,setProjectFilter]= useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [selected,     setSelected]     = useState<ReservationReceivableSummary | null>(null);
  const [exporting,    setExporting]    = useState(false);
  const [loadError,    setLoadError]    = useState('');
  const [backfilling,  setBackfilling]  = useState(false);
  const [backfillDone, setBackfillDone] = useState<{ generated: number; skipped: number } | null>(null);

  const fileInputRef                            = useRef<HTMLInputElement>(null);
  const [importing,        setImporting]        = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [postingBatch,     setPostingBatch]     = useState(false);
  const [importResult,     setImportResult]     = useState<{ posted: number; errored: number } | null>(null);

  const activeFilterCount = [statusFilter, projectFilter, clientFilter].filter(Boolean).length;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setSummaries(await fetchReceivableSummaries());
    } catch (e: any) {
      console.error('[collection-posting] load failed:', e);
      setLoadError(e?.message ?? 'Failed to load collection data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return summaries.filter(s => {
      if (statusFilter && s.status !== statusFilter) return false;
      if (projectFilter && s.project !== projectFilter) return false;
      if (clientFilter && s.client_name !== clientFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !s.client_name.toLowerCase().includes(q) &&
          !s.reservation_id.toLowerCase().includes(q) &&
          !s.inventory_code.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [summaries, statusFilter, projectFilter, clientFilter, search]);

  const sorted = useMemo(() => {
    const order: Record<string, number> = { Overdue: 0, Unpaid: 1, Complete: 2 };
    return [...filtered].sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));
  }, [filtered]);

  // ── Export ──────────────────────────────────────────────────────────────────

  function handleExport() {
    setExporting(true);
    try {
      exportBatch(sorted);
    } catch (e) {
      console.error('Export failed', e);
      alert('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  // ── Import ──────────────────────────────────────────────────────────────────

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true);
    try {
      const rows   = await parseImportFile(file);
      const result = await validateImportRows(rows, summaries);
      setValidationResult(result);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to parse file.');
    } finally {
      setImporting(false);
    }
  }

  async function handleConfirmImport() {
    if (!validationResult || validationResult.valid.length === 0) return;
    setPostingBatch(true);

    let posted  = 0;
    let errored = 0;

    for (const row of validationResult.valid) {
      try {
        const isCheck = row.mode_of_payment === 'Check';
        await postCollection(row.reservation_id, {
          amount_received:            row.amount_received,
          mode_of_payment:            row.mode_of_payment,
          acknowledgement_receipt_no: row.acknowledgement_receipt_no || undefined,
          sales_invoice_number:       row.sales_invoice_number       || undefined,
          posting_date:               row.posting_date,
          check_no:                   isCheck ? row.check_no   : undefined,
          check_date:                 isCheck ? row.check_date : undefined,
        });
        posted++;
      } catch {
        errored++;
      }
    }

    setPostingBatch(false);
    setValidationResult(null);
    setImportResult({ posted, errored });
    load();
  }

  // ── Backfill: generate receivable lines for all Reserved/Booked reservations ──

  async function handleBackfill() {
    setBackfilling(true);
    setBackfillDone(null);
    try {
      // Fetch all reservations that should have receivable lines
      const { data: reservations, error } = await supabase
        .from('reservations')
        .select('reservation_id, date_of_reservation_fee, status')
        .in('status', ['Reserved', 'Booked']);
      if (error) throw error;

      let generated = 0;
      let skipped   = 0;

      for (const r of reservations ?? []) {
        const paymentDate = r.date_of_reservation_fee ?? localToday();
        try {
          // generateReceivableLines is idempotent — skips if lines already exist
          await generateReceivableLines(r.reservation_id, paymentDate);
          generated++;
        } catch {
          skipped++;
        }
      }

      setBackfillDone({ generated, skipped });
      load();
    } catch (e: any) {
      alert(e?.message ?? 'Backfill failed.');
    } finally {
      setBackfilling(false);
    }
  }

  return (
    <>
      <PageShell title="Collection Posting">
        <div className="space-y-3 pb-6">

          {/* Search + Filter */}
          <div className="flex gap-2 items-center">
            <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-white/80 border border-black/[0.08] backdrop-blur-sm">
              <Search size={15} className="text-[#8E8E93] shrink-0" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by client, ID or unit…"
                className="flex-1 bg-transparent text-sm text-[#1C1C1E] outline-none placeholder:text-[#C7C7CC]"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')}>
                  <X size={13} className="text-[#8E8E93]" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setFilterOpen(true)}
              className={`relative w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
                activeFilterCount > 0
                  ? 'bg-[#C03D25] text-white shadow-md'
                  : 'bg-white/80 backdrop-blur-sm border border-black/[0.08] text-[#6C6C70]'
              }`}
            >
              <SlidersHorizontal size={18} />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white text-[#C03D25] text-[9px] font-bold flex items-center justify-center shadow">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Export / Import */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-white/80 border border-black/[0.08] backdrop-blur-sm text-[#1C1C1E] text-sm font-semibold active:opacity-70 disabled:opacity-50 transition-opacity"
            >
              {exporting
                ? <Loader2 size={15} className="animate-spin text-[#C03D25]" />
                : <Download size={15} className="text-[#C03D25]" />}
              Export Batch
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-white/80 border border-black/[0.08] backdrop-blur-sm text-[#1C1C1E] text-sm font-semibold active:opacity-70 disabled:opacity-50 transition-opacity"
            >
              {importing
                ? <Loader2 size={15} className="animate-spin text-[#C03D25]" />
                : <Upload size={15} className="text-[#C03D25]" />}
              Import Batch
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={handleFileSelected}
            />
          </div>


          {/* List */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="text-[#C03D25] animate-spin" />
            </div>
          ) : loadError ? (
            <GlassCard className="px-4 py-4 flex items-start gap-3 bg-red-50 border border-red-200">
              <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-red-700">Failed to load</p>
                <p className="text-xs text-red-600 mt-0.5 leading-relaxed">{loadError}</p>
              </div>
            </GlassCard>
          ) : sorted.length === 0 ? (
            <div className="space-y-3">
              <GlassCard className="p-8 text-center">
                <Building2 size={28} className="text-[#C7C7CC] mx-auto mb-2" />
                <p className="text-sm font-semibold text-[#1C1C1E]">No records found</p>
                <p className="text-xs text-[#8E8E93] mt-1">
                  {search || statusFilter || projectFilter || clientFilter
                    ? 'Try adjusting your search or filters'
                    : 'No payment schedules have been generated yet'}
                </p>
              </GlassCard>
              {!search && !statusFilter && !projectFilter && !clientFilter && (
                <GlassCard className="px-4 py-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-[#1C1C1E]">Payment schedules missing</p>
                      <p className="text-xs text-[#8E8E93] mt-0.5 leading-relaxed">
                        Existing reservations may not have payment schedules yet. Tap below to generate them for all Reserved and Booked reservations.
                      </p>
                    </div>
                  </div>
                  {backfillDone && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 border border-green-200">
                      <CheckCircle2 size={13} className="text-green-500 shrink-0" />
                      <p className="text-xs text-green-700 font-medium">
                        Generated for {backfillDone.generated} reservation{backfillDone.generated !== 1 ? 's' : ''}
                        {backfillDone.skipped > 0 ? `, ${backfillDone.skipped} skipped` : ''}
                      </p>
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={backfilling}
                    onClick={handleBackfill}
                    className="w-full py-3 rounded-2xl bg-[#C03D25] text-white text-sm font-bold flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-50"
                  >
                    {backfilling
                      ? <><Loader2 size={15} className="animate-spin" /> Generating…</>
                      : 'Generate Payment Schedules'
                    }
                  </button>
                </GlassCard>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {sorted.map(s => (
                <GlassCard
                  key={s.reservation_id}
                  className="p-3 active:scale-[0.98] transition-transform cursor-pointer"
                  onClick={() => setSelected(s)}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                      style={{ background: 'linear-gradient(135deg, #E05A3A 0%, #A83020 100%)' }}
                    >
                      <span className="text-sm font-bold text-white">{getInitials(s.client_name)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-[#1C1C1E] truncate">{s.reservation_id}</p>
                      </div>
                      <p className="text-xs text-[#8E8E93] mt-0.5 truncate">{s.client_name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Building2 size={10} className="text-[#C7C7CC] shrink-0" />
                        <span className="text-xs text-[#6C6C70] truncate">{s.inventory_code}</span>
                        <span className="text-[#D1D1D6]">·</span>
                        <span className="text-xs text-[#6C6C70]">{schemeLabel(s.payment_scheme)}</span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-[10px] text-[#8E8E93]">
                          {s.next_due_date ? `Next due ${fmtDate(s.next_due_date)}` : 'All paid'}
                          {' · '}{s.paid_lines}/{s.total_lines} paid
                        </p>
                        {s.outstanding > 0 && (
                          <p className="text-xs font-bold text-[#C03D25] shrink-0">{fmtPeso(s.outstanding)}</p>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-[#C7C7CC] shrink-0" />
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </div>
      </PageShell>

      {/* Filter sheet */}
      {filterOpen && (
        <div className="fixed inset-0 z-[45] bg-black/40" onClick={() => setFilterOpen(false)} />
      )}
      <div className={`fixed inset-x-0 bottom-0 z-[46] transition-transform duration-300 ease-out ${filterOpen ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="bg-white rounded-t-3xl shadow-2xl max-h-[80vh] flex flex-col">
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-9 h-1 rounded-full bg-[#D1D1D6]" />
          </div>
          <div className="flex items-center justify-between px-5 py-3 shrink-0">
            <p className="text-base font-bold text-[#1C1C1E]">Filters</p>
            <button
              type="button"
              onClick={() => setFilterOpen(false)}
              className="w-7 h-7 rounded-full bg-[#F2F2F7] flex items-center justify-center"
            >
              <X size={14} className="text-[#8E8E93]" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-5 min-h-0">

            {/* Status */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Status</p>
              <div className="flex gap-2 flex-wrap">
                {(['', 'Overdue', 'Unpaid', 'Complete']).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors flex items-center gap-1.5 ${
                      statusFilter === s
                        ? 'bg-[#C03D25] border-[#C03D25] text-white'
                        : 'bg-[#F2F2F7] border-transparent text-[#6C6C70]'
                    }`}
                  >
                    {statusFilter === s && s && <Check size={11} />}
                    {s || 'All'}
                  </button>
                ))}
              </div>
            </div>

            {/* Project */}
            {(() => {
              const projects = [...new Set(summaries.map(s => s.project).filter(Boolean))].sort();
              if (projects.length === 0) return null;
              return (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Project</p>
                  <SearchableSelect
                    value={projectFilter}
                    onChange={setProjectFilter}
                    options={projects}
                    placeholder="All projects"
                  />
                </div>
              );
            })()}

            {/* Client Name */}
            {(() => {
              const clients = [...new Set(summaries.map(s => s.client_name).filter(Boolean))].sort();
              return (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">Client Name</p>
                  <SearchableSelect
                    value={clientFilter}
                    onChange={setClientFilter}
                    options={clients}
                    placeholder="All clients"
                  />
                </div>
              );
            })()}

          </div>
          <div className="px-5 pb-10 pt-3 flex gap-3 shrink-0 border-t border-black/[0.06]">
            <button
              type="button"
              onClick={() => { setStatusFilter(''); setProjectFilter(''); setClientFilter(''); }}
              className="flex-1 py-3.5 rounded-2xl bg-[#F2F2F7] text-[#1C1C1E] text-sm font-semibold active:opacity-70"
            >
              Clear All
            </button>
            <button
              type="button"
              onClick={() => setFilterOpen(false)}
              className="flex-1 py-3.5 rounded-2xl bg-[#C03D25] text-white text-sm font-bold active:opacity-80"
            >
              Done
            </button>
          </div>
        </div>
      </div>

      {/* Lines Detail Overlay */}
      {selected && (
        <LinesOverlay
          summary={selected}
          onClose={() => setSelected(null)}
          onLinePosted={load}
        />
      )}

      {/* Import Validation Modal */}
      {validationResult && (
        <ImportValidationModal
          result={validationResult}
          onConfirm={handleConfirmImport}
          onCancel={() => setValidationResult(null)}
          posting={postingBatch}
        />
      )}

      {/* Import Result Modal */}
      {importResult && (
        <ImportResultModal
          posted={importResult.posted}
          errored={importResult.errored}
          onClose={() => setImportResult(null)}
        />
      )}
    </>
  );
}
