import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet, pdf } from '@react-pdf/renderer';
import fs from 'fs';
import path from 'path';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SOAReservation {
  reservation_id: string;
  client_id: string | null;
  client_name: string;
  project: string;
  tower: string | null;
  inventory_code: string | null;
  scheme_name: string | null;
  term_months: number | null;
  net_list_price: number;
  vat: number;
  other_charges: number;
  total_contract_price: number;
  hic_discount: number;
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
  check_date: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmtN = (n: number | null | undefined) =>
  n != null ? n.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '—';

const fmtD = (d: string | null | undefined) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

const coral   = '#EE434E';
const darkBg  = '#37373C';
const totBg   = '#464649';
const lt      = '#6E6E73';
const white   = '#FFFFFF';
const ink     = '#1C1C1E';

// Non-HIC table columns
const COLS_BASE = [
  { label: 'Description',  flex: 2.4 },
  { label: 'Due Date',     flex: 1.0 },
  { label: 'Principal',    flex: 1.1 },
  { label: 'VAT',          flex: 1.0 },
  { label: 'Other Chgs',   flex: 1.0 },
  { label: 'Total',        flex: 1.2 },
  { label: 'Collection',   flex: 1.2 },
  { label: 'Pmt Date',     flex: 1.0 },
  { label: 'Status',       flex: 0.9 },
  { label: 'AR No.',        flex: 1.4 },
  { label: 'AR Date',      flex: 1.0 },
];

// HIC table columns
const COLS_HIC = [
  { label: 'Description',  flex: 2.0 },
  { label: 'Due Date',     flex: 0.9 },
  { label: 'Principal',    flex: 1.0 },
  { label: 'VAT',          flex: 0.9 },
  { label: 'Other Chgs',   flex: 0.9 },
  { label: 'HIC',          flex: 0.9 },
  { label: 'Total',        flex: 1.1 },
  { label: 'Collection',   flex: 1.1 },
  { label: 'Pmt Date',     flex: 0.9 },
  { label: 'Status',       flex: 0.8 },
  { label: 'AR No.',        flex: 1.25},
  { label: 'AR Date',      flex: 1.0 },
];

const PEN_COLS = [
  { label: 'Original Due Date', flex: 1.5 },
  { label: 'Days Overdue',      flex: 1.1 },
  { label: 'Daily Rate*',       flex: 0.9 },
  { label: 'Principal Basis',   flex: 1.5 },
  { label: 'Penalty Amount',    flex: 1.5 },
  { label: 'Status',            flex: 0.9 },
];

// ── Styles ─────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page:        { fontFamily: 'Helvetica', backgroundColor: white },
  hdr:         { backgroundColor: coral, height: 26, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, position: 'absolute', top: 0, left: 0, right: 0 },
  logo:        { height: 16 },
  hdrRight:    { marginLeft: 'auto', alignItems: 'flex-end' },
  hdrTitle:    { fontFamily: 'Helvetica-Bold', fontSize: 13, color: white },
  hdrSub:      { fontSize: 7.5, color: '#FFDCD2' },
  footer:      { position: 'absolute', bottom: 6, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.3, borderTopColor: '#DCDCDC', paddingTop: 2 },
  footTxt:     { fontSize: 6, color: '#A0A0A5' },
  body:        { paddingTop: 33, paddingHorizontal: 12, paddingBottom: 20 },
  twoCol:      { flexDirection: 'row', marginBottom: 4 },
  col:         { flex: 1 },
  cName:       { fontFamily: 'Helvetica-Bold', fontSize: 12, color: ink, marginBottom: 2 },
  addr:        { fontSize: 7.5, color: '#505055', marginBottom: 2 },
  iLbl:        { fontSize: 7,   color: lt, marginBottom: 0.5 },
  iVal:        { fontFamily: 'Helvetica-Bold', fontSize: 8, color: ink, marginBottom: 3.5 },
  billHdr:     { fontFamily: 'Helvetica-Bold', fontSize: 9, color: '#8C1E1E', marginBottom: 4 },
  billRow:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  billLbl:     { fontSize: 7.5, color: lt },
  billVal:     { fontSize: 8, color: '#323235' },
  billValB:    { fontFamily: 'Helvetica-Bold', fontSize: 9, color: ink },
  secHdr:      { backgroundColor: darkBg, paddingHorizontal: 12, paddingVertical: 5, marginTop: 6, marginHorizontal: -12 },
  secHdrTxt:   { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: white },
  cdRow:       { flexDirection: 'row', flexWrap: 'wrap', marginTop: 5, marginBottom: 2 },
  cdItem:      { marginRight: 18, marginBottom: 4 },
  cdLbl:       { fontSize: 7,   color: lt, marginBottom: 1 },
  cdVal:       { fontSize: 8.5, color: ink },
  cdValB:      { fontFamily: 'Helvetica-Bold', fontSize: 9, color: ink },
  tblHdr:      { flexDirection: 'row', paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: '#C8C8CD' },
  tblHdrTxt:   { fontFamily: 'Helvetica-Bold', fontSize: 6, color: ink },
  tblRow:      { flexDirection: 'row', paddingVertical: 3 },
  tblRowAlt:   { backgroundColor: '#F8F8FA' },
  tblTxt:      { fontSize: 6.5, color: '#282828' },
  tblPaid:     { fontSize: 6.5, color: '#226B22' },
  tblUnpaid:   { fontSize: 6.5, color: '#B41E1E' },
  tblPartial:  { fontSize: 6.5, color: '#785000' },
  totRow:      { backgroundColor: totBg, flexDirection: 'row', paddingVertical: 4 },
  totTxt:      { fontFamily: 'Helvetica-Bold', fontSize: 7, color: white },
  italic:      { fontFamily: 'Helvetica-Oblique', fontSize: 7.5, color: '#A0A0A5', paddingVertical: 4 },
  note:        { fontFamily: 'Helvetica-Oblique', fontSize: 6, color: '#828285', marginTop: 3 },
});

// ── SOA Document component ─────────────────────────────────────────────────────

interface Props {
  res: SOAReservation;
  lines: SOALine[];
  mailingAddress: string;
  logoSrc: string;
  generatedAt: string;
}

const SOADocument: React.FC<Props> = ({ res, lines, mailingAddress, logoSrc, generatedAt }) => {
  const isHIC = (res.hic_discount ?? 0) > 0;
  const cols = isHIC ? COLS_HIC : COLS_BASE;
  const statusColIdx = isHIC ? 9 : 8;

  const isPenaltyLine = (l: SOALine) => l.type_of_payment.toLowerCase().includes('penalty');
  const schedLines   = lines.filter(l => !isPenaltyLine(l));

  const today       = new Date();
  const todayStr    = today.toISOString().split('T')[0];
  const totalBilled = schedLines.reduce((s, l) => s + l.total_amount_due, 0);
  const totalPaid   = schedLines.reduce((s, l) => s + (l.amount_paid ?? 0), 0);
  const amountDue   = Math.max(0, totalBilled - totalPaid);
  const creditBal   = Math.max(0, totalPaid - totalBilled);

  const DAILY_RATE  = 0.001;
  const penCalc = schedLines
    .filter(l => l.due_date < todayStr && l.payment_status !== 'Paid')
    .map(l => {
      const days = Math.floor((today.getTime() - new Date(l.due_date + 'T00:00:00').getTime()) / 86400000);
      const basis = l.principal ?? l.total_amount_due;
      return { ...l, daysOverdue: days, basis, penAmt: basis * days * DAILY_RATE };
    });
  const totalPenalty = penCalc.reduce((s, p) => s + p.penAmt, 0);
  const totalAmtDue  = amountDue + totalPenalty;
  const nextUnpaid   = schedLines.find(l => l.payment_status !== 'Paid');

  const getLineCols = (l: SOALine): string[] =>
    isHIC
      ? [l.type_of_payment, fmtD(l.due_date), fmtN(l.principal), fmtN(l.vat), fmtN(l.other_charges), fmtN(l.hic), fmtN(l.total_amount_due), fmtN(l.amount_paid), fmtD(l.posting_date), l.payment_status, l.acknowledgement_receipt_no ?? '—', fmtD(l.check_date)]
      : [l.type_of_payment, fmtD(l.due_date), fmtN(l.principal), fmtN(l.vat), fmtN(l.other_charges), fmtN(l.total_amount_due), fmtN(l.amount_paid), fmtD(l.posting_date), l.payment_status, l.acknowledgement_receipt_no ?? '—', fmtD(l.check_date)];

  const statusStyle = (v: string) =>
    v === 'Paid' ? S.tblPaid : v === 'Unpaid' ? S.tblUnpaid : v === 'Partial' ? S.tblPartial : S.tblTxt;

  // Totals values: start after Description + Due Date columns
  const totVals = isHIC
    ? [fmtN(schedLines.reduce((s,l)=>s+(l.principal??0),0)), fmtN(schedLines.reduce((s,l)=>s+(l.vat??0),0)), fmtN(schedLines.reduce((s,l)=>s+(l.other_charges??0),0)), fmtN(schedLines.reduce((s,l)=>s+(l.hic??0),0)), fmtN(totalBilled), fmtN(totalPaid)]
    : [fmtN(schedLines.reduce((s,l)=>s+(l.principal??0),0)), fmtN(schedLines.reduce((s,l)=>s+(l.vat??0),0)), fmtN(schedLines.reduce((s,l)=>s+(l.other_charges??0),0)), fmtN(totalBilled), fmtN(totalPaid)];

  const totDataStart = 2; // skip Description + Due Date
  const totDataEnd   = totDataStart + totVals.length;
  const trailFlex    = cols.slice(totDataEnd).reduce((s, c) => s + c.flex, 0);

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={S.page}>

        {/* ── Fixed header ── */}
        <View fixed style={S.hdr}>
          {logoSrc ? <Image src={logoSrc} style={S.logo} /> : null}
          <View style={S.hdrRight}>
            <Text style={S.hdrTitle}>STATEMENT OF ACCOUNT</Text>
            <Text style={S.hdrSub}>{res.reservation_id}</Text>
          </View>
        </View>

        {/* ── Fixed footer ── */}
        <View fixed style={S.footer}>
          <Text style={S.footTxt}>Generated: {generatedAt}</Text>
          <Text style={S.footTxt} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>

        {/* ── Body ── */}
        <View style={S.body}>

          {/* Two-column: client info + billing */}
          <View style={S.twoCol}>

            {/* Left — client info */}
            <View style={S.col}>
              <Text style={S.cName}>{res.client_name}</Text>
              {mailingAddress ? <Text style={S.addr}>{mailingAddress}</Text> : null}
              <View style={{ marginTop: 4 }}>
                {([
                  ['Client Code',    res.client_id      ?? '—'],
                  ['Reservation ID', res.reservation_id],
                  ['Project',        res.project],
                  ['Tower',          res.tower          ?? '—'],
                  ['Inventory Code', res.inventory_code ?? '—'],
                ] as [string, string][]).map(([lbl, val]) => (
                  <View key={lbl}>
                    <Text style={S.iLbl}>{lbl}</Text>
                    <Text style={S.iVal}>{val}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Right — billing details */}
            <View style={S.col}>
              <Text style={S.billHdr}>BILLING DETAILS</Text>
              {([
                ['Statement Date',      fmtD(todayStr),                false],
                ['Total Billed Amount', `PHP ${fmtN(totalBilled)}`,    false],
                ['Total Payments Made', `PHP ${fmtN(totalPaid)}`,      false],
                ['Amount Due',          `PHP ${fmtN(amountDue)}`,      true ],
                ['Penalties',           `PHP ${fmtN(totalPenalty)}`,   false],
                ['Total Amount Due',    `PHP ${fmtN(totalAmtDue)}`,    true ],
                ['Due Date',            fmtD(nextUnpaid?.due_date),    true ],
                ['Credit Balance',      `PHP ${fmtN(creditBal)}`,      true ],
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
            {([
              ['Net List Price (incl. VAT)', `PHP ${fmtN((res.net_list_price ?? 0) + (res.vat ?? 0))}`, false],
              ['Other Charges',              `PHP ${fmtN(res.other_charges)}`,                           false],
              ...(isHIC ? [['Home Improvement Contract', `PHP ${fmtN(res.hic_discount)}`, false]] : []),
              ['Total Contract Price',       `PHP ${fmtN(res.total_contract_price)}`,                    true ],
              ['Remaining Balance',          `PHP ${fmtN(Math.max(0, (res.total_contract_price ?? 0) - totalPaid))}`, false],
              ['Payterm Scheme',             res.scheme_name ?? '—',                                     false],
              ['Term',                       res.term_months != null ? `${res.term_months} months` : '—', false],
            ] as [string, string, boolean][]).map(([lbl, val, bold]) => (
              <View key={lbl} style={S.cdItem}>
                <Text style={S.cdLbl}>{lbl}</Text>
                <Text style={bold ? S.cdValB : S.cdVal}>{val}</Text>
              </View>
            ))}
          </View>

          {/* ── SCHEDULE OF PAYMENT ── */}
          <View style={S.secHdr}>
            <Text style={S.secHdrTxt}>SCHEDULE OF PAYMENT</Text>
          </View>

          {/* Table header */}
          <View style={S.tblHdr}>
            {cols.map(c => (
              <Text key={c.label} style={[S.tblHdrTxt, { flex: c.flex }]}>{c.label}</Text>
            ))}
          </View>

          {/* Table rows */}
          {schedLines.map((ln, idx) => {
            const vals = getLineCols(ln);
            return (
              <View key={ln.id} style={[S.tblRow, idx % 2 === 0 ? S.tblRowAlt : {}]}>
                {cols.map((col, i) => (
                  <Text key={col.label} style={[i === statusColIdx ? statusStyle(vals[i]) : S.tblTxt, { flex: col.flex }]}>
                    {vals[i]}
                  </Text>
                ))}
              </View>
            );
          })}

          {/* Totals row */}
          <View style={S.totRow}>
            <Text style={[S.totTxt, { flex: cols[0].flex + cols[1].flex }]}>TOTAL</Text>
            {totVals.map((val, i) => (
              <Text key={i} style={[S.totTxt, { flex: cols[totDataStart + i].flex }]}>{val}</Text>
            ))}
            {trailFlex > 0 && <Text style={[S.totTxt, { flex: trailFlex }]}> </Text>}
          </View>

          {/* ── PENALTIES ── */}
          <View style={S.secHdr}>
            <Text style={S.secHdrTxt}>PENALTIES</Text>
          </View>
          <View style={S.tblHdr}>
            {PEN_COLS.map(c => (
              <Text key={c.label} style={[S.tblHdrTxt, { flex: c.flex }]}>{c.label}</Text>
            ))}
          </View>
          {penCalc.length === 0
            ? <Text style={S.italic}>No penalties</Text>
            : penCalc.map((pl, idx) => (
              <View key={pl.id} style={[S.tblRow, idx % 2 === 0 ? S.tblRowAlt : {}]}>
                {[
                  { flex: 1.5, val: fmtD(pl.due_date) },
                  { flex: 1.1, val: String(pl.daysOverdue) },
                  { flex: 0.9, val: '0.1%/day' },
                  { flex: 1.5, val: fmtN(pl.basis) },
                  { flex: 1.5, val: fmtN(pl.penAmt) },
                  { flex: 0.9, val: pl.payment_status },
                ].map((cell, i) => (
                  <Text key={i} style={[S.tblTxt, { flex: cell.flex }]}>{cell.val}</Text>
                ))}
              </View>
            ))
          }
          <Text style={S.note}>*effectively 3% per month</Text>

        </View>
      </Page>
    </Document>
  );
};

// ── Public API ─────────────────────────────────────────────────────────────────

export async function renderSOAToBase64(
  res: SOAReservation,
  lines: SOALine[],
  mailingAddress: string,
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
    <SOADocument res={res} lines={lines} mailingAddress={mailingAddress} logoSrc={logoSrc} generatedAt={generatedAt} />
  );

  // Collect PDF bytes from the Node.js readable stream
  const stream = await (pdf(element) as any).toStream() as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk: any) => chunks.push(Buffer.from(chunk)));
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  return Buffer.concat(chunks).toString('base64');
}
