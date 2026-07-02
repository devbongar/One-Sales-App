import React from 'react';
import {
  Document, Page, Text, View, Image, StyleSheet, renderToBuffer,
} from '@react-pdf/renderer';
import fs from 'fs';
import path from 'path';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SOAReservation {
  reservation_id: string;
  client_id: string | null;
  client_name: string;
  project: string;
  tower: string | null;
  inventory_code: string | null;
  scheme_name: string | null;
  term_months: number | null;
  payment_scheme: string | null;
  net_list_price: number;
  vat: number;
  other_charges: number;
  total_contract_price: number;
  hic_discount: number;
  employee_discount_amount: number;
}

export interface SOALine {
  id: string;
  type_of_payment: string;
  due_date: string;
  total_amount_due: number;
  amount_paid: number | null;
  principal: number | null;
  hic: number | null;
  vat: number | null;
  other_charges: number | null;
  payment_status: string;
  acknowledgement_receipt_no: string | null;
  posting_date: string | null;
  transaction_date: string | null;
}

export interface SOAPenaltyLine {
  id: number;
  original_due_date: string;
  days_overdue: number | null;
  daily_rate: number | null;
  balance_receivables: number | null;
  penalty_amount: number | null;
  collection: number | null;
  payment_status: string;
  remarks: string | null;
  ar_no: string | null;
  ar_date: string | null;
}

export interface SOAArEntry {
  pmt_date: string | null;
  ar_no: string | null;
  ar_date: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtN = (n: number | null | undefined) =>
  n != null ? n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '—';

const fmtD = (d: string | null | undefined) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// ── Colours ───────────────────────────────────────────────────────────────────

const CORAL = '#EE434E';
const DARK  = '#37373C';
const MED   = '#5A5A5F';
const TOT   = '#46464B';
const ALT   = '#F8F8FA';
const WHITE = '#FFFFFF';
const INK   = '#1C1C1E';
const LT    = '#6E6E73';

// ── Column defs (flex = mm widths, proportional) ───────────────────────────────
// Portrait A4 content width ≈ 186 (= 210 - 2×12mm margins)

const STATIC_BASE = 8;  // cols before AR stacked (non-HIC)
const STATIC_HIC  = 9;  // cols before AR stacked (HIC)

const SCHED_STATIC_BASE = [
  { label: 'Description', flex: 24 },
  { label: 'Due Date',    flex: 20 },
  { label: 'Principal',   flex: 15 },
  { label: 'VAT',         flex: 11 },
  { label: 'Oth.Chg',    flex: 13 },
  { label: 'Total',       flex: 18 },
  { label: 'Collection',  flex: 18 },
  { label: 'Status',      flex: 12 },
];

const SCHED_STATIC_HIC = [
  { label: 'Description', flex: 24 },
  { label: 'Due Date',    flex: 19 },
  { label: 'Principal',   flex: 13 },
  { label: 'VAT',         flex: 10 },
  { label: 'Oth.Chg',    flex: 11 },
  { label: 'HIC',         flex: 11 },
  { label: 'Total',       flex: 16 },
  { label: 'Collection',  flex: 16 },
  { label: 'Status',      flex: 11 },
];

const AR_COLS = [
  { label: 'Pmt Date', flex: 17 },
  { label: 'AR No.',   flex: 18 },
  { label: 'AR Date',  flex: 20 },
];
const AR_FLEX = AR_COLS.reduce((s, c) => s + c.flex, 0); // 55

const PEN_COLS = [
  { label: 'Original Due Date', flex: 22 },
  { label: 'Days Overdue',      flex: 14 },
  { label: 'Daily Rate*',       flex: 12 },
  { label: 'Principal Basis',   flex: 22 },
  { label: 'Penalty Amount',    flex: 22 },
  { label: 'Collection',        flex: 20 },
  { label: 'Status',            flex: 17 },
  { label: 'Remarks',           flex: 17 },
  { label: 'AR No.',            flex: 20 },
  { label: 'AR Date',           flex: 20 },
];

// ── Styles ────────────────────────────────────────────────────────────────────

const HDR_H    = 90;  // 32mm in pt (matches jsPDF SOA reference)
const FOOTER_H = 18;

const S = StyleSheet.create({
  // Padding on Page so every physical page gets header/footer clearance
  page:     { fontFamily: 'Helvetica', backgroundColor: WHITE, paddingTop: HDR_H + 8, paddingBottom: FOOTER_H + 6, paddingHorizontal: 12 },
  // position:'absolute' on direct Page children is relative to the page edge (not content box)
  header:   { position: 'absolute', top: 0, left: 0, right: 0, height: HDR_H, backgroundColor: CORAL, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  hdrRight: { marginLeft: 'auto', alignItems: 'flex-end' },
  hdrTitle: { fontFamily: 'Helvetica-Bold', fontSize: 20, color: WHITE },
  hdrSub:   { fontSize: 10, color: '#FFDCD2', marginTop: 2 },
  footer:   { position: 'absolute', bottom: 0, left: 0, right: 0, height: FOOTER_H, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, borderTopWidth: 0.3, borderTopColor: '#DCDCDC' },
  footTxt:  { fontSize: 6, color: '#A0A0A5' },

  // Two-col top
  twoCol:   { flexDirection: 'row', marginBottom: 6 },
  col:      { flex: 1 },
  cName:    { fontFamily: 'Helvetica-Bold', fontSize: 13, color: INK, marginBottom: 3 },
  addr:     { fontSize: 7.5, color: '#505055', marginBottom: 3 },
  iRow:     { marginBottom: 4 },
  iLbl:     { fontSize: 7, color: LT },
  iVal:     { fontFamily: 'Helvetica-Bold', fontSize: 8, color: INK },

  billHdr:  { fontFamily: 'Helvetica-Bold', fontSize: 9, color: '#8C1E1E', marginBottom: 5 },
  billRow:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  billLbl:  { fontSize: 8, color: LT },
  billVal:  { fontSize: 8, color: '#323235' },
  billValB: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: INK },

  // Section header (dark bg)
  secHdr:    { backgroundColor: DARK, paddingHorizontal: 3, paddingVertical: 5, marginTop: 6 },
  secHdrTxt: { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: WHITE },

  // Contract details
  cdRow:  { flexDirection: 'row', marginTop: 5, marginBottom: 4 },
  cdCol:  { flex: 1 },
  cdItem: { marginBottom: 5 },
  cdLbl:  { fontSize: 7, color: LT, marginBottom: 1 },
  cdVal:  { fontSize: 8, color: INK },
  cdValB: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: INK },

  // Table shared
  tblHdr:    { flexDirection: 'row', backgroundColor: MED, paddingVertical: 4, paddingHorizontal: 2 },
  tblHdrTxt: { fontFamily: 'Helvetica-Bold', fontSize: 6, color: WHITE },
  tblRow:    { flexDirection: 'row', paddingHorizontal: 2 },
  tblAlt:    { backgroundColor: ALT },
  cellTxt:   { fontSize: 6, color: '#282828', paddingVertical: 3 },
  cellPaid:  { fontSize: 6, color: '#226B22', paddingVertical: 3 },
  cellUnpaid:{ fontSize: 6, color: '#B41E1E', paddingVertical: 3 },
  cellPartial:{ fontSize: 6, color: '#785000', paddingVertical: 3 },
  totRow:    { flexDirection: 'row', backgroundColor: TOT, paddingVertical: 4, paddingHorizontal: 2 },
  totTxt:    { fontFamily: 'Helvetica-Bold', fontSize: 6, color: WHITE },

  italic:    { fontFamily: 'Helvetica-Oblique', fontSize: 7, color: '#A0A0A5', paddingVertical: 5, textAlign: 'center' },
  note:      { fontFamily: 'Helvetica-Oblique', fontSize: 6, color: '#828285', marginTop: 4 },
});

// ── Document component ────────────────────────────────────────────────────────

interface DocProps {
  res: SOAReservation;
  lines: SOALine[];
  penalties: SOAPenaltyLine[];
  arMap: Record<string, SOAArEntry[]>;
  dailyRate: number;
  mailingAddress: string;
  logoSrc: string;
  generatedAt: string;
}

const SOADoc: React.FC<DocProps> = ({
  res, lines, penalties, arMap, dailyRate, mailingAddress, logoSrc, generatedAt,
}) => {
  const isHIC  = (res.hic_discount ?? 0) > 0;
  const isEmp  = (res.employee_discount_amount ?? 0) > 0;
  const isNoTerm = res.payment_scheme === 'spot_cash' || res.payment_scheme === 'spot_dp';

  const isPenalty = (l: SOALine) => l.type_of_payment.toLowerCase().includes('penalty');
  const schedLines = lines.filter(l =>
    !isPenalty(l) &&
    l.payment_status !== 'Superseded' &&
    l.payment_status !== 'Cancelled',
  );

  const today     = new Date();
  const todayStr  = today.toISOString().slice(0, 10);
  const nextM     = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const nextMY    = nextM.getFullYear();
  const nextMM    = nextM.getMonth() + 1;

  const billedLines  = schedLines.filter(l => {
    if (l.due_date <= todayStr) return true;
    const [y, m] = l.due_date.split('-').map(Number);
    return y === nextMY && m === nextMM;
  });
  const totalBilled  = billedLines.reduce((s, l) => s + l.total_amount_due, 0);
  const schedTotal   = schedLines.reduce((s, l) => s + l.total_amount_due, 0);
  const totalPaid    = schedLines.reduce((s, l) => s + (l.amount_paid ?? 0), 0);
  const amountDue    = Math.max(0, totalBilled - totalPaid);
  const creditBal    = Math.max(0, totalPaid - totalBilled);
  const totalPenalty = penalties.filter(p => ['Unpaid', 'Partial'].includes(p.payment_status))
    .reduce((s, p) => s + (p.penalty_amount ?? 0), 0);
  const totalAmtDue  = amountDue + totalPenalty;
  const nextUnpaid   = schedLines.find(l => l.payment_status !== 'Paid');
  const totalPenAll  = penalties.reduce((s, p) => s + (p.penalty_amount ?? 0), 0);

  const staticCols = isHIC ? SCHED_STATIC_HIC : SCHED_STATIC_BASE;

  const statusStyle = (v: string) =>
    v === 'Paid' ? S.cellPaid : v === 'Unpaid' ? S.cellUnpaid : v === 'Partial' ? S.cellPartial : S.cellTxt;

  return (
    <Document>
      <Page size="A4" style={S.page}>

        {/* ── Fixed header ── */}
        <View fixed style={S.header}>
          {logoSrc ? (
            <Image src={logoSrc} style={{ height: 44 }} />
          ) : null}
          <View style={S.hdrRight}>
            <Text style={S.hdrTitle}>STATEMENT OF ACCOUNT</Text>
            <Text style={S.hdrSub}>{res.reservation_id}</Text>
          </View>
        </View>

        {/* ── Fixed footer ── */}
        <View fixed style={S.footer}>
          <Text style={S.footTxt}>Generated: {generatedAt}</Text>
          <Text
            style={S.footTxt}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>

        {/* ── Body (no wrapper — Page padding handles header/footer clearance on every page) ── */}
        <>

          {/* Two-column: client info + billing */}
          <View style={S.twoCol}>

            {/* Left — client */}
            <View style={S.col}>
              <Text style={S.cName}>{res.client_name}</Text>
              {mailingAddress ? <Text style={S.addr}>{mailingAddress}</Text> : null}
              {([
                ['Client Code',    res.client_id      ?? '—'],
                ['Reservation ID', res.reservation_id],
                ['Project',        res.project],
                ['Tower',          res.tower          ?? '—'],
                ['Inventory Code', res.inventory_code ?? '—'],
              ] as [string, string][]).map(([lbl, val]) => (
                <View key={lbl} style={S.iRow}>
                  <Text style={S.iLbl}>{lbl}</Text>
                  <Text style={S.iVal}>{val}</Text>
                </View>
              ))}
            </View>

            {/* Right — billing details */}
            <View style={S.col}>
              <Text style={S.billHdr}>BILLING DETAILS</Text>
              {([
                ['Statement Date',      fmtD(todayStr),              false],
                ['Total Billed Amount', `PHP ${fmtN(totalBilled)}`,  false],
                ['Total Payments Made', `PHP ${fmtN(totalPaid)}`,    false],
                ['Amount Due',          `PHP ${fmtN(amountDue)}`,    true ],
                ['Penalties',           `PHP ${fmtN(totalPenalty)}`, false],
                ['Total Amount Due',    `PHP ${fmtN(totalAmtDue)}`,  true ],
                ['Due Date',            fmtD(nextUnpaid?.due_date),  true ],
                ['Credit Balance',      `PHP ${fmtN(creditBal)}`,    true ],
              ] as [string, string, boolean][]).map(([lbl, val, bold]) => (
                <View key={lbl} style={S.billRow}>
                  <Text style={S.billLbl}>{lbl}</Text>
                  <Text style={bold ? S.billValB : S.billVal}>{val}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── CONTRACT DETAILS ── */}
          <View style={S.secHdr}>
            <Text style={S.secHdrTxt}>CONTRACT DETAILS</Text>
          </View>
          <View style={S.cdRow}>
            <View style={S.cdCol}>
              {([
                ['Net List Price (incl. VAT)', `PHP ${fmtN((res.net_list_price ?? 0) + (res.vat ?? 0))}`, false],
                ['Other Charges',              `PHP ${fmtN(res.other_charges)}`,                           false],
                ...(isHIC  ? [['Home Improvement Contract', `PHP ${fmtN(res.hic_discount)}`, false]] : []),
                ...(isEmp  ? [['Employee Discount',         `PHP ${fmtN(res.employee_discount_amount)}`, false]] : []),
                ['Total Contract Price',       `PHP ${fmtN(res.total_contract_price)}`,                    true ],
              ] as [string, string, boolean][]).map(([lbl, val, bold]) => (
                <View key={lbl} style={S.cdItem}>
                  <Text style={S.cdLbl}>{lbl}</Text>
                  <Text style={bold ? S.cdValB : S.cdVal}>{val}</Text>
                </View>
              ))}
            </View>
            <View style={S.cdCol}>
              {([
                ['Remaining Balance', `PHP ${fmtN(Math.max(0, (res.total_contract_price ?? 0) - totalPaid))}`, false],
                ['Payterm Scheme',    res.scheme_name ?? '—',                                                    false],
                ...(!isNoTerm ? [['Term', res.term_months != null ? `${res.term_months} months` : '—', false]] : []),
              ] as [string, string, boolean][]).map(([lbl, val, bold]) => (
                <View key={lbl} style={S.cdItem}>
                  <Text style={S.cdLbl}>{lbl}</Text>
                  <Text style={bold ? S.cdValB : S.cdVal}>{val}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── SCHEDULE OF PAYMENT ── */}
          <View style={S.secHdr} break={false}>
            <Text style={S.secHdrTxt}>SCHEDULE OF PAYMENT</Text>
          </View>

          {/* Table header */}
          <View style={S.tblHdr}>
            {staticCols.map(c => (
              <Text key={c.label} style={[S.tblHdrTxt, { flex: c.flex }]}>{c.label}</Text>
            ))}
            <View style={{ flex: AR_FLEX, flexDirection: 'row' }}>
              {AR_COLS.map(c => (
                <Text key={c.label} style={[S.tblHdrTxt, { flex: c.flex }]}>{c.label}</Text>
              ))}
            </View>
          </View>

          {/* Table rows */}
          {schedLines.map((ln, idx) => {
            const arEntries: SOAArEntry[] = arMap[ln.id]?.length > 0
              ? arMap[ln.id]
              : [{ pmt_date: ln.transaction_date ?? ln.posting_date ?? null, ar_no: ln.acknowledgement_receipt_no ?? null, ar_date: ln.posting_date ?? null }];

            const staticVals = isHIC
              ? [ln.type_of_payment, fmtD(ln.due_date), fmtN(ln.principal), fmtN(ln.vat), fmtN(ln.other_charges), fmtN(ln.hic), fmtN(ln.total_amount_due), fmtN(ln.amount_paid), ln.payment_status]
              : [ln.type_of_payment, fmtD(ln.due_date), fmtN(ln.principal), fmtN(ln.vat), fmtN(ln.other_charges), fmtN(ln.total_amount_due), fmtN(ln.amount_paid), ln.payment_status];

            const statusIdx = staticCols.length - 1;

            return (
              <View key={ln.id} style={[S.tblRow, idx % 2 === 0 ? S.tblAlt : {}]} wrap={false}>
                {staticCols.map((c, i) => (
                  <Text key={c.label} style={[i === statusIdx ? statusStyle(staticVals[i]) : S.cellTxt, { flex: c.flex }]}>
                    {staticVals[i]}
                  </Text>
                ))}
                {/* Stacked AR entries */}
                <View style={{ flex: AR_FLEX, flexDirection: 'column' }}>
                  {arEntries.map((entry, ei) => (
                    <View key={ei} style={{ flexDirection: 'row' }}>
                      {([fmtD(entry.pmt_date), entry.ar_no ?? '—', fmtD(entry.ar_date)] as string[]).map((val, ai) => (
                        <Text key={ai} style={[S.cellTxt, { flex: AR_COLS[ai].flex }]}>{val}</Text>
                      ))}
                    </View>
                  ))}
                </View>
              </View>
            );
          })}

          {/* Totals row */}
          <View style={S.totRow}>
            <Text style={[S.totTxt, { flex: staticCols[0].flex + staticCols[1].flex }]}>TOTAL</Text>
            {(isHIC
              ? [
                  schedLines.reduce((s, l) => s + (l.principal ?? 0), 0),
                  schedLines.reduce((s, l) => s + (l.vat ?? 0), 0),
                  schedLines.reduce((s, l) => s + (l.other_charges ?? 0), 0),
                  schedLines.reduce((s, l) => s + (l.hic ?? 0), 0),
                  schedTotal,
                  totalPaid,
                ]
              : [
                  schedLines.reduce((s, l) => s + (l.principal ?? 0), 0),
                  schedLines.reduce((s, l) => s + (l.vat ?? 0), 0),
                  schedLines.reduce((s, l) => s + (l.other_charges ?? 0), 0),
                  schedTotal,
                  totalPaid,
                ]
            ).map((val, i) => (
              <Text key={i} style={[S.totTxt, { flex: staticCols[i + 2].flex }]}>{fmtN(val)}</Text>
            ))}
          </View>

          {/* ── PENALTIES ── */}
          <View style={S.secHdr}>
            <Text style={S.secHdrTxt}>PENALTIES</Text>
          </View>

          {/* Penalty table header */}
          <View style={S.tblHdr}>
            {PEN_COLS.map(c => (
              <Text key={c.label} style={[S.tblHdrTxt, { flex: c.flex }]}>{c.label}</Text>
            ))}
          </View>

          {/* Penalty rows */}
          {penalties.length === 0 ? (
            <Text style={S.italic}>No penalty lines found for this reservation.</Text>
          ) : (
            penalties.map((p, idx) => (
              <View key={p.id} style={[S.tblRow, idx % 2 === 0 ? S.tblAlt : {}]} wrap={false}>
                <Text style={[S.cellTxt, { flex: PEN_COLS[0].flex, textAlign: 'center' }]}>{fmtD(p.original_due_date)}</Text>
                <Text style={[S.cellTxt, { flex: PEN_COLS[1].flex, textAlign: 'center' }]}>{String(p.days_overdue ?? 0)}</Text>
                <Text style={[S.cellTxt, { flex: PEN_COLS[2].flex, textAlign: 'center' }]}>{(((p.daily_rate ?? dailyRate) * 100).toFixed(2))}%</Text>
                <Text style={[S.cellTxt, { flex: PEN_COLS[3].flex, textAlign: 'right' }]}>{fmtN(p.balance_receivables ?? 0)}</Text>
                <Text style={[S.cellTxt, { flex: PEN_COLS[4].flex, textAlign: 'right' }]}>{fmtN(p.penalty_amount ?? 0)}</Text>
                <Text style={[S.cellTxt, { flex: PEN_COLS[5].flex, textAlign: 'right' }]}>{p.collection ? fmtN(p.collection) : '—'}</Text>
                <Text style={[S.cellTxt, { flex: PEN_COLS[6].flex, textAlign: 'center' }]}>{p.payment_status ?? '—'}</Text>
                <Text style={[S.cellTxt, { flex: PEN_COLS[7].flex, textAlign: 'center' }]}>{p.remarks ?? '—'}</Text>
                <Text style={[S.cellTxt, { flex: PEN_COLS[8].flex, textAlign: 'center' }]}>{p.ar_no ?? '—'}</Text>
                <Text style={[S.cellTxt, { flex: PEN_COLS[9].flex, textAlign: 'center' }]}>{fmtD(p.ar_date)}</Text>
              </View>
            ))
          )}

          {/* Penalty totals */}
          <View style={S.totRow}>
            <Text style={[S.totTxt, { flex: PEN_COLS.slice(0, 4).reduce((s, c) => s + c.flex, 0) }]}>TOTAL PENALTIES</Text>
            <Text style={[S.totTxt, { flex: PEN_COLS[4].flex, textAlign: 'right' }]}>{fmtN(totalPenAll)}</Text>
            <Text style={[S.totTxt, { flex: PEN_COLS.slice(5).reduce((s, c) => s + c.flex, 0) }]}> </Text>
          </View>

          <Text style={S.note}>*Effective {(dailyRate * 30 * 100).toFixed(2)}% per month</Text>

        </>
      </Page>
    </Document>
  );
};

// ── Public API ────────────────────────────────────────────────────────────────

export async function renderSOAToBase64(
  res: SOAReservation,
  lines: SOALine[],
  mailingAddress: string,
  penalties: SOAPenaltyLine[],
  arMap: Record<string, SOAArEntry[]>,
  dailyRate: number,
): Promise<string> {
  let logoSrc = '';
  try {
    const buf = fs.readFileSync(path.join(process.cwd(), 'public', 'document logo.png'));
    logoSrc = `data:image/png;base64,${buf.toString('base64')}`;
  } catch {}

  const generatedAt = new Date().toLocaleString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const element = (
    <SOADoc
      res={res}
      lines={lines}
      penalties={penalties}
      arMap={arMap}
      dailyRate={dailyRate}
      mailingAddress={mailingAddress}
      logoSrc={logoSrc}
      generatedAt={generatedAt}
    />
  );

  const buffer = await renderToBuffer(element);
  return buffer.toString('base64');
}
