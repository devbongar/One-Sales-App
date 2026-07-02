import jsPDF from 'jspdf';
import { fetchAllClients, fetchBuyerInfo, type ClientRecord, type BuyerInfoRecord } from '@/lib/clients';
import { fetchReceivableLines, type ReceivableLine } from '@/lib/receivables';
import { fetchSellerSignature } from '@/lib/salesperson';
import { fetchSpouseInfo } from '@/lib/spouse-info';
import { fetchCoOwner } from '@/lib/co-owners';
import { fetchAttyInFact } from '@/lib/atty-in-fact';
import { fetchCoOwnerSpouse } from '@/lib/co-owner-spouse';
import { getBookingProgress } from '@/lib/booking-progress';
import { supabase } from '@/lib/supabase';

export interface ReservationSummary {
  reservation_id: string;
  client_name:    string;
  project:        string;
  inventory_code: string;
}

interface ReservationDetail extends ReservationSummary {
  client_id:                string | null;
  tower:                    string | null;
  unit_no:                  string | null;
  unit_type:                string | null;
  unit_area:                number | null;
  scheme_name:              string | null;
  payment_scheme:           string | null;
  term_months:              number | null;
  dp_rate:                  number | null;
  list_price:               number | null;
  promo_discount_pct:       number | null;
  promo_discount_amount:    number | null;
  payterm_discount_pct:     number | null;
  payterm_discount_amount:  number | null;
  hic_discount:             number | null;
  employee_discount_amount: number | null;
  net_list_price:           number | null;
  vat:                      number | null;
  other_charges:            number | null;
  total_contract_price:     number | null;
  reservation_fee:          number | null;
  dp_amount:                number | null;
  balance_for_financing:    number | null;
  monthly_deferred:         number | null;
  monthly_stretched_dp:     number | null;
  bank_monthly:             number | null;
  hdmf_monthly:             number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeColorDataURL(r: number, g: number, b: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1; canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, 1, 1);
  return canvas.toDataURL('image/png');
}

/** Resize to maxW×maxH keeping PNG (preserves transparency). */
function resizeImagePNG(b64: string, maxW: number, maxH: number): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
      if (scale >= 1) { resolve(b64); return; }
      const w = Math.round(img.naturalWidth  * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(b64);
    img.src = b64;
  });
}

/** Resize and re-encode an image as JPEG at reduced resolution to keep PDF size small. */
function compressImage(b64: string, maxW: number, maxH: number, quality = 0.75): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
      const w = Math.round(img.naturalWidth  * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(b64);
    img.src = b64;
  });
}

export async function loadLogo(): Promise<{ b64: string; w: number; h: number }> {
  try {
    const res  = await fetch('/document logo.png');
    const blob = await res.blob();
    const b64  = await new Promise<string>(resolve => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.readAsDataURL(blob);
    });
    const dims = await new Promise<{ w: number; h: number }>(resolve => {
      const img = new Image();
      img.onload  = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 1, h: 1 });
      img.src = b64;
    });
    const logoH = 16;
    const logoW = Math.round((dims.w / dims.h) * logoH);
    // Resize to the actual rendered pixel size (logoW mm × logoH mm at ~96dpi → ~60×60px max)
    const small = await resizeImagePNG(b64, Math.round(logoW * 4), Math.round(logoH * 4));
    return { b64: small, w: logoW, h: logoH };
  } catch {
    return { b64: '', w: 0, h: 0 };
  }
}

async function headerBlock(doc: jsPDF, title: string, docId = '', subId = '') {
  const pageW = doc.internal.pageSize.getWidth();
  const HDR   = 30;
  const logo  = await loadLogo();
  doc.addImage(makeColorDataURL(238, 67, 78), 'PNG', 0, 0, pageW, HDR);
  if (logo.b64) doc.addImage(logo.b64, 'PNG', 14, (HDR - logo.h) / 2, logo.w, logo.h);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(title.toUpperCase(), pageW - 14, subId ? 10 : 13, { align: 'right' });
  if (docId) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(255, 220, 210);
    doc.text(docId, pageW - 14, subId ? 17 : 22, { align: 'right' });
  }
  if (subId) {
    doc.setFontSize(7.5);
    doc.setTextColor(255, 200, 190);
    doc.text(subId, pageW - 14, 24, { align: 'right' });
  }
  doc.setTextColor(30, 30, 30);
}

function sectionLabel(doc: jsPDF, text: string, y: number) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(110, 110, 115);
  doc.text(text.toUpperCase(), 14, y);
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  const pageW = doc.internal.pageSize.getWidth();
  doc.line(14, y + 1.5, pageW - 14, y + 1.5);
}

function fieldRow(doc: jsPDF, label: string, value: string, x: number, y: number, colW = 85) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(110, 110, 115);
  doc.text(label, x, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(28, 28, 30);
  doc.text(value, x, y + 5);
  doc.setDrawColor(230, 230, 230);
  doc.setLineWidth(0.2);
  doc.line(x, y + 6.5, x + colW, y + 6.5);
}

function footerBlock(doc: jsPDF) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const now   = new Date();
  const stamp = now.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    + '  ' + now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(14, pageH - 14, pageW - 14, pageH - 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(160, 160, 165);
  doc.text(`Generated: ${stamp}`, 14, pageH - 9);
  doc.text('Page 1', pageW - 14, pageH - 9, { align: 'right' });
}

// ── Client Registration ───────────────────────────────────────────────────────

export async function generateClientRegistration(client: ClientRecord | null): Promise<void> {
  const win   = window.open('', '_blank');
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  const docId = client?.client_id ?? 'CLT-0000-00000';
  await headerBlock(doc, 'Client Registration Form', docId);

  const L    = 14;
  const W    = pageW - 28;
  const C3   = W / 3;
  const C2   = W / 2;
  const GAP  = 0.6;
  const CELL = 13;

  const secImg  = makeColorDataURL(252, 210, 212);
  const cellImg = makeColorDataURL(243, 243, 245);

  const drawSecBar = (title: string, y: number): number => {
    doc.addImage(secImg, 'PNG', L, y, W, 7);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(140, 30, 30);
    doc.text(title, L + 2, y + 5);
    return y + 7;
  };

  const drawCell = (label: string, value: string, x: number, y: number, w: number, h = CELL) => {
    doc.addImage(cellImg, 'PNG', x, y, w - GAP, h);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(110, 110, 115);
    const labelLines = doc.splitTextToSize(label, w - GAP - 4);
    doc.text(labelLines, x + 2, y + 4);
    doc.setFontSize(8);
    doc.setTextColor(28, 28, 30);
    doc.text(value || '—', x + 2, y + 10);
  };

  const formatDob = (raw: string | null) => {
    if (!raw) return '—';
    const d = new Date(raw + 'T00:00:00');
    return d.toLocaleDateString('en-PH', { month: '2-digit', day: '2-digit', year: 'numeric' });
  };

  const mobile = [client?.country_code, client?.mobile_number].filter(Boolean).join('') || '—';
  const sellerSig = client?.property_specialist
    ? await fetchSellerSignature(client.property_specialist)
    : null;

  let y = 36;

  y = drawSecBar('BASIC INFORMATION', y) + 1;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(70, 70, 70);
  doc.text('Full Name (As found in your valid government issued ID)', L, y + 4);
  y += 6;
  drawCell('Last name',    client?.last_name   ?? '—', L,          y, C3);
  drawCell('First Name',   client?.first_name  ?? '—', L + C3,     y, C3);
  drawCell('Middle Name',  client?.middle_name ?? '—', L + C3 * 2, y, C3);
  y += CELL + 1;
  drawCell('Date of Birth', formatDob(client?.date_of_birth ?? null), L,      y, C2);
  drawCell('Citizenship',   client?.citizenship ?? '—',               L + C2, y, C2);
  y += CELL + 4;

  y = drawSecBar('Contact Information', y) + 1;
  drawCell('Mobile Number',  mobile,                     L,          y, C3);
  drawCell('Landline Number', client?.landline_no ?? '—', L + C3,    y, C3);
  drawCell('Email Address',  client?.email       ?? '—', L + C3 * 2, y, C3);
  y += CELL + 4;

  y = drawSecBar('Others', y) + 1;
  drawCell('Source of Sale',                   client?.source_of_sale          ?? '—', L,          y, C3);
  drawCell('Reason for buying',                client?.reason_for_buying       ?? '—', L + C3,     y, C3);
  drawCell('Estimated Total Household Income', client?.monthly_household_income ?? '—', L + C3 * 2, y, C3);
  y += CELL + 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(60, 60, 60);
  const cert = 'I /We hereby certify that I/We Am/Are the seller on record and that no other active seller in the previous thirty (30) days has made other representations to the buyer prior to this CRF.';
  const certLines = doc.splitTextToSize(cert, W - 20);
  doc.text(certLines, pageW / 2, y, { align: 'center' });
  y += certLines.length * 4.5 + 12;

  const today  = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  const sigW   = 75;
  const sigImgH = 12;
  const buyerSig  = client?.signature_base64 ?? null;
  const rightSigX = pageW - L - sigW;

  if (buyerSig)  { const c = await compressImage(buyerSig,  600, 100, 0.92); doc.addImage(c, 'JPEG', L,         y - sigImgH, sigW, sigImgH); }
  if (sellerSig) { const c = await compressImage(sellerSig, 600, 100, 0.92); doc.addImage(c, 'JPEG', rightSigX, y - sigImgH, sigW, sigImgH); }

  const clientFullName = [client?.first_name, client?.middle_name, client?.last_name, client?.suffix].filter(Boolean).join(' ');
  const sellerFullName = client?.property_specialist ?? '';

  // names above the line, below the signature image
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(28, 28, 30);
  if (clientFullName) doc.text(clientFullName, L, y + 3);
  if (sellerFullName) doc.text(sellerFullName, rightSigX, y + 3);

  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.4);
  doc.line(L, y + 6, L + sigW, y + 6);
  doc.line(rightSigX, y + 6, pageW - L, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(28, 28, 30);
  doc.text(today, L + sigW, y + 5, { align: 'right' });
  doc.text(today, pageW - L, y + 5, { align: 'right' });
  doc.setFontSize(7);
  doc.setTextColor(110, 110, 115);
  doc.text('Buyer Signature over Printed Name', L, y + 10);
  doc.text('Seller Signature over Printed Name', rightSigX, y + 10);
  doc.setFont('helvetica', 'normal');
  y += 14;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(120, 120, 125);
  const note = 'All personal information collected herein is done so exclusively with my/our consent to appropriately process my/our future request using the information that I/We\'ve provided. PH1 World Developers, Inc. will use and apply the appropriate security measures to preserve the confidentiality of my/our information.';
  const noteLines = doc.splitTextToSize(note, W);
  doc.text(noteLines, L, y);

  footerBlock(doc);
  const crfFilename = `CRF-${client?.client_id ?? 'unknown'}.pdf`;
  const crfBlobUrl  = doc.output('bloburl') as unknown as string;
  if (win && typeof (win as any).close === 'function') {
    (win as Window).close();
    const a = document.createElement('a'); a.href = crfBlobUrl; a.download = crfFilename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  } else if (win) { win.location.href = crfBlobUrl; }
  else doc.output('dataurlnewwindow');
}

// ── Terms of Payment ──────────────────────────────────────────────────────────

export async function generateTermsOfPayment(reservationId: string | null, openInNewTab = true): Promise<string | void> {
  const win  = openInNewTab ? window.open('', '_blank') : null;
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const L = 14, W = pageW - 28;

  let res: ReservationDetail | null = null;
  let dueFrom = '', dueTo = '';
  if (reservationId) {
    const { data: rd } = await supabase
      .from('reservations')
      .select(`reservation_id, client_id, client_name, project, tower, inventory_code,
               unit_no, unit_type, unit_area,
               scheme_name, term_months, dp_rate,
               list_price, promo_discount_pct, promo_discount_amount,
               payterm_discount_pct, payterm_discount_amount,
               hic_discount, employee_discount_amount,
               net_list_price, vat, other_charges, total_contract_price,
               reservation_fee, dp_amount, balance_for_financing,
               monthly_deferred, monthly_stretched_dp,
               bank_monthly, hdmf_monthly`)
      .eq('reservation_id', reservationId)
      .single();
    if (rd) res = rd as ReservationDetail;

    const { data: dpLines } = await supabase
      .from('receivables_database')
      .select('due_date')
      .eq('reservation_id', reservationId)
      .neq('type_of_payment', 'Reservation Fee')
      .order('due_date', { ascending: true });
    if (dpLines && dpLines.length > 0) {
      dueFrom = dpLines[0].due_date;
      dueTo   = dpLines[dpLines.length - 1].due_date;
    }
  }

  await headerBlock(doc, 'Terms of Payment', res?.reservation_id ?? '', res?.client_id ?? '');

  const fmtN   = (n: number | null | undefined) => n != null ? n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '—';
  const fmtD   = (d: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { month: '2-digit', day: '2-digit', year: 'numeric' }) : '—';
  const fmtPct = (n: number | null | undefined) => n != null ? `${n}%` : '';

  const secImg  = makeColorDataURL(252, 210, 212);
  const cellImg = makeColorDataURL(243, 243, 245);
  const darkImg = makeColorDataURL(60,  60,  65);
  const hlImg   = makeColorDataURL(50,  50,  55);
  const CELL = 13, GAP = 0.6;
  const C5 = W / 5;

  const drawSecBar = (title: string, y: number, x = L, w = W): number => {
    doc.addImage(secImg, 'PNG', x, y, w, 7);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(140, 30, 30);
    doc.text(title, x + 2, y + 5);
    return y + 7;
  };
  const drawCell = (label: string, value: string, x: number, y: number, w: number, h = CELL) => {
    doc.addImage(cellImg, 'PNG', x, y, w - GAP, h);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(110, 110, 115);
    doc.text(doc.splitTextToSize(label.toUpperCase(), w - GAP - 3), x + 2, y + 4);
    doc.setFontSize(8);
    doc.setTextColor(28, 28, 30);
    doc.text(value || '—', x + 2, y + 10);
  };

  let y = 36;

  y = drawSecBar('PROPERTY INFORMATION', y) + 1;
  drawCell('Project',          res?.project        ?? '—', L,          y, C5);
  drawCell('Tower / House No.', res?.tower         ?? '—', L + C5,     y, C5);
  drawCell('Unit Number',      res?.inventory_code ?? '—', L + C5 * 2, y, C5);
  drawCell('Unit Type',        res?.unit_type      ?? '—', L + C5 * 3, y, C5);
  drawCell('Unit Area',        res?.unit_area != null ? String(res.unit_area) : '—', L + C5 * 4, y, C5);
  y += CELL + 4;

  y = drawSecBar('PURCHASE PRICE COMPUTATION', y) + 1;
  drawCell('Payterm Scheme',  res?.scheme_name   ?? '—',                          L,           y, C5);
  drawCell('Term',            res?.term_months   != null ? String(res.term_months) : '—', L + C5, y, C5);
  drawCell('Downpayment (%)', res?.dp_rate       != null ? String(res.dp_rate)    : '—', L + C5 * 2, y, C5);
  drawCell('Due From',        fmtD(dueFrom),                                      L + C5 * 3, y, C5);
  drawCell('Due To',          fmtD(dueTo),                                        L + C5 * 4, y, C5);
  y += CELL + 6;

  const schemeLower   = (res?.scheme_name ?? '').toLowerCase();
  const isSpotCash    = schemeLower.includes('spot cash');
  const isDeferred    = schemeLower.includes('deferred');
  const isStretchedDP = schemeLower.includes('stretched');
  const hasFinancing  = !isSpotCash && !isDeferred;

  const LC = hasFinancing ? 108 : W;
  const RC = W - LC - 4;
  const RX = L + LC + 4;
  const twoColY = y;

  const dpRate      = res?.dp_rate ?? 0;
  const bfRate      = 100 - dpRate;
  const schemeTitle = isSpotCash   ? 'SPOT CASH'
    : isDeferred                   ? `DEFERRED CASH — ${res?.term_months ?? '—'} MONTHS`
    : dpRate > 0                   ? `${dpRate}% DP, ${bfRate}% END-USER FINANCING`
    : 'PAYMENT SCHEME';

  doc.addImage(darkImg, 'PNG', L, y, LC, 7);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text(schemeTitle, L + 2, y + 5);
  y += 7;

  const priceRow = (label: string, pct: string, amount: string, bold = false, indent = false, highlight = false) => {
    const rowH = 6;
    if (highlight) doc.addImage(hlImg, 'PNG', L, y, LC, rowH + 1);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(8);
    doc.setTextColor(highlight ? 255 : (bold ? 28 : 60), highlight ? 255 : (bold ? 28 : 60), highlight ? 255 : (bold ? 30 : 65));
    doc.text(label, L + (indent ? 4 : 2), y + 4.5);
    if (pct) doc.text(pct, L + 58, y + 4.5);
    doc.text(amount, L + LC - 2, y + 4.5, { align: 'right' });
    y += rowH + (highlight ? 1 : 0);
  };

  const promoAmt   = res?.promo_discount_amount   ?? 0;
  const paytermAmt = res?.payterm_discount_amount ?? 0;
  const hicAmt     = res?.hic_discount            ?? 0;
  const empAmt     = res?.employee_discount_amount ?? 0;

  priceRow('List Price', '', fmtN(res?.list_price));
  if (promoAmt > 0)   priceRow('(-) Promo Discount',    fmtPct(res?.promo_discount_pct),   `(${fmtN(promoAmt)})`,   false, true);
  if (paytermAmt > 0) priceRow('(-) Payterm Discount',  fmtPct(res?.payterm_discount_pct), `(${fmtN(paytermAmt)})`, false, true);
  if (hicAmt > 0)     priceRow('(-) HIC Discount',      '', `(${fmtN(hicAmt)})`,           false, true);
  if (empAmt > 0)     priceRow('(-) Employee Discount', '', `(${fmtN(empAmt)})`,            false, true);
  if (promoAmt + paytermAmt + hicAmt + empAmt > 0) {
    const discountedPrice = (res?.list_price ?? 0) - promoAmt - paytermAmt - hicAmt - empAmt;
    priceRow('Discounted Price', '', fmtN(discountedPrice));
  }
  priceRow('Value Added Tax',       '12%', fmtN(res?.vat));
  priceRow('Other Charges',         '',    fmtN(res?.other_charges));
  priceRow('Total Contract Price',  '',    fmtN(res?.total_contract_price), true, false, true);
  y += 3;

  if (isSpotCash) {
    priceRow('(-) Reservation Fee', '', `(${fmtN(res?.reservation_fee)})`, false, true);
    priceRow('Net Amount Payable', '', fmtN((res?.total_contract_price ?? 0) - (res?.reservation_fee ?? 0)), true, false, true);
  } else if (isDeferred) {
    priceRow('(-) Reservation Fee', '', `(${fmtN(res?.reservation_fee)})`, false, true);
    const netDeferred = (res?.total_contract_price ?? 0) - (res?.reservation_fee ?? 0);
    priceRow('Net Amount', '', fmtN(netDeferred));
    priceRow('Monthly Deferred', res?.term_months ? `${res.term_months} mos.` : '', fmtN(res?.monthly_deferred), true, false, true);
  } else {
    priceRow('Downpayment Amount',  fmtPct(res?.dp_rate), fmtN(res?.dp_amount));
    priceRow('(-) Reservation Fee', '', `(${fmtN(res?.reservation_fee)})`, false, true);
    const netDP = (res?.dp_amount ?? 0) - (res?.reservation_fee ?? 0);
    priceRow('Net Downpayment', '', fmtN(netDP));
    const monthly = isStretchedDP ? res?.monthly_stretched_dp : res?.monthly_deferred;
    priceRow('Monthly Downpayment', res?.term_months ? `${res.term_months} mos.` : '', fmtN(monthly), true);
    y += 3;
    priceRow('Balance for end-user financing', '', fmtN(res?.balance_for_financing), true, false, true);
  }

  if (hasFinancing) {
    const amortoCard = (title: string, cardY: number, balance: number | null, rate: string, term: string, monthly: number | null) => {
      let cy = drawSecBar(title, cardY, RX, RC);
      cy += 2;
      const amortoRow = (label: string, val: string) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(80, 80, 85);
        doc.text(label, RX + 2, cy + 3.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(28, 28, 30);
        doc.text(val, RX + RC - 2, cy + 3.5, { align: 'right' });
        cy += 6;
      };
      amortoRow('Balance for end-user financing', fmtN(balance));
      amortoRow('Indicative Interest Rate', rate);
      amortoRow('Loan Term (Max years)', term);
      amortoRow('Monthly Amortization', fmtN(monthly));
      return cy + 3;
    };

    let ry = twoColY;
    ry = amortoCard('BANK AMORTIZATION', ry, res?.balance_for_financing ?? null, '5.5%', '10 years', res?.bank_monthly ?? null);
    amortoCard('HDMF AMORTIZATION', ry, res?.balance_for_financing ?? null, '5.5%', '10 years', res?.hdmf_monthly ?? null);
  }

  footerBlock(doc);
  const blobUrl0   = doc.output('bloburl') as unknown as string;
  const topFilename = `TOP-${res?.client_id ?? 'unknown'}_${reservationId ?? ''}.pdf`;
  if (!openInNewTab) return blobUrl0;
  if (win && typeof (win as any).close === 'function') {
    (win as Window).close();
    const a = document.createElement('a'); a.href = blobUrl0; a.download = topFilename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  } else if (win) { win.location.href = blobUrl0; }
  else doc.output('dataurlnewwindow');
}

// ── Reservation Agreement ─────────────────────────────────────────────────────

const RESERVATION_TERMS = [
  {
    title: 'RESERVATION PROVISION',
    items: [
      `1. As proof of my interest to purchase the Property, I hereby tender the sum of: PHP {{RESERVATION_FEE}} as Reservation Fee, exclusive of VAT, in order to reserve the Property for our intended purchase which shall be effective for a period of thirty (30) days from delivery of the Reservation Fee. I understand and acknowledge that the Reservation Fee is non-refundable. Should I decide to cancel my reservation, fail to submit all the documentary requirements, including this Reservation Agreement; or fail to pay the amounts due on the due dates prescribed, for any reason whatsoever, I agree that my reservation shall lapse and my Reservation Fee shall be forfeited in favor of the Company. I will hold the Company free and harmless for thereafter releasing and offering the Property to other interested buyers.`,
      `2. I acknowledge that the Company reserves the right to accept or deny this request for reservation and is non-transferable. Likewise, subject to a written request by me, the Company, at its sole discretion, may extend this reservation for a period of more than fifteen (15) days within which to make the down payment provided, however, that I shall incur a penalty charge of three percent (3%) per month, or a fraction thereof.`,
      `3. In the event the Property is found unavailable for sale for any reason whatsoever, I agree to hold the Company free and harmless from any liability whatsoever and it shall have the option of exchanging the Property with another similar unit/lot/property as applicable or otherwise cancel this Reservation Agreement. Should there be no substitution or should the substituted Property be unacceptable to me, I shall hold the Company free and harmless from any liability for canceling the Reservation Agreement, subject to reimbursement to me of all payments made, without interest.`,
    ],
  },
  {
    title: 'PAYMENT AND PAYMENT MODES',
    items: [
      `4. Should my application to purchase the Property be accepted, the Reservation Fee shall automatically form part of the required down payment. Upon being notified of the acceptance of my offer to purchase the Property, I shall remit, within the period required by the Company, the down payment and/or balance, and the complete post-dated checks, in accordance with the Terms of Payment (inclusive of VAT and Other Charges), attached hereto as ANNEX A, without need of further demand. Any and all payments made to any individual, realtor, broker, employee, or to a party, other than the Company for safekeeping in favor of or for transmittal to the Company shall be at my sole and exclusive risk and responsibility, and shall not bind nor make the former answerable in any way, therefore unless and until actually received, receipted and validated by the Company's Cashier or officer duly authorized by the Company. All checks for payment shall be crossed and shall be made payable only to the Company under its corporate name: PH1 WORLD DEVELOPERS, INC.`,
      `5. In case I am permitted to issue checks of foreign currencies, or if payments are made through foreign remittances in the manner authorized by the Company, such checks or remittances shall be credited only after conversion to Philippine currency (Peso) based on the prevailing buying rate of the company's designated bank upon clearing of funds. In case of underpayment, payment shall be made on the last installment or last payment due (for balloon payments). In case of overpayment, the last installment or last payment due (for balloon payments) shall be adjusted accordingly. I shall shoulder all bank fees, charges and taxes upon remittances or conversion of foreign currencies.`,
      `6. All payments shall be made on or before their respective due dates without the necessity of demand or any legal or judicial action. In the event that I avail of bank financing, I shall solely responsible for filing the loan application prescribed by the bank, together with all necessary requirements, in order that the loan be processed and the proceeds released to the Company on or before the due date provided herein.`,
    ],
  },
  {
    title: 'SALES DOCUMENT AND OTHER REQUIREMENTS',
    items: [
      `7. Should I fail to pay any of the amounts due in relation to my purchase of the Property, or fail to submit the required documents and execute the relevant contract to sell and deed of absolute sale for the Property, or fail to comply with any of the terms of my purchase, the Company shall have the sole option to (i) cancel the sale and forfeit in its favor all payments made, including the Reservation Fee to be credited to liquidated damages; and (ii) impose penalty charges at the rate of three percent (3%) per month (or fraction thereof). Late payments will only be accepted upon payment of interest and penalty charges. Should there be a cancellation of this reservation, the same shall automatically vest upon the Company full authority to sell and dispose of the Property subject to this Reservation Agreement.`,
      `8. Unless otherwise provided, my Contract to Sell for the Property shall be prepared only after I have submitted to the Company all necessary documents and post-dated checks in such amounts and on such dates as are in accordance with the Schedule or Payment. The Contract to Sell shall be executed by me within thirty (30) days from date of receipt of the Contract to Sell. Should I fail to submit the duly signed Contract to Sell within the said period, this Reservation Agreement shall be cancelled.`,
      `9. I understand and agree that this Agreement only gives me the right to purchase the Property subject to the fulfillment of the conditions herein stated. No other right, title or ownership is vested upon me by the execution of this Agreement. The Company retains title and ownership of the Property until I have fully paid all amounts due to the Company for the purchase of the Property.`,
      `10. I agree and understand that my purchase of the Property is subject to the covenants and restrictions specified in the Project's Deed of Restrictions (for subdivision and townhouse developments) or Master Deed with Declaration of Restrictions for condominium developments, as applicable, which shall bind the Property upon its transfer to me as a buyer, all of which covenants and restrictions I undertake to faithfully and strictly comply with. My undertaking and confirmation herein constitute an essential consideration of the sale by the Company of the Property to me.`,
    ],
  },
  {
    title: 'AGREEMENTS AND OTHER PROVISIONS',
    items: [
      `11. I confirm that I have personally inspected the plans and specifications of the Property, studied and verified the Project site and its proximate location and layout of my requested property and I find the same to be acceptable and satisfactory. I acknowledge that I have independently ascertained and evaluated all material facts and technical information related to the purchase of the Property and that I am satisfied with what was explained to me. I further understand and agree that numbering, sizes and conditions of residential and parking units are subject to adjustments in accordance with the approved building plan or amendments thereon and I agree that the developer reserves the right to revise architectural and floor plans without my consent.`,
      `12. I hereby authorize the developer of the Project to organize the Project's governing Homeowner's Association or Condominium Corporation, as applicable.`,
      `13. I warrant the truthfulness and accuracy of all information I have provided which I certify to be true and correct as of the date hereof and agree to directly and personally inform the Company in writing of any changes in my personal data such as but not limited to name, address and/or status.`,
      `14. Further, I agree that the address stated herein shall be the official address to which all communications/notices must be sent, unless a change of address is communicated in writing to the Company. Similarly, the Company, its officers, employees may rely on the information provided to it and shall not be held responsible for any error, non-communication, or miscommunication of the personal information I have given. I also warrant that the funds used and to be used in purchasing the Property will be obtained through legitimate means and do not and will not constitute all or part of the proceeds of any unlawful activity under applicable laws. I hereby authorize the Company to provide to any government body or agency any information pertaining to this sale and purchase, if so warranted and required under existing laws, and hereby hold the Company free and harmless from any incident, claim, action, or liability arising from the breach of my warranties herein.`,
      `15. This document represents the entire agreement of my reservation of the Property. Any and all stipulations, reservations, agreements, or promises, orally or otherwise, not contained herein or not reduced in writing and signed by the Company's duly authorized representative shall not be binding upon the Company.`,
      `16. If there are two (2) or more of us signing as buyers, I understand that our obligations under this Agreement shall be deemed contracted by us in a solidarity matter.`,
    ],
  },
];

export async function generateReservationAgreement(reservationId: string | null, openInNewTab = true): Promise<string | void> {
  const win   = openInNewTab ? window.open('', '_blank') : null;
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const L = 14, W = pageW - 28;

  let res: (ReservationDetail & { created_at?: string }) | null = null;
  let clientSig:  string | null = null;
  let sellerSig:  string | null = null;
  let sellerName: string | null = null;

  if (reservationId) {
    const { data: rd } = await supabase
      .from('reservations')
      .select(`reservation_id, client_id, client_name, seller_name, project, tower, inventory_code,
               unit_no, unit_type, unit_area, scheme_name, dp_rate, term_months,
               total_contract_price, reservation_fee, created_at,
               net_list_price, vat, other_charges,
               list_price, promo_discount_pct, promo_discount_amount,
               payterm_discount_pct, payterm_discount_amount,
               hic_discount, employee_discount_amount,
               dp_amount, balance_for_financing, monthly_deferred,
               monthly_stretched_dp, bank_monthly, hdmf_monthly`)
      .eq('reservation_id', reservationId)
      .single();
    if (rd) res = rd as (ReservationDetail & { created_at?: string; seller_name?: string | null });

    sellerName = (res as any)?.seller_name ?? null;
    if (sellerName) sellerSig = await fetchSellerSignature(sellerName);

    if (res?.client_id) {
      const { data: cr } = await supabase
        .from('clients')
        .select('signature_base64')
        .eq('client_id', res.client_id)
        .maybeSingle();
      clientSig = (cr as any)?.signature_base64 ?? null;
    }
  }

  await headerBlock(doc, 'Reservation Agreement', res?.reservation_id ?? '');

  const secImg  = makeColorDataURL(252, 210, 212);
  const cellImg = makeColorDataURL(243, 243, 245);
  const CELL = 13, GAP = 0.6;
  const C2 = W / 2, C3 = W / 3, C4 = W / 4, C5 = W / 5;
  let pageNum = 1;

  const drawSecBar = (title: string, y: number): number => {
    doc.addImage(secImg, 'PNG', L, y, W, 7);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(140, 30, 30);
    doc.text(title, L + 2, y + 5);
    return y + 7;
  };
  const drawCell = (label: string, value: string, x: number, y: number, w: number, h = CELL) => {
    doc.addImage(cellImg, 'PNG', x, y, w - GAP, h);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(110, 110, 115);
    doc.text(doc.splitTextToSize(label.toUpperCase(), w - GAP - 3), x + 2, y + 4);
    doc.setFontSize(8);
    doc.setTextColor(28, 28, 30);
    doc.text(value || '—', x + 2, y + 10);
  };
  const addPage = () => {
    pageNum++;
    doc.addPage();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(160, 160, 165);
    doc.text(`Page ${pageNum}`, pageW - L, pageH - 9, { align: 'right' });
  };
  const checkBreak = (needed: number, y: number): number => {
    if (y + needed > pageH - 18) { addPage(); return 14; }
    return y;
  };
  const fmtN = (n: number | null | undefined) =>
    n != null ? 'Php ' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '—';

  // suppress unused warnings
  void C2; void C3; void C4;

  let y = 36;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(50, 50, 55);
  const intro = 'I hereby manifest my intention and offer to purchase from PH1 WORLD DEVELOPERS INC. (the "Company") the following property (the "Property") and request that the Property be reserved for my purchase under the agreed price, terms and conditions indicated below:';
  const introLines = doc.splitTextToSize(intro, W);
  doc.text(introLines, L, y);
  y += introLines.length * 4.5 + 4;

  drawCell("Buyer's Full Name", res?.client_name ?? '—', L, y, W);
  y += CELL + 6;

  y = drawSecBar('PROPERTY INFORMATION', y) + 1;
  drawCell('Project',          res?.project        ?? '—', L,          y, C5);
  drawCell('Tower / House No.', res?.tower         ?? '—', L + C5,     y, C5);
  drawCell('Unit Number',      res?.inventory_code ?? '—', L + C5 * 2, y, C5);
  drawCell('Unit Type',        res?.unit_type      ?? '—', L + C5 * 3, y, C5);
  drawCell('Unit Area',        res?.unit_area != null ? String(res.unit_area) : '—', L + C5 * 4, y, C5);
  y += CELL + 4;

  y = drawSecBar('PRICE AND TERMS', y) + 1;
  drawCell('Net List Price',       fmtN(res?.net_list_price),        L,          y, C5);
  drawCell('Value Added Tax',      fmtN(res?.vat),                   L + C5,     y, C5);
  drawCell('Other Charges',        fmtN(res?.other_charges),         L + C5 * 2, y, C5);
  drawCell('Total Contract Price', fmtN(res?.total_contract_price),  L + C5 * 3, y, C5);
  drawCell('Payment Scheme',       res?.scheme_name ?? '—',          L + C5 * 4, y, C5);
  y += CELL + 8;

  doc.addImage(secImg, 'PNG', L, y, W, 7);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(140, 30, 30);
  doc.text('TERMS AND CONDITIONS', pageW / 2, y + 5, { align: 'center' });
  y += 9;

  const rfFormatted = res?.reservation_fee
    ? res.reservation_fee.toLocaleString('en-PH', { minimumFractionDigits: 2 })
    : '0.00';

  RESERVATION_TERMS.forEach((section, idx) => {
    y = checkBreak(10, y);
    if (idx === 0) y += 3;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(140, 30, 30);
    doc.text(section.title, L, y);
    y += 5;
    section.items.forEach(item => {
      const text = item.replace('{{RESERVATION_FEE}}', rfFormatted);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(50, 50, 55);
      const lines = doc.splitTextToSize(text, W);
      lines.forEach((line: string) => { y = checkBreak(4, y); doc.text(line, L, y); y += 3.8; });
      y += 2;
    });
    y += 1.5;
  });

  y = checkBreak(30, y);
  y += 6;
  const today  = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  const sigW   = 75;
  const sigImgH = 12;
  const rightSigX = pageW - L - sigW;

  if (clientSig) { const c = await compressImage(clientSig, 600, 100, 0.92); doc.addImage(c, 'JPEG', L,         y - sigImgH, sigW, sigImgH); }
  if (sellerSig) { const c = await compressImage(sellerSig, 600, 100, 0.92); doc.addImage(c, 'JPEG', rightSigX, y - sigImgH, sigW, sigImgH); }

  // names above the line, below the signature image
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(28, 28, 30);
  if (res?.client_name) doc.text(res.client_name, L, y + 3);
  if (sellerName)       doc.text(sellerName,       rightSigX, y + 3);

  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.4);
  doc.line(L, y + 6, L + sigW, y + 6);
  doc.line(rightSigX, y + 6, pageW - L, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(28, 28, 30);
  doc.text(today, L + sigW, y + 5, { align: 'right' });
  doc.text(today, pageW - L, y + 5, { align: 'right' });
  doc.setFontSize(7);
  doc.setTextColor(110, 110, 115);
  doc.text('Buyer Signature over Printed Name', L, y + 10);
  doc.text('Seller Signature over Printed Name', rightSigX, y + 10);

  footerBlock(doc);
  const blobUrl1   = doc.output('bloburl') as unknown as string;
  const raFilename = `RA-${res?.client_id ?? 'unknown'}_${reservationId ?? ''}.pdf`;
  if (!openInNewTab) return blobUrl1;
  if (win && typeof (win as any).close === 'function') {
    (win as Window).close();
    const a = document.createElement('a'); a.href = blobUrl1; a.download = raFilename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  } else if (win) { win.location.href = blobUrl1; }
  else doc.output('dataurlnewwindow');
}

// ── Buyer Information Form ────────────────────────────────────────────────────

type PrivBlock =
  | { type: 'para'; text: string }
  | { type: 'item'; label: string; text: string }
  | { type: 'bullet'; text: string };

const PRIVACY_BLOCKS: PrivBlock[] = [
  { type: 'para', text: `PH1 World Developers, Inc. and/or its subsidiaries (the "Company") recognize the utmost importance of protecting your privacy. As such, the Company has adopted this Privacy Policy ("Policy"), which is consistent with Republic Act No. 10173, otherwise known as the Data Privacy Act of 2012 ("DPA"), its Implementing Rules and Regulations ("IRR"), and all applicable regulations and issuances on data privacy and data protection.` },
  { type: 'para', text: `As its customer or client, the Company may collect, use, share, retain, and dispose (collectively, to "Process") the following personal information and/or sensitive personal information ("Personal Data") from you:` },
  { type: 'item', label: 'a.', text: `basic personal information, such as full name, nickname, home address/ billing address/ shipping address, e-mail address, employment information, telephone number, other contact numbers, username and password;` },
  { type: 'item', label: 'b.', text: `sensitive personal information, such as age, nationality, marital status, gender, health, education, and government-issued identification documents which include, but are not limited to, identification cards, licenses, and social security number; and,` },
  { type: 'item', label: 'c.', text: `income information and financial details, such as credit history, bank accounts, credit cards and debit card information.` },
  { type: 'para', text: `The foregoing Personal Data shall be used by the Company in a reasonable manner and when necessary for a declared and specific purpose, which may be any of the following:` },
  { type: 'item', label: 'a.', text: `When you inquire about or purchase a unit or property:` },
  { type: 'bullet', text: `to conduct the appropriate credit investigation and evaluate the credit risk associated with your financial obligation to the Company arising from your purchase;` },
  { type: 'bullet', text: `to facilitate the sale and the turnover of a unit or property which includes the execution of contracts, the preparation of documentation leading to the transfer of title, and performance of financial processes (i.e. reservation fees, amortization and handover fees) associated with the sale;` },
  { type: 'bullet', text: `to provide information or services concerning the trading, brokerage, leasing, management and other incidental operations of real estate;` },
  { type: 'bullet', text: `to update our records and keep your contact details and billing address up to date; and,` },
  { type: 'bullet', text: `to ensure the safety and security of the other unit or property owners, tenants and/or occupants.` },
  { type: 'item', label: 'b.', text: `To carry out the necessary due diligence;` },
  { type: 'item', label: 'c.', text: `For you to provide reviews on our products and services;` },
  { type: 'item', label: 'd.', text: `To generate statistical insight;` },
  { type: 'item', label: 'e.', text: `To conduct research and analysis (through surveys or polls) in order to improve your experience and satisfaction;` },
  { type: 'item', label: 'f.', text: `To respond to specific complaints, inquiries, requests, or to provide requested information;` },
  { type: 'item', label: 'g.', text: `To provide timely and efficient customer care activities and services;` },
  { type: 'item', label: 'h.', text: `To monitor the Company's quality and security; and,` },
  { type: 'item', label: 'i.', text: `To notify and update you (through call, text or email) about our complimentary, commercial and promotional advertisements, exclusive invites, discounts, surveys and other direct marketing that the Company may deem relevant and beneficial to you based on your preference and interest, with which you can opt-out anytime should you prefer not to receive these notifications.` },
  { type: 'para', text: `You shall be responsible for ensuring that the Personal Data you submitted to the Company is accurate, complete, and up to date. All Personal Data Processed by the Company shall be considered correct unless you request that it be updated.` },
  { type: 'para', text: `All Personal Data provided by you will be kept strictly confidential. Accordingly, the Company will not disclose or share your Personal Data to third parties without your consent. However, the Company may share your Personal Data to its agents, brokers, employees and/or personnel on a need-to-know basis. In which case, your Personal Data will be used in a manner consistent with the purpose for which it was originally collected and to which you consented, and pursuant to the DPA, its IRR, and all applicable regulations and issuances on data privacy and protection.` },
  { type: 'para', text: `The Company may also share your Personal Data with third parties who perform services for it. Under such circumstances, the Company requires its service providers to limit the use of your Personal Data in a manner consistent with the purpose for which it was originally collected, and to protect your Personal Data aligned with the Company's security standards.` },
  { type: 'para', text: `Further, the Company may share your Personal Data to unrelated third parties, upon your request, when legally required to do so, or when it is necessary to protect and/or defend the Company's rights, property, or safety, and those of other individuals. Nevertheless, the Company will continue, as far as practicable, to take all necessary measures to protect your Personal Data.` },
  { type: 'para', text: `To secure your Personal Data, the Company employs appropriate organizational, technical, and physical security measures to protect the Personal Data you provide against accidental, unlawful, or unauthorized destructions, loss, alteration, access, disclosure, or use. The Company shall keep your Personal Data within five (5) years from the date of your last transaction with the Company (i.e. release of transferred title or documents relating to a cancellation of the sale), or as may be required by law, unless you expressly withdraw your consent in writing.` },
  { type: 'para', text: `As the owner of the Personal Data, you have the right to be informed of: (i) the Personal Data being, or that was, Processed by the Company; (ii) the right to gain reasonable access to your Personal Data; (iii) the right to object to the Processing of your Personal Data; (iv) the right to suspend, withdraw, or order the removal or destruction of your Personal Data; (v) the right to dispute any error in your Personal Data and have the Company correct it immediately; and (vi) the right to obtain a copy of the Personal Data in electronic format, if available.` },
];

export async function generateBuyerInformationForm(reservationId: string | null, openInNewTab = true): Promise<string | void> {
  const win = openInNewTab ? window.open('', '_blank') : null;
  if (!reservationId) { win?.close(); return; }

  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const L = 14, W = pageW - 28;
  const CELL = 7, GAP = 0.5;
  const C2 = W / 2, C3 = W / 3;
  let pageNum = 1;

  const { data: resRow } = await supabase
    .from('reservations')
    .select('reservation_id, client_id, project, inventory_code')
    .eq('reservation_id', reservationId)
    .maybeSingle();

  const progress = await getBookingProgress(reservationId).catch(() => null);

  const displayClientId = (resRow as any)?.client_id ?? null;
  let clientRow: any = null;
  let buyerInfo: BuyerInfoRecord | null = null;
  if (displayClientId) {
    const { data } = await supabase
      .from('clients')
      .select('id, client_id, first_name, middle_name, last_name, suffix, gender, civil_status, citizenship, date_of_birth, country_code, mobile_number, landline_no, email, signature_base64')
      .eq('client_id', displayClientId)
      .maybeSingle();
    clientRow = data;
    if (clientRow?.id) buyerInfo = await fetchBuyerInfo(clientRow.id).catch(() => null);
  }

  const [spouseInfo, coOwnerInfo, attyInfo] = await Promise.all([
    progress?.has_spouse       ? fetchSpouseInfo(reservationId).catch(() => null)    : Promise.resolve(null),
    progress?.has_co_ownership ? fetchCoOwner(reservationId).catch(() => null)       : Promise.resolve(null),
    progress?.has_atty_in_fact ? fetchAttyInFact(reservationId).catch(() => null)   : Promise.resolve(null),
  ]);

  const coOwnerSpouseInfo = (coOwnerInfo?.civil_status === 'Married')
    ? await fetchCoOwnerSpouse(reservationId).catch(() => null)
    : null;

  const logo     = await loadLogo();
  const hdrImg   = makeColorDataURL(238, 67, 78);
  const bifResId = (resRow as any)?.reservation_id ?? '';
  const HDR      = 30;

  const drawPageHeader = () => {
    doc.addImage(hdrImg, 'PNG', 0, 0, pageW, HDR);
    if (logo.b64) doc.addImage(logo.b64, 'PNG', 14, (HDR - logo.h) / 2, logo.w, logo.h);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(255, 255, 255);
    doc.text('BUYER INFORMATION FORM', pageW - 14, 13, { align: 'right' });
    if (bifResId) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(255, 220, 210);
      doc.text(bifResId, pageW - 14, 22, { align: 'right' });
    }
    doc.setTextColor(30, 30, 30);
  };

  drawPageHeader();

  const secImg  = makeColorDataURL(252, 210, 212);
  const cellImg = makeColorDataURL(243, 243, 245);

  const drawSecBar = (title: string, y: number): number => {
    doc.addImage(secImg, 'PNG', L, y, W, 7);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(140, 30, 30);
    doc.text(title, L + 2, y + 5);
    return y + 7;
  };
  const drawCell = (label: string, value: string, x: number, y: number, w: number) => {
    doc.addImage(cellImg, 'PNG', x, y, w - GAP, CELL);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(110, 110, 115);
    doc.text(label.toUpperCase(), x + 1.5, y + 2.2);
    doc.setFontSize(7);
    doc.setTextColor(28, 28, 30);
    doc.text(value || '—', x + 1.5, y + 5.8);
  };
  const addPage = () => {
    pageNum++;
    doc.addPage();
    drawPageHeader();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(160, 160, 165);
    doc.text(`Page ${pageNum}`, pageW - L, pageH - 9, { align: 'right' });
  };
  const checkBreak = (needed: number, y: number): number => {
    if (y + needed > pageH - 18) { addPage(); return 36; }
    return y;
  };
  const fmtDate = (d: string | null | undefined) =>
    d ? new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { month: '2-digit', day: '2-digit', year: 'numeric' }) : '—';

  const C4 = W / 4;
  const C5 = W / 5;

  const subLabel = (text: string, y: number): number => {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(80, 80, 85);
    doc.text(text, L, y + 3);
    return y + 5;
  };

  const renderPersonBlock = (
    sectionTitle: string,
    p: {
      last_name?: string | null; first_name?: string | null; middle_name?: string | null; suffix?: string | null;
      gender?: string | null; civil_status?: string | null; citizenship?: string | null;
      date_of_birth?: string | null; mobile_code?: string | null; mobile?: string | null;
      landline?: string | null; email?: string | null; tin?: string | null; no_tin?: boolean | null;
      home_ownership?: string | null; home_country?: string | null;
      home_region_province?: string | null; home_city_municipality?: string | null;
      home_barangay?: string | null; home_street?: string | null; home_unit?: string | null;
      employer?: string | null; nature_of_business?: string | null;
      employment_sector?: string | null; employment_status?: string | null;
      job_title?: string | null; rank?: string | null; salary_range?: string | null;
      work_mobile_code?: string | null; work_mobile?: string | null;
      work_landline?: string | null; work_email?: string | null;
      work_country?: string | null; work_region_province?: string | null;
      work_city_municipality?: string | null; work_barangay?: string | null;
      work_street?: string | null; work_building_unit?: string | null;
      mailing_type?: string | null;
      mailing_other?: string | null;
      // Emergency contact (buyer only)
      emergency_contact_name?: string | null; emergency_contact_no?: string | null;
      emergency_contact_relation?: string | null; emergency_contact_email?: string | null;
      // Alternate address (buyer only)
      alt_country?: string | null; alt_region_province?: string | null;
      alt_city_municipality?: string | null; alt_barangay?: string | null;
      alt_street?: string | null; alt_unit?: string | null;
    },
    currentY = 36,
    opts: {
      preamble?: string;
      employmentPrefix?: string;
      showCivilStatus?: boolean;
      showHomeOwnership?: boolean;
      showAddress?: boolean;
      showWorkAddress?: boolean;
      showMailingAddress?: boolean;
    } = {}
  ) => {
    const {
      preamble, employmentPrefix = '', showCivilStatus = true, showHomeOwnership = true,
      showAddress = true, showWorkAddress = true, showMailingAddress = false,
    } = opts;
    let y = currentY;

    if (preamble) {
      y = checkBreak(12, y);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7);
      doc.setTextColor(80, 80, 85);
      const preambleLines = doc.splitTextToSize(preamble, W);
      preambleLines.forEach((line: string) => { doc.text(line, L, y + 4); y += 4.5; });
      y += 3;
    }

    y = checkBreak(7 + 6 + (CELL + 4) * 3, y);
    y = drawSecBar(sectionTitle, y) + 2;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(80, 80, 85);
    doc.text('Full Name (As found in your valid government issued ID)', L, y + 3);
    y += 5;

    drawCell('Last Name',    p.last_name    ?? '—', L,           y, C5);
    drawCell('First Name',   p.first_name   ?? '—', L + C5,      y, C5);
    drawCell('Middle Name',  p.middle_name  ?? '—', L + C5 * 2,  y, C5);
    drawCell('Suffix',       p.suffix       ?? '—', L + C5 * 3,  y, C5);
    drawCell('Date of Birth', fmtDate(p.date_of_birth), L + C5 * 4, y, C5); y += CELL + 2;

    if (showCivilStatus) {
      drawCell('Gender',                p.gender       ?? '—', L,           y, C4);
      drawCell('Citizenship',           p.citizenship  ?? '—', L + C4,      y, C4);
      drawCell('Civil Status',          p.civil_status ?? '—', L + C4 * 2,  y, C4);
      drawCell('Tax Identification No.', p.tin || (p.no_tin ? 'No TIN' : '—'), L + C4 * 3, y, C4);
    } else {
      drawCell('Gender',                p.gender       ?? '—', L,           y, C4);
      drawCell('Citizenship',           p.citizenship  ?? '—', L + C4,      y, C4);
      drawCell('Tax Identification No.', p.tin || (p.no_tin ? 'No TIN' : '—'), L + C4 * 2, y, C2);
    }
    y += CELL + 4;

    y = checkBreak(5 + (CELL + 2), y);
    y = subLabel('Contact Information', y);
    const mobileStr = p.mobile_code && p.mobile ? `${p.mobile_code} ${p.mobile}` : (p.mobile ?? '—');
    drawCell('Mobile Number',  mobileStr,          L,          y, C3);
    drawCell('Landline Number', p.landline ?? '—', L + C3,     y, C3);
    drawCell('Email Address',  p.email    ?? '—',  L + C3 * 2, y, C3); y += CELL + 4;

    if (p.emergency_contact_name || p.emergency_contact_no || p.emergency_contact_relation) {
      y = checkBreak(5 + CELL + 2, y);
      y = subLabel('Emergency Contact', y);
      drawCell('Name',         p.emergency_contact_name     ?? '—', L,          y, C4);
      drawCell('Contact No.',  p.emergency_contact_no       ?? '—', L + C4,     y, C4);
      drawCell('Relationship', p.emergency_contact_relation ?? '—', L + C4 * 2, y, C4);
      drawCell('Email',        p.emergency_contact_email    ?? '—', L + C4 * 3, y, C4);
      y += CELL + 4;
    }

    if (showAddress) {
      y = checkBreak(5 + (CELL + 2) * 2, y);
      y = subLabel('Address', y);
      drawCell('Unit No. Building / House No. Block No.', p.home_unit    ?? '—', L,          y, C3);
      drawCell('Street, Subdivision / Village',           p.home_street  ?? '—', L + C3,     y, C3);
      drawCell('Barangay',                                p.home_barangay ?? '—', L + C3 * 2, y, C3); y += CELL + 2;

      if (showHomeOwnership) {
        drawCell('City / Municipality', p.home_city_municipality ?? '—', L,          y, C4);
        drawCell('Province / Region',   p.home_region_province   ?? '—', L + C4,     y, C4);
        drawCell('Country',             p.home_country           ?? '—', L + C4 * 2, y, C4);
        drawCell('Home Ownership',      p.home_ownership         ?? '—', L + C4 * 3, y, C4);
      } else {
        drawCell('City / Municipality', p.home_city_municipality ?? '—', L,          y, C3);
        drawCell('Province / Region',   p.home_region_province   ?? '—', L + C3,     y, C3);
        drawCell('Country',             p.home_country           ?? '—', L + C3 * 2, y, C3);
      }
      y += CELL + 2;

      if (p.alt_country || p.alt_region_province || p.alt_city_municipality || p.alt_barangay) {
        y = checkBreak(5 + (CELL + 2) * 2, y);
        y = subLabel('Alternate Address', y);
        drawCell('Unit No. / Building No.', p.alt_unit     ?? '—', L,          y, C3);
        drawCell('Street / Subdivision',    p.alt_street   ?? '—', L + C3,     y, C3);
        drawCell('Barangay',                p.alt_barangay ?? '—', L + C3 * 2, y, C3); y += CELL + 2;
        drawCell('City / Municipality', p.alt_city_municipality ?? '—', L,          y, C3);
        drawCell('Province / Region',   p.alt_region_province   ?? '—', L + C3,     y, C3);
        drawCell('Country',             p.alt_country            ?? '—', L + C3 * 2, y, C3); y += CELL + 2;
      }
    }

    if (showMailingAddress && p.mailing_type) {
      y = checkBreak(5 + CELL + 2, y);
      y = subLabel('Mailing Address', y);
      let mailingAddr = '—';
      if (p.mailing_type === 'Home Address') {
        const parts = [p.home_unit, p.home_street, p.home_barangay, p.home_city_municipality, p.home_region_province, p.home_country].filter(Boolean);
        mailingAddr = parts.length > 0 ? parts.join(', ') : '—';
      } else if (p.mailing_type === 'Office Address') {
        const parts = [p.work_building_unit, p.work_street, p.work_barangay, p.work_city_municipality, p.work_region_province, p.work_country].filter(Boolean);
        mailingAddr = parts.length > 0 ? parts.join(', ') : '—';
      } else if (p.mailing_type === 'Others') {
        mailingAddr = p.mailing_other ?? '—';
      }
      drawCell('Mailing Address', mailingAddr, L, y, W);
      y += CELL + 2;
    }

    y += 3;

    y = checkBreak(5 + (CELL + 2) * 3, y);
    const empTitle = employmentPrefix ? `${employmentPrefix} EMPLOYMENT / BUSINESS INFORMATION` : 'EMPLOYMENT / BUSINESS INFORMATION';
    y = drawSecBar(empTitle, y) + 2;

    drawCell('Employment Status',        p.employment_status  ?? '—', L,          y, C4);
    drawCell('Employment Sector',        p.employment_sector  ?? '—', L + C4,     y, C4);
    drawCell('Employer / Business Name', p.employer           ?? '—', L + C4 * 2, y, C4);
    drawCell('Nature of Business',       p.nature_of_business ?? '—', L + C4 * 3, y, C4); y += CELL + 2;

    drawCell('Rank',                 p.rank          ?? '—', L,          y, C3);
    drawCell('Job Title / Position', p.job_title     ?? '—', L + C3,     y, C3);
    drawCell('Salary Range',         p.salary_range  ?? '—', L + C3 * 2, y, C3); y += CELL + 4;

    y = checkBreak(5 + (CELL + 2), y);
    y = subLabel('Contact Information', y);
    const workMobileStr = p.work_mobile_code && p.work_mobile ? `${p.work_mobile_code} ${p.work_mobile}` : (p.work_mobile ?? '—');
    drawCell('Mobile Number',  workMobileStr,           L,          y, C3);
    drawCell('Landline Number', p.work_landline ?? '—', L + C3,     y, C3);
    drawCell('Email Address',  p.work_email    ?? '—',  L + C3 * 2, y, C3); y += CELL + 4;

    if (showWorkAddress) {
      y = checkBreak(5 + (CELL + 2) * 2, y);
      y = subLabel('Address', y);
      drawCell('Unit No. Building / House No. Block No.', p.work_building_unit ?? '—', L,          y, C3);
      drawCell('Street, Subdivision / Village',           p.work_street        ?? '—', L + C3,     y, C3);
      drawCell('Barangay',                                p.work_barangay      ?? '—', L + C3 * 2, y, C3); y += CELL + 2;

      y = checkBreak(CELL + 2, y);
      drawCell('City / Municipality', p.work_city_municipality ?? '—', L,          y, C3);
      drawCell('Province / Region',   p.work_region_province   ?? '—', L + C3,     y, C3);
      drawCell('Country',             p.work_country           ?? '—', L + C3 * 2, y, C3); y += CELL + 4;
    } else {
      y += 4;
    }

    return y;
  };

  let y = 36;
  const buyerPayload = {
    last_name: clientRow?.last_name, first_name: clientRow?.first_name,
    middle_name: clientRow?.middle_name, suffix: clientRow?.suffix,
    gender: clientRow?.gender ?? buyerInfo?.gender,
    civil_status: clientRow?.civil_status ?? buyerInfo?.civil_status,
    citizenship: clientRow?.citizenship, date_of_birth: clientRow?.date_of_birth,
    mobile_code: clientRow?.country_code, mobile: clientRow?.mobile_number,
    landline: clientRow?.landline_no, email: clientRow?.email,
    tin: buyerInfo?.tin, no_tin: buyerInfo?.no_tin,
    home_ownership: buyerInfo?.home_ownership, home_country: buyerInfo?.home_country,
    home_region_province: buyerInfo?.home_region_province, home_city_municipality: buyerInfo?.home_city_municipality,
    home_barangay: buyerInfo?.home_barangay, home_street: buyerInfo?.home_street, home_unit: buyerInfo?.home_unit,
    employer: buyerInfo?.employer, nature_of_business: buyerInfo?.nature_of_business,
    employment_sector: buyerInfo?.employment_sector, employment_status: buyerInfo?.employment_status,
    job_title: buyerInfo?.job_title, rank: buyerInfo?.rank, salary_range: buyerInfo?.salary_range,
    work_mobile_code: buyerInfo?.work_mobile_code, work_mobile: buyerInfo?.work_mobile,
    work_landline: buyerInfo?.work_landline, work_email: buyerInfo?.work_email,
    work_country: buyerInfo?.work_country, work_region_province: buyerInfo?.work_region_province,
    work_city_municipality: buyerInfo?.work_city_municipality, work_barangay: buyerInfo?.work_barangay,
    work_street: buyerInfo?.work_street, work_building_unit: buyerInfo?.work_building_unit,
    mailing_type: buyerInfo?.mailing_type,
    mailing_other: buyerInfo?.mailing_other,
    emergency_contact_name:     buyerInfo?.emergency_contact_name,
    emergency_contact_no:       buyerInfo?.emergency_contact_no,
    emergency_contact_relation: buyerInfo?.emergency_contact_relation,
    emergency_contact_email:    buyerInfo?.emergency_contact_email,
    alt_country:           buyerInfo?.alt_country,
    alt_region_province:   buyerInfo?.alt_region_province,
    alt_city_municipality: buyerInfo?.alt_city_municipality,
    alt_barangay:          buyerInfo?.alt_barangay,
    alt_street:            buyerInfo?.alt_street,
    alt_unit:              buyerInfo?.alt_unit,
  };
  y = renderPersonBlock('BUYER INFORMATION', buyerPayload, y, { showCivilStatus: true, showHomeOwnership: true, showMailingAddress: true });

  if (progress?.has_spouse && spouseInfo) {
    y = renderPersonBlock('SPOUSE INFORMATION', {
      last_name: spouseInfo.last_name, first_name: spouseInfo.first_name,
      middle_name: spouseInfo.middle_name, suffix: spouseInfo.suffix,
      gender: spouseInfo.gender, civil_status: spouseInfo.civil_status,
      citizenship: spouseInfo.citizenship, date_of_birth: spouseInfo.date_of_birth,
      mobile_code: spouseInfo.mobile_code, mobile: spouseInfo.mobile,
      landline: spouseInfo.landline, email: spouseInfo.email,
      tin: spouseInfo.tin, no_tin: spouseInfo.no_tin,
      home_ownership: spouseInfo.home_ownership, home_country: spouseInfo.home_country,
      home_region_province: spouseInfo.home_region_province, home_city_municipality: spouseInfo.home_city_municipality,
      home_barangay: spouseInfo.home_barangay, home_street: spouseInfo.home_street, home_unit: spouseInfo.home_unit,
      employer: spouseInfo.employer, nature_of_business: spouseInfo.nature_of_business,
      employment_sector: spouseInfo.employment_sector, employment_status: spouseInfo.employment_status,
      job_title: spouseInfo.job_title, rank: spouseInfo.rank, salary_range: spouseInfo.salary_range,
      work_mobile_code: spouseInfo.work_mobile_code, work_mobile: spouseInfo.work_mobile,
      work_landline: spouseInfo.work_landline, work_email: spouseInfo.work_email,
      work_country: spouseInfo.work_country, work_region_province: spouseInfo.work_region_province,
      work_city_municipality: spouseInfo.work_city_municipality, work_barangay: spouseInfo.work_barangay,
      work_street: spouseInfo.work_street, work_building_unit: spouseInfo.work_building_unit,
      mailing_type: spouseInfo.mailing_type,
    }, y, {
      preamble: 'If Married, the Buyer agrees that his/her spouse (as applicable) shall sign the Contract-to-Sell.',
      employmentPrefix: 'SPOUSE', showCivilStatus: false, showHomeOwnership: false,
      showAddress: false, showWorkAddress: false,
    });
  }

  if (progress?.has_co_ownership && !progress.co_owner_is_spouse && coOwnerInfo) {
    y = renderPersonBlock('CO-OWNER INFORMATION', {
      last_name: coOwnerInfo.last_name, first_name: coOwnerInfo.first_name,
      middle_name: coOwnerInfo.middle_name, suffix: coOwnerInfo.suffix,
      gender: coOwnerInfo.gender, civil_status: coOwnerInfo.civil_status,
      citizenship: coOwnerInfo.citizenship, date_of_birth: coOwnerInfo.date_of_birth,
      mobile_code: coOwnerInfo.mobile_code, mobile: coOwnerInfo.mobile,
      landline: coOwnerInfo.landline, email: coOwnerInfo.email,
      tin: coOwnerInfo.tin, no_tin: coOwnerInfo.no_tin,
      home_ownership: coOwnerInfo.home_ownership, home_country: coOwnerInfo.home_country,
      home_region_province: coOwnerInfo.home_region_province, home_city_municipality: coOwnerInfo.home_city_municipality,
      home_barangay: coOwnerInfo.home_barangay, home_street: coOwnerInfo.home_street, home_unit: coOwnerInfo.home_unit,
      employer: coOwnerInfo.employer, nature_of_business: coOwnerInfo.nature_of_business,
      employment_sector: coOwnerInfo.employment_sector, employment_status: coOwnerInfo.employment_status,
      job_title: coOwnerInfo.job_title, rank: coOwnerInfo.rank, salary_range: coOwnerInfo.salary_range,
      work_mobile_code: coOwnerInfo.work_mobile_code, work_mobile: coOwnerInfo.work_mobile,
      work_landline: coOwnerInfo.work_landline, work_email: coOwnerInfo.work_email,
      work_country: coOwnerInfo.work_country, work_region_province: coOwnerInfo.work_region_province,
      work_city_municipality: coOwnerInfo.work_city_municipality, work_barangay: coOwnerInfo.work_barangay,
      work_street: coOwnerInfo.work_street, work_building_unit: coOwnerInfo.work_building_unit,
      mailing_type: coOwnerInfo.mailing_type,
      mailing_other: coOwnerInfo.mailing_other,
    }, y, {
      preamble: 'If with Co-Owner, the Buyer agrees that the co-owner and his/her spouse shall sign the Contract-to-Sell should they agree to be co-owners.',
      employmentPrefix: 'CO-OWNER', showCivilStatus: true, showHomeOwnership: false, showMailingAddress: true,
    });

    if (coOwnerInfo.civil_status === 'Married') {
      y = renderPersonBlock('CO-OWNER SPOUSE INFORMATION', {
        last_name:          coOwnerSpouseInfo?.last_name,
        first_name:         coOwnerSpouseInfo?.first_name,
        middle_name:        coOwnerSpouseInfo?.middle_name,
        suffix:             coOwnerSpouseInfo?.suffix,
        gender:             coOwnerSpouseInfo?.gender,
        civil_status:       coOwnerSpouseInfo?.civil_status,
        citizenship:        coOwnerSpouseInfo?.citizenship,
        date_of_birth:      coOwnerSpouseInfo?.date_of_birth,
        mobile_code:        coOwnerSpouseInfo?.mobile_code,
        mobile:             coOwnerSpouseInfo?.mobile,
        landline:           coOwnerSpouseInfo?.landline,
        email:              coOwnerSpouseInfo?.email,
        tin:                coOwnerSpouseInfo?.tin,
        no_tin:             coOwnerSpouseInfo?.no_tin ?? false,
        employer:           coOwnerSpouseInfo?.employer,
        nature_of_business: coOwnerSpouseInfo?.nature_of_business,
        employment_sector:  coOwnerSpouseInfo?.employment_sector,
        employment_status:  coOwnerSpouseInfo?.employment_status,
        job_title:          coOwnerSpouseInfo?.job_title,
        rank:               coOwnerSpouseInfo?.rank,
        salary_range:       coOwnerSpouseInfo?.salary_range,
        work_mobile_code:   coOwnerSpouseInfo?.work_mobile_code,
        work_mobile:        coOwnerSpouseInfo?.work_mobile,
        work_landline:      coOwnerSpouseInfo?.work_landline,
        work_email:         coOwnerSpouseInfo?.work_email,
      }, y, {
        employmentPrefix: 'CO-OWNER SPOUSE', showCivilStatus: false, showHomeOwnership: false,
        showAddress: false, showWorkAddress: false,
      });
    }
  }

  if (progress?.has_atty_in_fact && attyInfo) {
    y = checkBreak(7 + 7 + (CELL + 4) * 2 + 7 + (CELL + 4) + 8, y);
    y = drawSecBar('ATTORNEY-IN-FACT INFORMATION:', y) + 2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(80, 80, 85);
    doc.text('Full Name (As found in your valid government issued ID)', L, y + 4);
    y += 7;
    drawCell('Last name',   attyInfo.last_name   ?? '—', L,          y, C3);
    drawCell('First Name',  attyInfo.first_name  ?? '—', L + C3,     y, C3);
    drawCell('Middle Name', attyInfo.middle_name ?? '—', L + C3 * 2, y, C3); y += CELL + 7;
    y = subLabel('Contact Information', y);
    const attyMobile = attyInfo.mobile_code && attyInfo.mobile
      ? `${attyInfo.mobile_code} ${attyInfo.mobile}` : (attyInfo.mobile ?? '—');
    drawCell('Mobile Number',   attyMobile,              L,          y, C3);
    drawCell('Landline Number', attyInfo.landline ?? '—', L + C3,     y, C3);
    drawCell('Email Address',   attyInfo.email   ?? '—', L + C3 * 2, y, C3); y += CELL + 8;
  }

  // ── Data Privacy ──────────────────────────────────────────────────────────
  addPage();
  y = 36;
  doc.addImage(secImg, 'PNG', L, y, W, 7);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(140, 30, 30);
  doc.text('DATA PRIVACY POLICY', pageW / 2, y + 5, { align: 'center' });
  y += 10;

  const COL_GAP   = 3;
  const colW2     = (W - COL_GAP) / 2;
  const colXs     = [L, L + colW2 + COL_GAP] as [number, number];
  const colStartY = y;
  const colMaxY   = pageH - 20;
  const PL_H      = 3.8;
  const PL_GAP    = 2.5;
  const ITEM_IN   = 5;
  const BULL_X    = 8;
  const BULL_TX   = 11;

  const justifyPL = (text: string, x: number, ly: number, maxW: number, isLast: boolean) => {
    if (isLast) { doc.text(text, x, ly); return; }
    const words = text.split(' ');
    if (words.length <= 1) { doc.text(text, x, ly); return; }
    const tw = words.reduce((s: number, w: string) => s + doc.getTextWidth(w), 0);
    if (tw < maxW * 0.75) { doc.text(text, x, ly); return; }
    const gap = (maxW - tw) / (words.length - 1);
    let wx = x;
    words.forEach((w: string) => { doc.text(w, wx, ly); wx += doc.getTextWidth(w) + gap; });
  };

  const renderPB = (block: PrivBlock, cx: number, by: number): number => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(60, 60, 65);
    if (block.type === 'para') {
      const ls: string[] = doc.splitTextToSize(block.text, colW2);
      ls.forEach((l: string, i: number) => justifyPL(l, cx, by + i * PL_H, colW2, i === ls.length - 1));
      return ls.length * PL_H;
    }
    if (block.type === 'item') {
      const tw = colW2 - ITEM_IN;
      const ls: string[] = doc.splitTextToSize(block.text, tw);
      doc.text(block.label, cx, by);
      ls.forEach((l: string, i: number) => justifyPL(l, cx + ITEM_IN, by + i * PL_H, tw, i === ls.length - 1));
      return ls.length * PL_H;
    }
    const tw = colW2 - BULL_TX;
    const ls: string[] = doc.splitTextToSize(block.text, tw);
    doc.text('•', cx + BULL_X, by);
    ls.forEach((l: string, i: number) => justifyPL(l, cx + BULL_TX, by + i * PL_H, tw, i === ls.length - 1));
    return ls.length * PL_H;
  };

  const calcPBH = (block: PrivBlock): number => {
    doc.setFontSize(7);
    if (block.type === 'para')  return (doc.splitTextToSize(block.text, colW2) as string[]).length * PL_H;
    if (block.type === 'item')  return (doc.splitTextToSize(block.text, colW2 - ITEM_IN) as string[]).length * PL_H;
    return (doc.splitTextToSize(block.text, colW2 - BULL_TX) as string[]).length * PL_H;
  };

  let pCol = 0, pY = colStartY;
  for (const block of PRIVACY_BLOCKS) {
    const bh = calcPBH(block);
    if (pY + bh > colMaxY) {
      if (pCol === 0) { pCol = 1; pY = colStartY; }
      else { addPage(); pCol = 0; pY = 36; }
    }
    pY += renderPB(block, colXs[pCol], pY) + PL_GAP;
  }

  const cx2 = colXs[pCol];
  pY += 4;
  doc.setFontSize(7);
  const CONSENT_PRE  = 'Your signature below signifies your ';
  const CONSENT_BOLD = 'explicit';
  const CONSENT_POST = ' consent to the Processing of your Personal Data by the Company as described in this Policy.';
  const consentFull  = CONSENT_PRE + CONSENT_BOLD + CONSENT_POST;
  const consentWrap: string[] = doc.splitTextToSize(consentFull, colW2);
  consentWrap.forEach((line: string, li: number) => {
    const boldIdx = line.indexOf(CONSENT_BOLD);
    const lineY   = pY + li * 4.2;
    if (boldIdx === -1) {
      doc.setFont('helvetica', 'italic'); doc.setTextColor(50, 50, 55);
      doc.text(line, cx2, lineY);
    } else {
      const before = line.slice(0, boldIdx);
      const after  = line.slice(boldIdx + CONSENT_BOLD.length);
      let lx = cx2;
      if (before) { doc.setFont('helvetica', 'italic'); doc.setTextColor(50, 50, 55); doc.text(before, lx, lineY); lx += doc.getTextWidth(before); }
      doc.setFont('helvetica', 'bolditalic'); doc.setTextColor(50, 50, 55); doc.text(CONSENT_BOLD, lx, lineY); lx += doc.getTextWidth(CONSENT_BOLD);
      if (after)  { doc.setFont('helvetica', 'italic'); doc.text(after, lx, lineY); }
    }
  });
  pY += consentWrap.length * 4.2 + 6;

  const sigW2    = colW2;
  const sigImgH2 = 18;
  const today2   = new Date().toLocaleDateString('en-PH', { month: '2-digit', day: '2-digit', year: 'numeric' });
  const clientSigB64 = clientRow?.signature_base64 ?? null;
  if (clientSigB64) { const c = await compressImage(clientSigB64, 600, 100, 0.92); doc.addImage(c, 'JPEG', cx2, pY - sigImgH2, sigW2, sigImgH2); }
  const bifClientName = [clientRow?.first_name, clientRow?.middle_name, clientRow?.last_name, clientRow?.suffix].filter(Boolean).join(' ');

  // name above the line, below the signature image
  if (bifClientName) { doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(28, 28, 30); doc.text(bifClientName, cx2, pY + 3); }
  doc.setDrawColor(100, 100, 100); doc.setLineWidth(0.4);
  doc.line(cx2, pY + 6, cx2 + sigW2, pY + 6);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(28, 28, 30);
  doc.text(today2, cx2 + sigW2, pY + 5, { align: 'right' });
  doc.setFontSize(7); doc.setTextColor(110, 110, 115);
  doc.text('Buyer Signature over Printed Name', cx2, pY + 10);

  footerBlock(doc);
  const blobUrl2    = doc.output('bloburl') as unknown as string;
  const bifFilename = `BIF-${displayClientId ?? 'unknown'}_${reservationId ?? ''}.pdf`;
  if (!openInNewTab) return blobUrl2;
  if (win && typeof (win as any).close === 'function') {
    (win as Window).close();
    const a = document.createElement('a'); a.href = blobUrl2; a.download = bifFilename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  } else if (win) { win.location.href = blobUrl2; }
  else doc.output('dataurlnewwindow');
}

// ── Sample Computation ────────────────────────────────────────────────────────

export async function generateSampleComputation(clientId?: string | null, inventoryCode?: string | null): Promise<void> {
  const win  = window.open('', '_blank');
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  await headerBlock(doc, 'Sample Computation');

  let y = 38;
  sectionLabel(doc, 'Property', y); y += 8;
  fieldRow(doc, 'Project', 'One Marigold', 14, y);
  fieldRow(doc, 'Unit', 'T1-12-01 — 1BR, 32.00 sqm', 14 + 90, y); y += 20;

  sectionLabel(doc, 'Pricing Breakdown', y); y += 8;

  const pricingRows = [
    ['List Price',            '₱3,200,000.00'],
    ['Promo Discount',        '(₱160,000.00)'],
    ['Pay Term Discount',     '(₱64,000.00)'],
    ['Net List Price',        '₱2,976,000.00'],
    ['VAT (12%)',             '₱357,120.00'],
    ['Other Charges',         '₱166,880.00'],
    ['Total Contract Price',  '₱3,500,000.00'],
  ];
  pricingRows.forEach((row, i) => {
    const isBold = row[0] === 'Total Contract Price';
    if (i % 2 === 0) { doc.setFillColor(248, 248, 250); doc.rect(14, y - 4, pageW - 28, 7, 'F'); }
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(isBold ? 28 : 60, isBold ? 28 : 60, isBold ? 30 : 65);
    doc.text(row[0], 16, y);
    doc.text(row[1], pageW - 16, y, { align: 'right' });
    y += 7;
  });

  y += 8;
  sectionLabel(doc, 'Payment Scheme', y); y += 8;
  fieldRow(doc, 'Scheme', 'Bank Financing', 14, y);
  fieldRow(doc, 'Payment Term', '20% DP / 80% BF', 14 + 90, y); y += 16;
  fieldRow(doc, 'Reservation Fee', '₱20,000.00', 14, y);
  fieldRow(doc, 'Down Payment', '₱700,000.00', 14 + 90, y); y += 16;
  fieldRow(doc, 'Monthly DP (24 mos)', '₱29,167.00', 14, y);
  fieldRow(doc, 'Bank Monthly (20 yrs)', '₱18,500.00', 14 + 90, y);

  footerBlock(doc);
  if (typeof (win as any)?.close === 'function') {
    win!.close();
    const blob = doc.output('blob');
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `SC-${clientId ?? 'unknown'}_${inventoryCode ?? 'unknown'}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } else if (win) {
    (win as any).location.href = doc.output('bloburl');
  }
}

// ── Quotation / Comparison PDF ────────────────────────────────────────────────

export interface ComparisonCard {
  id?: string;
  project: string; tower: string; floor: string; unitNo: string;
  inventoryCode: string | null;
  unitType: string; unitArea: number; unitCategory: string;
  paymentScheme: string; schemeName: string;
  dpRate: string; paymentTerm: string; termMonths: number;
  listPrice: number; promoAmount: number; promoPct: number;
  employeeAmount: number;
  paytermAmount: number; paytermPctDisplay?: number;
  hicDiscount: number;
  netListPrice: number; vat: number; otherCharges: number;
  totalContractPrice: number; netAmount: number;
  monthlyDeferred: number; dpAmount: number; netSpotDP: number;
  balanceForFinancing: number; monthlyStretchedDP: number;
  bankMonthly: number; hdmfMonthly: number;
  reservationFee: number;
}

export interface QuotationClientInfo {
  firstName: string; middleName: string; lastName: string;
  suffix: string; mobile: string; countryCode: string; email: string;
}

/**
 * Generates the quotation/comparison PDF used in sample-computation emails.
 * When returnBase64 is true, returns the base64 string instead of triggering download.
 */
export async function generateQuotationPDF(
  cards: ComparisonCard[],
  clientInfo: QuotationClientInfo,
  options?: { returnBase64?: boolean; clientId?: string | null },
): Promise<string | undefined> {
  const RETENTION_FEE = 50_000;
  const pad2 = (s: string) => /^\d+$/.test(s ?? '') ? String(parseInt(s) || 0).padStart(2, '0') : (s ?? '');

  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW  = 210;
  const pageH  = 297;
  const mg     = 15;
  const HDR          = 32;
  const STRIP        = 13;
  const CLIENT_STRIP = 13;
  const BODY_T       = HDR + STRIP + CLIENT_STRIP + 7;
  const DISC_Y  = pageH - 28;
  const coral: [number,number,number] = [238, 67, 78];
  const dark:  [number,number,number] = [28, 28, 30];
  const lt:    [number,number,number] = [142, 142, 147];
  const grn:   [number,number,number] = [22, 101, 52];

  const now     = new Date();
  const dateStr = now.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });

  // Read seller from session
  let sellerName = '';
  let sellerContact = '';
  let sellerMobile = '';
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('osa_session') : null;
    if (raw) {
      const s = JSON.parse(raw);
      sellerName    = s.full_name ?? '';
      sellerContact = s.email     ?? '';
    }
  } catch {}
  if (sellerContact) {
    try {
      const { data } = await supabase
        .from('Salesperson')
        .select('"Mobile Number"')
        .eq('Email Address', sellerContact)
        .maybeSingle();
      sellerMobile = (data as any)?.['Mobile Number'] ?? '';
    } catch {}
  }

  const { b64: logoB64, w: logoW, h: logoH } = await loadLogo();

  const drawHeader = () => {
    doc.setFillColor(...coral);
    doc.rect(0, 0, pageW, HDR, 'F');
    if (logoB64) doc.addImage(logoB64, 'PNG', mg, (HDR - logoH) / 2, logoW, logoH);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('SAMPLE COMPUTATION', pageW - mg, 15, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`${dateStr}  ·  ${timeStr}`, pageW - mg, 24, { align: 'right' });

    const clientFullName = [clientInfo.firstName, clientInfo.middleName, clientInfo.lastName].filter(Boolean).join(' ') +
      (clientInfo.suffix ? `, ${clientInfo.suffix}` : '');
    const clientMobileStr = clientInfo.mobile ? `${clientInfo.countryCode} ${clientInfo.mobile}` : '';
    const colMobile = mg + 100;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...lt);
    doc.text('CLIENT', mg, HDR + 5);
    if (clientMobileStr) doc.text('MOBILE NO.', colMobile, HDR + 5);
    if (clientInfo.email) doc.text('EMAIL ADDRESS', pageW - mg, HDR + 5, { align: 'right' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...dark);
    doc.text(clientFullName || '—', mg, HDR + 10.5);
    if (clientMobileStr) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...dark);
      doc.text(clientMobileStr, colMobile, HDR + 10.5);
    }
    if (clientInfo.email) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...dark);
      doc.text(clientInfo.email, pageW - mg, HDR + 10.5, { align: 'right' });
    }

    const colSellerMobile = mg + 100;
    const ss = HDR + STRIP;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...lt);
    doc.text('SELLER',        mg,              ss + 5);
    doc.text('MOBILE NO.',    colSellerMobile, ss + 5);
    if (sellerContact) doc.text('EMAIL ADDRESS', pageW - mg, ss + 5, { align: 'right' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...dark);
    doc.text(sellerName || '—', mg, ss + 10.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...dark);
    doc.text(sellerMobile || '—', colSellerMobile, ss + 10.5);
    if (sellerContact) {
      doc.text(sellerContact, pageW - mg, ss + 10.5, { align: 'right' });
    }

    const lineY = HDR + STRIP + CLIENT_STRIP + 1;
    doc.setDrawColor(210, 210, 220); doc.setLineWidth(0.4);
    doc.line(mg, lineY, pageW - mg, lineY);
  };

  const drawFooter = () => {
    const boxW = pageW - mg * 2;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...coral);
    doc.text('DISCLAIMER', mg, DISC_Y);
    const discText =
      'This is a computer-generated document. Prices, discounts, terms, and availability are ' +
      'subject to change without prior notice. This computation is for reference purposes only ' +
      'and does not constitute a binding offer or contract.';
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...lt);
    const lines = doc.splitTextToSize(discText, boxW);
    doc.text(lines, mg, DISC_Y + 4.5);
    doc.setDrawColor(...coral); doc.setLineWidth(0.4);
    doc.line(mg, DISC_Y + 16, pageW - mg, DISC_Y + 16);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...lt);
    doc.text(`Generated: ${dateStr}  at  ${timeStr}`, mg, DISC_Y + 21);
  };

  let y = BODY_T;
  const RH = 6;

  const secLabel = (t: string) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...lt);
    doc.text(t.toUpperCase(), mg, y); y += 5.5;
  };
  const row = (label: string, value: string, bold = false, color: [number,number,number] = dark) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(9.5); doc.setTextColor(...color);
    doc.text(label, mg, y);
    doc.text(value, pageW - mg, y, { align: 'right' });
    y += RH;
  };
  const hr = () => {
    doc.setDrawColor(229, 229, 234); doc.setLineWidth(0.25);
    doc.line(mg, y + 1, pageW - mg, y + 1); y += 6;
  };
  const subHr = () => {
    doc.setDrawColor(229, 229, 234); doc.setLineWidth(0.25);
    doc.line(mg, y - 2, pageW - mg, y - 2); y += 4;
  };

  const p = (n: number) => 'PHP ' + n.toLocaleString();

  cards.forEach((c, idx) => {
    if (idx > 0) { doc.addPage(); }
    drawHeader();
    drawFooter();
    y = BODY_T;

    secLabel(`Computation ${idx + 1}`);

    const r1c1 = mg, r1c2 = mg + 60, r1c3 = mg + 105, r1c4 = mg + 145;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...lt);
    doc.text('Project',  r1c1, y); doc.text('Tower',    r1c2, y);
    doc.text('Floor',    r1c3, y); doc.text('Unit No.', r1c4, y);
    y += 3.5;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...dark);
    doc.text(c.project, r1c1, y); doc.text(c.tower, r1c2, y);
    doc.text(pad2(c.floor), r1c3, y); doc.text(pad2(c.unitNo), r1c4, y);
    y += RH;

    const r2c1 = mg, r2c2 = mg + 60, r2c3 = mg + 115;
    let termDetail = '';
    if (c.paymentScheme === 'deferred_cash')  termDetail = `${c.termMonths} months`;
    else if (c.paymentScheme === 'spot_dp')   termDetail = `DP ${c.dpRate}%`;
    else if (c.paymentScheme === 'stretched_dp') termDetail = `DP ${c.dpRate}%  ·  ${c.termMonths} months`;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...lt);
    doc.text('Unit Type',      r2c1, y);
    doc.text('Area',           r2c2, y);
    doc.text('Payment Scheme', r2c3, y);
    y += 3.5;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...dark);
    doc.text(c.unitType || '—',      r2c1, y);
    doc.text(`${c.unitArea} sqm`,    r2c2, y);
    doc.setTextColor(...coral);
    doc.text(c.schemeName,           r2c3, y);
    if (termDetail) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...lt);
      doc.text(termDetail, r2c3, y + 4);
    }
    y += RH + (termDetail ? 3 : 0);
    hr();

    secLabel('Price Computation');
    row('List Price', p(c.listPrice));
    if (c.promoAmount > 0)    row(`Less: Promo Discount (${Math.round(c.promoPct)}%)`, p(c.promoAmount), false, grn);
    if (c.employeeAmount > 0) row('Less: Employee Discount (10%)', p(c.employeeAmount), false, grn);
    if (c.paytermAmount > 0)  row(`Less: Payterm Discount (${Number(c.paytermPctDisplay ?? 0).toFixed(1)}%)`, p(c.paytermAmount), false, grn);
    if (c.hicDiscount > 0) {
      const hicBase = c.listPrice - c.promoAmount - c.employeeAmount - c.paytermAmount;
      row(`Less: Special Discount (${Math.round(c.hicDiscount / hicBase * 100)}%)`, p(c.hicDiscount), false, [94, 92, 230]);
    }
    subHr();
    row('Net List Price', p(c.netListPrice), true);
    hr();

    secLabel('Taxes & Charges');
    row(c.vat === 0 ? 'VAT (Exempt)' : 'VAT (12%)', p(c.vat));
    row('Other Charges (7%)', p(c.otherCharges));
    if (c.hicDiscount > 0) {
      const hicBase = c.listPrice - c.promoAmount - c.employeeAmount - c.paytermAmount;
      row(`Home Improvement Contract (${Math.round(c.hicDiscount / hicBase * 100)}%)`, p(c.hicDiscount), false, [94, 92, 230]);
    }
    subHr();
    row('Total Contract Price', p(c.totalContractPrice), true, coral);
    hr();

    secLabel('Fees');
    row('Reservation Fee', p(c.reservationFee));
    if (!['spot_dp', 'stretched_dp'].includes(c.paymentScheme))
      row('Retention Fee', p(RETENTION_FEE));
    hr();

    secLabel('Payment Summary');
    if (c.paymentScheme === 'spot_cash' || c.paymentScheme === 'deferred_cash') {
      row(`Net ${c.schemeName}`, p(c.netAmount));
      if (c.paymentScheme === 'deferred_cash')
        row(`Monthly Deferred (${c.termMonths} mo)`, p(c.monthlyDeferred) + '/mo', true, coral);
    } else if (c.paymentScheme === 'spot_dp') {
      row(`DP (${c.dpRate}%)`, p(c.dpAmount));
      row(`Net ${c.schemeName}`, p(c.netSpotDP));
      row('Balance for Financing', p(c.balanceForFinancing));
      hr();
      secLabel('Indicative Financing');
      row('Bank (6.5% p.a., 20 yrs)', p(c.bankMonthly) + '/mo');
      row('HDMF (6.25% p.a., 25 yrs)', p(c.hdmfMonthly) + '/mo');
    } else if (c.paymentScheme === 'stretched_dp') {
      row(`DP (${c.dpRate}%)`, p(c.dpAmount));
      row(`Net ${c.schemeName}`, p(c.netSpotDP));
      row(`Monthly DP (${c.termMonths} mo)`, p(c.monthlyStretchedDP) + '/mo', true, coral);
      row('Balance for Financing', p(c.balanceForFinancing));
      hr();
      secLabel('Indicative Financing');
      row('Bank (6.5% p.a., 20 yrs)', p(c.bankMonthly) + '/mo');
      row('HDMF (6.25% p.a., 25 yrs)', p(c.hdmfMonthly) + '/mo');
    }
  });

  if (options?.returnBase64) {
    return doc.output('datauristring').split(',')[1];
  }

  const cid  = options?.clientId ?? 'unknown';
  const code = cards[0]?.inventoryCode ?? 'unknown';
  doc.save(`SC-${cid}_${code}.pdf`);
}

// ── SOA ───────────────────────────────────────────────────────────────────────

export async function generateSOA(reservationId: string | null): Promise<void> {
  if (!reservationId) return;
  const win = window.open('', '_blank');

  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();   // 210mm portrait
  const pageH = doc.internal.pageSize.getHeight();  // 297mm portrait
  const L = 12, R = pageW - 12, W = R - L;
  let pageNum = 1;

  // ── Data fetch ────────────────────────────────────────────────────────────
  const [resResult, linesRaw, penaltyResult, settingsResult] = await Promise.all([
    supabase
      .from('reservations')
      .select(`reservation_id, client_id, client_name, project, tower, inventory_code,
               scheme_name, term_months, payment_scheme,
               net_list_price, vat, other_charges, total_contract_price,
               hic_discount, employee_discount_amount`)
      .eq('reservation_id', reservationId)
      .single(),
    fetchReceivableLines(reservationId),
    supabase
      .from('penalty_lines')
      .select('*')
      .eq('reservation_id', reservationId)
      .order('original_due_date'),
    supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['penalty_daily_rate']),
  ]);
  const res       = resResult.data as any;
  const penalties = (penaltyResult.data ?? []) as any[];
  const settings  = Object.fromEntries(((settingsResult.data ?? []) as any[]).map((r: any) => [r.key, r.value]));
  const dailyRate = parseFloat(settings['penalty_daily_rate']) || 0.001;
  const isHIC              = (res?.hic_discount              ?? 0) > 0;
  const isEmployeeDiscount = (res?.employee_discount_amount  ?? 0) > 0;

  let mailingAddress = '';
  if (res?.client_id) {
    const { data: clientRow } = await supabase
      .from('clients')
      .select('id')
      .eq('client_id', res.client_id)
      .maybeSingle();
    if (clientRow?.id) {
      const bi = await fetchBuyerInfo(clientRow.id).catch(() => null);
      if (bi) {
        mailingAddress = [
          bi.home_street,
          bi.home_barangay,
          bi.home_city_municipality,
          bi.home_region_province,
        ].filter(Boolean).join(', ');
      }
    }
  }

  const lines: ReceivableLine[] = linesRaw;
  const isPenalty = (l: ReceivableLine) =>
    l.type_of_payment.toLowerCase().includes('penalty');

  // Active non-penalty lines only (excludes Superseded + Cancelled)
  const schedLines = lines.filter(l =>
    !isPenalty(l) &&
    (l.payment_status as string) !== 'Superseded' &&
    (l.payment_status as string) !== 'Cancelled'
  );

  // Build AR map: lineId → [{pmt_date, ar_no, ar_date}] sorted oldest-first
  // Pmt Date = transaction_date ?? posting_date, AR Date = posting_date
  type ArEntry = { pmt_date: string | null; ar_no: string | null; ar_date: string | null };
  const arMap: Record<string, ArEntry[]> = {};
  if (schedLines.length > 0) {
    const lineIds = schedLines.map(l => l.id);
    const { data: apps } = await supabase
      .from('collection_applications')
      .select('receivable_line_id, collection_id')
      .in('receivable_line_id', lineIds);
    if (apps && (apps as any[]).length > 0) {
      const colIds = [...new Set((apps as any[]).map((a: any) => a.collection_id as string))];
      const { data: cols } = await supabase
        .from('collections')
        .select('id, acknowledgement_receipt_no, posting_date, transaction_date')
        .in('id', colIds);
      const colById: Record<string, any> = {};
      for (const c of (cols ?? []) as any[]) colById[c.id] = c;
      for (const app of apps as any[]) {
        const col = colById[app.collection_id];
        if (!col) continue;
        if (!arMap[app.receivable_line_id]) arMap[app.receivable_line_id] = [];
        arMap[app.receivable_line_id].push({
          pmt_date: col.transaction_date ?? col.posting_date ?? null,
          ar_no:    col.acknowledgement_receipt_no ?? null,
          ar_date:  col.posting_date ?? null,
        });
      }
      for (const id of Object.keys(arMap)) {
        arMap[id].sort((a, b) => (a.ar_date ?? '').localeCompare(b.ar_date ?? ''));
      }
    }
  }


  const today    = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Next calendar month
  const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const nextMonthYear = nextMonthDate.getFullYear();
  const nextMonthNum  = nextMonthDate.getMonth() + 1;

  // Billing detail calculations — past due + next calendar month only
  const billedLines = schedLines.filter(l => {
    if (l.due_date <= todayStr) return true;
    const [y, m] = l.due_date.split('-').map(Number);
    return y === nextMonthYear && m === nextMonthNum;
  });
  const totalBilled = billedLines.reduce((s, l) => s + l.total_amount_due, 0);
  const schedTotal  = schedLines.reduce((s, l) => s + l.total_amount_due, 0);
  const totalPaid   = schedLines.reduce((s, l) => s + (l.amount_paid ?? 0), 0);
  const amountDue   = Math.max(0, totalBilled - totalPaid);
  const creditBal   = Math.max(0, totalPaid - totalBilled);

  // Penalty totals from penalty_lines — outstanding only for billing summary
  const totalPenalty = penalties
    .filter((p: any) => ['Unpaid', 'Partial'].includes(p.payment_status))
    .reduce((s: number, p: any) => s + (p.penalty_amount ?? 0), 0);
  const totalAmtDue  = amountDue + totalPenalty;

  // Next unpaid due date
  const nextUnpaid  = schedLines.find((l) => l.payment_status !== 'Paid');
  const nextDueDate = nextUnpaid?.due_date ?? '';

  // ── Helpers ───────────────────────────────────────────────────────────────
  const fmtN = (n: number | null | undefined, prefix = '') =>
    n != null ? prefix + n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '-';
  const fmtD = (d: string | null | undefined) =>
    d ? new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

  const hdrImg  = makeColorDataURL(238, 67, 78);
  const darkImg = makeColorDataURL(55, 55, 60);
  const logo    = await loadLogo();
  const HDR     = 22;

  const drawPageHeader = () => {
    doc.addImage(hdrImg, 'PNG', 0, 0, pageW, HDR);
    if (logo.b64) doc.addImage(logo.b64, 'PNG', L, (HDR - logo.h) / 2, logo.w, logo.h);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text('STATEMENT OF ACCOUNT', R, 9, { align: 'right' });
    if (reservationId) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(255, 220, 210);
      doc.text(reservationId, R, 17, { align: 'right' });
    }
    doc.setTextColor(30, 30, 30);
  };
  drawPageHeader();

  const addPage = () => {
    pageNum++;
    doc.addPage();
    drawPageHeader();
  };
  const checkBreak = (needed: number, y: number): number => {
    if (y + needed > pageH - 10) { addPage(); return HDR + 4; }
    return y;
  };

  // ── Two-column top section ────────────────────────────────────────────────
  let y = HDR + 5;
  const COL1W = W * 0.48, COL2W = W * 0.48;
  const COL2X = R - COL2W;

  // Left: client info
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(28, 28, 30);
  doc.text(res?.client_name ?? '—', L, y);
  y += 6;
  if (mailingAddress) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(80, 80, 85);
    const addrLines = doc.splitTextToSize(mailingAddress, COL1W);
    addrLines.forEach((line: string) => { doc.text(line, L, y); y += 4; });
  }
  y += 3;

  const infoRows: [string, string][] = [
    ['Client Code', res?.client_id ?? '—'],
    ['Reservation ID', res?.reservation_id ?? '—'],
    ['Project', res?.project ?? '—'],
    ['Tower', res?.tower ?? '—'],
    ['Inventory Code', res?.inventory_code ?? '—'],
  ];
  infoRows.forEach(([lbl, val]) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 115);
    doc.text(lbl, L, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(28, 28, 30);
    doc.text(val, L + 32, y);
    y += 6;
  });

  // Right: Billing Details
  let ry = HDR + 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(140, 30, 30);
  doc.text('BILLING DETAILS', COL2X, ry);
  ry += 5;

  const billingRows: [string, string, boolean][] = [
    ['Statement Date',       fmtD(todayStr),           false],
    ['Total Billed Amount',  fmtN(totalBilled, 'PHP '), false],
    ['Total Payments Made',  fmtN(totalPaid, 'PHP '),   false],
    ['Amount Due',           fmtN(amountDue, 'PHP '),   true ],
    ['Penalties',            fmtN(totalPenalty, 'PHP '), false],
    ['Total Amount Due',     fmtN(totalAmtDue, 'PHP '), true ],
    ['Due Date',             fmtD(nextDueDate),          true ],
    ['Credit Balance',       fmtN(creditBal, 'PHP '),   true ],
  ];
  billingRows.forEach(([lbl, val, bold]) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 115);
    doc.text(lbl, COL2X, ry);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(8);
    doc.setTextColor(bold ? 28 : 50, bold ? 28 : 50, bold ? 30 : 55);
    doc.text(val, R, ry, { align: 'right' });
    ry += 6.5;
  });

  y = Math.max(y, ry) + 5;

  // ── Contract Details ──────────────────────────────────────────────────────
  doc.addImage(darkImg, 'PNG', L, y, W, 7);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('CONTRACT DETAILS', L + 3, y + 5);
  y += 9;

  // Two-column horizontal key-value layout
  const isNoTerm = res?.payment_scheme === 'spot_cash' || res?.payment_scheme === 'spot_dp';
  const cdLeft: [string, string, boolean][] = [
    ['Net List Price (incl. VAT)', fmtN((res?.net_list_price ?? 0) + (res?.vat ?? 0), 'PHP '), false],
    ['Other Charges',              fmtN(res?.other_charges, 'PHP '),                            false],
    ...(isHIC              ? [['Home Improvement Contract', fmtN(res?.hic_discount,             'PHP '), false] as [string, string, boolean]] : []),
    ...(isEmployeeDiscount ? [['Employee Discount',         fmtN(res?.employee_discount_amount, 'PHP '), false] as [string, string, boolean]] : []),
    ['Total Contract Price',       fmtN(res?.total_contract_price, 'PHP '),                     true ],
  ];
  const cdRight: [string, string, boolean][] = [
    ['Remaining Balance', fmtN(Math.max(0, (res?.total_contract_price ?? 0) - totalPaid), 'PHP '), false],
    ['Payterm Scheme',    res?.scheme_name ?? '—',                                                  false],
    ...(!isNoTerm ? [['Term', res?.term_months != null ? `${res.term_months} months` : '—', false] as [string, string, boolean]] : []),
  ];

  const CD_ROW_H  = 7;
  const CD_COL_GAP = 8;
  const CD_COL_W   = (W - CD_COL_GAP) / 2;
  const CD_MID     = L + CD_COL_W;

  const drawCdCol = (rows: [string, string, boolean][], lx: number, rx: number) => {
    rows.forEach((row, i) => {
      const ry2 = y + i * CD_ROW_H;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(110, 110, 115);
      doc.text(row[0], lx, ry2 + 4.5);
      doc.setFont('helvetica', row[2] ? 'bold' : 'normal');
      doc.setFontSize(8);
      doc.setTextColor(28, 28, 30);
      doc.text(row[1], rx, ry2 + 4.5, { align: 'right' });
    });
  };

  drawCdCol(cdLeft,  L,            CD_MID);
  drawCdCol(cdRight, CD_MID + CD_COL_GAP, R);

  y += Math.max(cdLeft.length, cdRight.length) * CD_ROW_H + 4;

  // ── Schedule of Payment table ──────────────────────────────────────────────
  y = checkBreak(20, y);
  doc.addImage(darkImg, 'PNG', L, y, W, 7);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('SCHEDULE OF PAYMENT', L + 3, y + 5);
  y += 7;

  // Columns: static section | stacked section (Pmt Date, AR No., AR Date)
  // Status is in static so the 3 stacked cols are contiguous at the right edge
  const schedCols = isHIC
    ? ['Description', 'Due Date', 'Principal', 'VAT', 'Oth.Chg', 'HIC', 'Total', 'Collection', 'Status', 'Pmt Date', 'AR No.', 'AR Date']
    : ['Description', 'Due Date', 'Principal', 'VAT', 'Oth.Chg', 'Total', 'Collection', 'Status', 'Pmt Date', 'AR No.', 'AR Date'];
  // Portrait A4: W = 186mm
  const schedColW = isHIC
    ? [24, 19, 13, 10, 11, 11, 16, 16, 11, 17, 17, 21] // sum = 186
    : [24, 20, 15, 11, 13, 18, 18, 12, 17, 18, 20];    // sum = 186

  const tblHdrH  = 7;
  const AR_LINE_H = 4.5;
  const AR_PAD_T  = 1.5;
  const staticColCount = isHIC ? 9 : 8; // cols before the 3 stacked AR cols

  doc.addImage(makeColorDataURL(90, 90, 95), 'PNG', L, y, W, tblHdrH);
  let cx2 = L;
  schedCols.forEach((col, i) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(255, 255, 255);
    const truncatedHdr = doc.splitTextToSize(col, schedColW[i] - 1)[0] ?? '';
    doc.text(truncatedHdr, cx2 + 1, y + 5);
    cx2 += schedColW[i];
  });
  y += tblHdrH;

  schedLines.forEach((ln, idx) => {
    const arEntries: ArEntry[] = arMap[ln.id]?.length > 0
      ? arMap[ln.id]
      : [{ pmt_date: ln.transaction_date ?? ln.posting_date ?? null, ar_no: ln.acknowledgement_receipt_no ?? null, ar_date: ln.posting_date ?? null }];

    const rowH = Math.max(7.5, AR_PAD_T + arEntries.length * AR_LINE_H + 1);
    y = checkBreak(rowH + 2, y);

    if (idx % 2 === 0) {
      doc.setFillColor(248, 248, 250);
      doc.rect(L, y, W, rowH, 'F');
    }

    // Static columns
    const staticCols = isHIC
      ? [
          ln.type_of_payment,
          fmtD(ln.due_date),
          fmtN(ln.principal),
          fmtN(ln.vat),
          fmtN(ln.other_charges),
          fmtN(ln.hic),
          fmtN(ln.total_amount_due),
          fmtN(ln.amount_paid),
          ln.payment_status,
        ]
      : [
          ln.type_of_payment,
          fmtD(ln.due_date),
          fmtN(ln.principal),
          fmtN(ln.vat),
          fmtN(ln.other_charges),
          fmtN(ln.total_amount_due),
          fmtN(ln.amount_paid),
          ln.payment_status,
        ];

    let tx = L;
    staticCols.forEach((val, i) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(
        val === 'Paid' ? 34 : val === 'Unpaid' ? 180 : val === 'Partial' ? 120 : 40,
        val === 'Paid' ? 120 : val === 'Unpaid' ? 30 : val === 'Partial' ? 80 : 40,
        val === 'Paid' ? 34 : val === 'Unpaid' ? 30 : val === 'Partial' ? 30 : 45,
      );
      const truncated = doc.splitTextToSize(String(val), schedColW[i] - 2)[0] ?? '';
      doc.text(truncated, tx + 1, y + 5);
      tx += schedColW[i];
    });

    // Stacked AR columns: Pmt Date | AR No. | AR Date
    const arStartX = tx;
    arEntries.forEach((entry, ei) => {
      const lineY = y + AR_PAD_T + ei * AR_LINE_H + 2.5;
      const arCols = [fmtD(entry.pmt_date), entry.ar_no ?? '-', fmtD(entry.ar_date)];
      let arX = arStartX;
      arCols.forEach((val, ai) => {
        const colIdx = staticColCount + ai;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor(40, 40, 45);
        const truncated = doc.splitTextToSize(String(val), schedColW[colIdx] - 2)[0] ?? '';
        doc.text(truncated, arX + 1, lineY);
        arX += schedColW[colIdx];
      });
    });

    y += rowH;
  });

  // Totals row
  y = checkBreak(8, y);
  doc.addImage(makeColorDataURL(70, 70, 75), 'PNG', L, y, W, 7);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(255, 255, 255);
  doc.text('TOTAL', L + 1, y + 4.5);
  const totColOffset = isHIC
    ? schedColW[0] + schedColW[1]
    : schedColW[0] + schedColW[1];
  const totVals = isHIC
    ? [
        fmtN(schedLines.reduce((s, l) => s + (l.principal ?? 0), 0)),
        fmtN(schedLines.reduce((s, l) => s + (l.vat ?? 0), 0)),
        fmtN(schedLines.reduce((s, l) => s + (l.other_charges ?? 0), 0)),
        fmtN(schedLines.reduce((s, l) => s + (l.hic ?? 0), 0)),
        fmtN(schedTotal),
        fmtN(totalPaid),
      ]
    : [
        fmtN(schedLines.reduce((s, l) => s + (l.principal ?? 0), 0)),
        fmtN(schedLines.reduce((s, l) => s + (l.vat ?? 0), 0)),
        fmtN(schedLines.reduce((s, l) => s + (l.other_charges ?? 0), 0)),
        fmtN(schedTotal),
        fmtN(totalPaid),
      ];
  let totX = L + totColOffset;
  totVals.forEach((val, i) => {
    doc.text(val, totX + 1, y + 4.5);
    totX += schedColW[isHIC ? i + 2 : i + 2];
  });
  y += 9;

  // ── Penalties table ───────────────────────────────────────────────────────
  // ── Penalties table (same layout as Delinquency 1st Notice) ─────────────
  y = checkBreak(20, y);
  doc.addImage(darkImg, 'PNG', L, y, W, 7);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('PENALTIES', L + 3, y + 5);
  y += 7;

  // Column definitions — widths sum to W (186mm for SOA margins L=12)
  // 22+14+12+22+22+20+17+17+20+20 = 186
  const penColDefs = [
    { label: 'Original Due Date', w: 22 },
    { label: 'Days Overdue',      w: 14 },
    { label: 'Daily Rate*',       w: 12 },
    { label: 'Principal Basis',   w: 22 },
    { label: 'Penalty Amount',    w: 22 },
    { label: 'Collection',        w: 20 },
    { label: 'Status',            w: 17 },
    { label: 'Remarks',           w: 17 },
    { label: 'AR No.',            w: 20 },
    { label: 'AR Date',           w: 20 },
  ];
  const penCols2 = penColDefs.reduce<{ label: string; x: number; w: number }[]>((acc, col) => {
    const x = acc.length === 0 ? L : acc[acc.length - 1].x + acc[acc.length - 1].w;
    return [...acc, { ...col, x }];
  }, []);

  // Sub-header with auto-wrapping
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  const splitPenHdrs = penCols2.map(col => doc.splitTextToSize(col.label, col.w - 1) as string[]);
  const maxPenHdrLines = Math.max(...splitPenHdrs.map(h => h.length));
  const PEN_HDR_LINE_H = 2.8;
  const PEN_HDR_PAD    = 1.8;
  const PEN_SUB_HDR_H  = maxPenHdrLines * PEN_HDR_LINE_H + PEN_HDR_PAD * 2;
  const subHdrImg      = makeColorDataURL(90, 90, 95);
  doc.addImage(subHdrImg, 'PNG', L, y, W, PEN_SUB_HDR_H);
  doc.setTextColor(255, 255, 255);
  for (let ci = 0; ci < penCols2.length; ci++) {
    const col   = penCols2[ci];
    const lines = splitPenHdrs[ci];
    const blockH = lines.length * PEN_HDR_LINE_H;
    const startY = y + PEN_HDR_PAD + (PEN_SUB_HDR_H - PEN_HDR_PAD * 2 - blockH) / 2 + PEN_HDR_LINE_H * 0.75;
    lines.forEach((line, li) => doc.text(line, col.x + col.w / 2, startY + li * PEN_HDR_LINE_H, { align: 'center' }));
  }
  y += PEN_SUB_HDR_H;

  // Data rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  const PEN_ROW_H = 6;
  if (penalties.length === 0) {
    doc.setTextColor(120, 120, 125);
    doc.setFontSize(8);
    doc.text('No penalty lines found for this reservation.', pageW / 2, y + 5, { align: 'center' });
    y += 10;
  } else {
    penalties.forEach((p: any, i: number) => {
      y = checkBreak(PEN_ROW_H + 2, y);
      if (i % 2 === 0) {
        const stripe = makeColorDataURL(245, 245, 247);
        doc.addImage(stripe, 'PNG', L, y, W, PEN_ROW_H);
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(28, 28, 30);
      doc.text(fmtD(p.original_due_date),                            penCols2[0].x + penCols2[0].w / 2, y + 4, { align: 'center' });
      doc.text(String(p.days_overdue ?? 0),                          penCols2[1].x + penCols2[1].w / 2, y + 4, { align: 'center' });
      doc.text((((p.daily_rate ?? dailyRate) * 100).toFixed(2)) + '%', penCols2[2].x + penCols2[2].w / 2, y + 4, { align: 'center' });
      doc.text(fmtN(p.balance_receivables ?? 0),                     penCols2[3].x + penCols2[3].w - 1,  y + 4, { align: 'right' });
      doc.text(fmtN(p.penalty_amount ?? 0),                          penCols2[4].x + penCols2[4].w - 1,  y + 4, { align: 'right' });
      doc.text(p.collection ? fmtN(p.collection) : '—',             penCols2[5].x + penCols2[5].w - 1,  y + 4, { align: 'right' });
      doc.text(p.payment_status ?? '—',                              penCols2[6].x + penCols2[6].w / 2, y + 4, { align: 'center' });
      doc.text(p.remarks ?? '—',                                     penCols2[7].x + penCols2[7].w / 2, y + 4, { align: 'center' });
      doc.text(p.ar_no ?? '—',                                       penCols2[8].x + penCols2[8].w / 2, y + 4, { align: 'center' });
      doc.text(fmtD(p.ar_date),                                      penCols2[9].x + penCols2[9].w / 2, y + 4, { align: 'center' });
      y += PEN_ROW_H;
    });
  }

  // Totals row
  const totalPenaltyAll = penalties.reduce((s: number, p: any) => s + (p.penalty_amount ?? 0), 0);
  const totalBarImg = makeColorDataURL(70, 70, 75);
  doc.addImage(totalBarImg, 'PNG', L, y, W, 7);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(255, 255, 255);
  doc.text('TOTAL PENALTIES', L + 1, y + 4.5);
  doc.text(fmtN(totalPenaltyAll), R - 2, y + 4.5, { align: 'right' });
  y += 7;

  y += 4;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 100, 105);
  doc.text(`Effective ${(dailyRate * 30 * 100).toFixed(2)}% per month`, L, y);
  y += 4;

  // ── Footer — drawn on every page after all content is rendered ───────────
  const now        = new Date();
  const stamp      = now.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    + '  ' + now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.line(L, pageH - 10, R, pageH - 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(160, 160, 165);
    doc.text(`Generated: ${stamp}`, L, pageH - 6);
    doc.text(`Page ${p} of ${totalPages}`, R, pageH - 6, { align: 'right' });
  }

  const soaFilename = `SOA-${res?.client_id ?? 'unknown'}_${reservationId}.pdf`;
  const blobUrl = doc.output('bloburl') as unknown as string;
  if (win && typeof (win as any).close === 'function') {
    // Real browser window — close blank tab and trigger named download
    (win as Window).close();
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = soaFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } else if (win) {
    // Mock window from buildPDFBase64 — set href for blob capture
    win.location.href = blobUrl;
  } else {
    doc.output('dataurlnewwindow');
  }
}

// ── Fetch helpers for page use ────────────────────────────────────────────────

export { fetchAllClients };
export type { ClientRecord };

export async function fetchReservationList(): Promise<ReservationSummary[]> {
  const { data } = await supabase
    .from('reservations')
    .select('reservation_id, client_name, project, inventory_code')
    .order('reservation_id', { ascending: false });
  return (data ?? []) as ReservationSummary[];
}

// ── PDF → base64 (browser-side, for email attachment) ────────────────────────

const PDF_FILENAMES: Record<string, string> = {
  client_registration:   'client-registration.pdf',
  terms_of_payment:      'terms-of-payment.pdf',
  reservation_agreement: 'reservation-agreement.pdf',
  buyer_info_form:       'buyer-info-form.pdf',
  soa:                   'statement-of-account.pdf',
};

/**
 * Generates a PDF document and returns it as a pure base64 string (no data-URL prefix).
 * clientOverride: pass a ClientRecord directly (e.g. from a dropdown selection).
 *   If omitted for client_registration, the client is derived from the reservation.
 */
export async function buildPDFBase64(
  documentKey: string,
  reservationId: string | null,
  clientOverride?: ClientRecord | null,
): Promise<{ base64: string; filename: string }> {
  let client: ClientRecord | null = clientOverride ?? null;

  let reservationClientId: string | null = null;

  // Derive client from reservation when not provided explicitly
  if ((documentKey === 'client_registration' || documentKey === 'terms_of_payment' || documentKey === 'reservation_agreement' || documentKey === 'buyer_info_form' || documentKey === 'soa' || documentKey === 'delinquency_1st_notice' || documentKey === 'delinquency_2nd_notice' || documentKey === 'delinquency_final_notice') && reservationId) {
    const { data: res } = await supabase
      .from('reservations')
      .select('client_id')
      .eq('reservation_id', reservationId)
      .maybeSingle();
    reservationClientId = (res as any)?.client_id ?? null;
    if (documentKey === 'client_registration' && !client && reservationClientId) {
      const all = await fetchAllClients();
      client = all.find(c => c.client_id === reservationClientId) ?? null;
    }
  }

  // Intercept window.open so generators don't open a new tab
  const origOpen = window.open;
  const win = { location: { href: '' } };
  window.open = () => win as unknown as Window;
  try {
    if (documentKey === 'client_registration')      await generateClientRegistration(client);
    if (documentKey === 'terms_of_payment')         await generateTermsOfPayment(reservationId);
    if (documentKey === 'reservation_agreement')    await generateReservationAgreement(reservationId);
    if (documentKey === 'buyer_info_form')          await generateBuyerInformationForm(reservationId);
    if (documentKey === 'soa')                      await generateSOA(reservationId);
    if (documentKey === 'delinquency_1st_notice')   await generateDelinquency1stNotice(reservationId);
    if (documentKey === 'delinquency_2nd_notice')     await generateDelinquency2ndNotice(reservationId);
    if (documentKey === 'delinquency_final_notice')   await generateDelinquencyFinalNotice(reservationId);
  } finally {
    window.open = origOpen;
  }

  const blobUrl = win.location.href;
  if (!blobUrl.startsWith('blob:')) throw new Error(`PDF generation failed for "${documentKey}"`);

  const blob = await fetch(blobUrl).then(r => r.blob());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const cid = reservationClientId ?? (clientOverride as any)?.client_id ?? 'unknown';
      const rid = reservationId ?? '';
      const filenameMap: Record<string, string> = {
        client_registration:    `CRF-${cid}.pdf`,
        terms_of_payment:       `TOP-${cid}_${rid}.pdf`,
        reservation_agreement:  `RA-${cid}_${rid}.pdf`,
        buyer_info_form:        `BIF-${cid}_${rid}.pdf`,
        soa:                    `SOA-${cid}_${rid}.pdf`,
        delinquency_1st_notice: `1st Notice-${cid}_${rid}.pdf`,
        delinquency_2nd_notice: `2nd Notice-${cid}_${rid}.pdf`,
        delinquency_final_notice: `Final Notice-${cid}_${rid}.pdf`,
      };
      let filename = filenameMap[documentKey] ?? PDF_FILENAMES[documentKey] ?? 'document.pdf';
      resolve({ base64: (reader.result as string).split(',')[1], filename });
    };
    reader.onerror = () => reject(new Error('Failed to read PDF blob'));
    reader.readAsDataURL(blob);
  });
}

// ── Delinquency 1st Notice ────────────────────────────────────────────────────

export async function generateDelinquency1stNotice(reservationId: string | null): Promise<void> {
  if (!reservationId) return;
  const win = window.open('', '_blank');

  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const L = 20, R = pageW - 20, W = R - L;

  // ── Data fetch ──────────────────────────────────────────────────────────────
  const [resResult, penaltyResult, settingsResult] = await Promise.all([
    supabase
      .from('reservations')
      .select('reservation_id, client_id, client_name, project, inventory_code')
      .eq('reservation_id', reservationId)
      .single(),
    supabase
      .from('penalty_lines')
      .select('penalty_amount, balance_receivables, generated_at')
      .eq('reservation_id', reservationId)
      .in('payment_status', ['Unpaid', 'Partial'])
      .order('original_due_date'),
    supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['app_legal_name', 'collection_contact_name', 'collection_contact_phone', 'collection_contact_email']),
  ]);

  const res       = resResult.data as any;
  const penalties = (penaltyResult.data ?? []) as any[];
  const settings  = Object.fromEntries(((settingsResult.data ?? []) as any[]).map((r: any) => [r.key, r.value]));
  const appLegal        = settings['app_legal_name']           ?? 'PH1 World Developers Inc.';
  const contactName     = settings['collection_contact_name']  ?? '';
  const contactPhone    = settings['collection_contact_phone'] ?? '';
  const contactEmail    = settings['collection_contact_email'] ?? '';

  // Mailing address + last name from client
  let mailingAddress = '';
  let lastName = '';
  if (res?.client_id) {
    const { data: clientRow } = await supabase
      .from('clients').select('id, last_name').eq('client_id', res.client_id).maybeSingle();
    lastName = (clientRow as any)?.last_name ?? '';
    const bi = (clientRow as any)?.id ? await fetchBuyerInfo((clientRow as any).id).catch(() => null) : null;
    if (bi) {
      mailingAddress = [bi.home_street, bi.home_barangay, bi.home_city_municipality, bi.home_region_province]
        .filter(Boolean).join(', ');
    }
  }

  const maxGenAt  = penalties.length > 0
    ? penalties.reduce((m: string, p: any) => (p.generated_at > m ? p.generated_at : m), penalties[0].generated_at as string)
    : null;
  const today    = maxGenAt ? new Date(maxGenAt) : new Date();
  const dateStr  = today.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

  const totalPenalty   = penalties.reduce((s: number, p: any) => s + (p.penalty_amount ?? 0), 0);
  const totalPrincipal = penalties.reduce((s: number, p: any) => s + (p.balance_receivables ?? 0), 0);
  const grandTotal     = totalPrincipal + totalPenalty;
  const fmtAmt = (n: number) => 'PhP ' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── Rich text paragraph helper ───────────────────────────────────────────────
  type RichSeg = { t: string; bold?: boolean; color?: [number,number,number] };
  const richPara = (segs: RichSeg[], startY: number, fontSize = 10.5, lineH = 5.8): number => {
    doc.setFontSize(fontSize);
    const tokens: (RichSeg & { word: string })[] = [];
    for (const seg of segs) {
      const words = seg.t.split(' ');
      words.forEach((word, i) => {
        tokens.push({ ...seg, word: word + (i < words.length - 1 ? ' ' : '') });
      });
    }
    let cx = L, y = startY, lineStart = true;
    for (const tok of tokens) {
      doc.setFont('helvetica', tok.bold ? 'bold' : 'normal');
      if (tok.color) doc.setTextColor(...tok.color); else doc.setTextColor(30, 30, 30);
      const wFull = doc.getTextWidth(tok.word);
      const wTrim = doc.getTextWidth(tok.word.trimEnd());
      if (cx + wTrim > R && !lineStart) {
        if (tok.word.trim() === '') { y += lineH; cx = L; lineStart = true; continue; }
        y += lineH; cx = L; lineStart = false;
      }
      if (!(lineStart && tok.word.trim() === '')) {
        doc.text(tok.word, cx, y);
        cx += wFull;
        lineStart = false;
      }
    }
    return y + lineH;
  };

  // ── Layout ───────────────────────────────────────────────────────────────────
  let y = 22;

  // FIRST NOTICE
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(30, 30, 30);
  doc.text('FIRST NOTICE', L, y);
  y += 10;

  // Date
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 30, 30);
  doc.text(dateStr, L, y);
  y += 6;

  // Client name (bold)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(res?.client_name ?? '—', L, y);
  y += 5.5;

  // Address
  if (mailingAddress) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(30, 30, 30);
    const addrLines = doc.splitTextToSize(mailingAddress, W);
    addrLines.forEach((line: string) => { doc.text(line, L, y); y += 5.5; });
  }
  y += 8;

  // PROJECT :
  const projectLabel = [res?.project, res?.inventory_code].filter(Boolean).join(', ');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'bold');
  const projLabelW = doc.getTextWidth('PROJECT : ');
  doc.text('PROJECT : ', L, y);
  doc.setFont('helvetica', 'normal');
  doc.text(projectLabel, L + projLabelW, y);
  y += 6.5;

  // SUBJECT:
  doc.setFont('helvetica', 'bold');
  const subjLabelW = doc.getTextWidth('SUBJECT: ');
  doc.text('SUBJECT: ', L, y);
  doc.setFont('helvetica', 'normal');
  doc.text('Notice to Settle Overdue Installment Payments', L + subjLabelW, y);
  y += 12;

  // Salutation
  const saluteName = lastName || (res?.client_name ?? 'Valued Client');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 30, 30);
  doc.text(`Dear Mr./Ms. ${saluteName}:`, L, y);
  y += 10;

  // Paragraph 1 — amount bold + orange
  y = richPara([
    { t: 'This is to inform you that you have an overdue monthly installment. In view of the foregoing, please settle the amount of ' },
    { t: fmtAmt(grandTotal), bold: true, color: [204, 85, 0] },
    { t: ', inclusive of penalties and interest, within ' },
    { t: 'thirty (30) calendar days', bold: true },
    { t: ' from the receipt of this letter.' },
  ], y);
  y += 5;

  // Paragraph 2 — company name bold
  y = richPara([
    { t: 'Failure to pay your outstanding obligation within the period indicated above shall entitle ' },
    { t: appLegal + ',', bold: true },
    { t: ' to enforce its rights and remedies under the Reservation Agreement.' },
  ], y);
  y += 5;

  // Paragraph 3
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 30, 30);
  doc.text('Kindly disregard this letter if payment has been made.', L, y);
  y += 10;

  // Paragraph 4 — contact info
  if (contactName) {
    const p4segs: RichSeg[] = [{ t: 'Should you have any inquiries, please feel free to contact ' }];
    p4segs.push({ t: contactName, bold: true });
    if (contactPhone) { p4segs.push({ t: ' at ' }); p4segs.push({ t: contactPhone, bold: true }); }
    if (contactEmail) p4segs.push({ t: ' or send an email to ' + contactEmail + '.' });
    else p4segs.push({ t: '.' });
    y = richPara(p4segs, y);
    y += 5;
  }

  // Closing
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 30, 30);
  doc.text('Very truly yours,', L, y);
  y += 6;
  doc.text('Billing and Collection Team', L, y);
  y += 14;

  // Italic disclaimer
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 85);
  doc.text('This is a computer-generated letter. No signature required.', L, y);

  // ── Footer ───────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(160, 160, 165);
  doc.text('Page 1 of 1', R, pageH - 6, { align: 'right' });

  const noticeFilename = `1st Notice-${res?.client_id ?? 'unknown'}_${reservationId}.pdf`;
  const noticeBlobUrl  = doc.output('bloburl') as unknown as string;
  if (win && typeof (win as any).close === 'function') {
    (win as Window).close();
    const a = document.createElement('a');
    a.href = noticeBlobUrl;
    a.download = noticeFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } else if (win) {
    win.location.href = noticeBlobUrl;
  } else {
    doc.output('dataurlnewwindow');
  }
}

// ── Delinquency 2nd Notice ────────────────────────────────────────────────────

export async function generateDelinquency2ndNotice(reservationId: string | null): Promise<void> {
  if (!reservationId) return;
  const win = window.open('', '_blank');

  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const L = 20, R = pageW - 20, W = R - L;

  // ── Data fetch ──────────────────────────────────────────────────────────────
  const [resResult, penaltyResult, settingsResult] = await Promise.all([
    supabase
      .from('reservations')
      .select('reservation_id, client_id, client_name, project, inventory_code')
      .eq('reservation_id', reservationId)
      .single(),
    supabase
      .from('penalty_lines')
      .select('penalty_amount, balance_receivables, generated_at')
      .eq('reservation_id', reservationId)
      .in('payment_status', ['Unpaid', 'Partial'])
      .order('original_due_date'),
    supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['app_legal_name', 'collection_contact_name', 'collection_contact_phone', 'collection_contact_email']),
  ]);

  const res       = resResult.data as any;
  const penalties = (penaltyResult.data ?? []) as any[];
  const settings  = Object.fromEntries(((settingsResult.data ?? []) as any[]).map((r: any) => [r.key, r.value]));
  const appLegal     = settings['app_legal_name']           ?? 'PH1 World Developers Inc.';
  const contactName  = settings['collection_contact_name']  ?? '';
  const contactPhone = settings['collection_contact_phone'] ?? '';
  const contactEmail = settings['collection_contact_email'] ?? '';

  // Mailing address + last name from client
  let mailingAddress = '';
  let lastName = '';
  if (res?.client_id) {
    const { data: clientRow } = await supabase
      .from('clients').select('id, last_name').eq('client_id', res.client_id).maybeSingle();
    lastName = (clientRow as any)?.last_name ?? '';
    const bi = (clientRow as any)?.id ? await fetchBuyerInfo((clientRow as any).id).catch(() => null) : null;
    if (bi) {
      mailingAddress = [bi.home_street, bi.home_barangay, bi.home_city_municipality, bi.home_region_province]
        .filter(Boolean).join(', ');
    }
  }

  const maxGenAt = penalties.length > 0
    ? penalties.reduce((m: string, p: any) => (p.generated_at > m ? p.generated_at : m), penalties[0].generated_at as string)
    : null;
  const today   = maxGenAt ? new Date(maxGenAt) : new Date();
  const dateStr = today.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

  const totalPenalty   = penalties.reduce((s: number, p: any) => s + (p.penalty_amount ?? 0), 0);
  const totalPrincipal = penalties.reduce((s: number, p: any) => s + (p.balance_receivables ?? 0), 0);
  const grandTotal     = totalPrincipal + totalPenalty;
  const fmtAmt = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── Rich text paragraph helper ───────────────────────────────────────────────
  type RichSeg = { t: string; bold?: boolean };
  const richPara = (segs: RichSeg[], startY: number, fontSize = 10.5, lineH = 5.8): number => {
    doc.setFontSize(fontSize);
    const tokens: (RichSeg & { word: string })[] = [];
    for (const seg of segs) {
      const words = seg.t.split(' ');
      words.forEach((word, i) => {
        tokens.push({ ...seg, word: word + (i < words.length - 1 ? ' ' : '') });
      });
    }
    let cx = L, y = startY, lineStart = true;
    doc.setTextColor(30, 30, 30);
    for (const tok of tokens) {
      doc.setFont('helvetica', tok.bold ? 'bold' : 'normal');
      const wFull = doc.getTextWidth(tok.word);
      const wTrim = doc.getTextWidth(tok.word.trimEnd());
      if (cx + wTrim > R && !lineStart) {
        if (tok.word.trim() === '') { y += lineH; cx = L; lineStart = true; continue; }
        y += lineH; cx = L; lineStart = false;
      }
      if (!(lineStart && tok.word.trim() === '')) {
        doc.text(tok.word, cx, y);
        cx += wFull;
        lineStart = false;
      }
    }
    return y + lineH;
  };

  // ── Layout ───────────────────────────────────────────────────────────────────
  let y = 22;

  // SECOND NOTICE
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(30, 30, 30);
  doc.text('SECOND NOTICE', L, y);
  y += 10;

  // Date
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 30, 30);
  doc.text(dateStr, L, y);
  y += 6;

  // Client name (bold)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(res?.client_name ?? '—', L, y);
  y += 5.5;

  // Address
  if (mailingAddress) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(30, 30, 30);
    const addrLines = doc.splitTextToSize(mailingAddress, W);
    addrLines.forEach((line: string) => { doc.text(line, L, y); y += 5.5; });
  }
  y += 8;

  // PROJECT :
  const projectLabel = [res?.project, res?.inventory_code].filter(Boolean).join(', ');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'bold');
  const projLabelW = doc.getTextWidth('PROJECT : ');
  doc.text('PROJECT : ', L, y);
  doc.setFont('helvetica', 'normal');
  doc.text(projectLabel, L + projLabelW, y);
  y += 6.5;

  // Subject:
  doc.setFont('helvetica', 'bold');
  const subjLabelW = doc.getTextWidth('Subject: ');
  doc.text('Subject: ', L, y);
  doc.setFont('helvetica', 'normal');
  doc.text('Final Demand to Pay Overdue Installment Payments', L + subjLabelW, y);
  y += 12;

  // Salutation
  const saluteName = lastName || (res?.client_name ?? 'Valued Client');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 30, 30);
  doc.text(`Dear Mr./Ms. ${saluteName},`, L, y);
  y += 10;

  // Paragraph 1 — company name bold
  y = richPara([
    { t: 'Our records show that you have failed to settle your outstanding obligation within the period provided by ' },
    { t: appLegal + '.', bold: true },
  ], y);
  y += 5;

  // Paragraph 2 — amount bold
  y = richPara([
    { t: `As of ${dateStr}, your total outstanding obligation is at ` },
    { t: fmtAmt(grandTotal), bold: true },
    { t: ', which includes penalty charges per month imposed on overdue payments.' },
  ], y);
  y += 5;

  // Paragraph 3 — demand sentence bold
  y = richPara([
    { t: 'In view of the foregoing, ' },
    { t: 'final demand is hereby given to settle your outstanding obligations within thirty (30) calendar days from receipt of this letter.', bold: true },
  ], y);
  y += 5;

  // Paragraph 4
  y = richPara([
    { t: 'Failure to do so shall result in the immediate termination of the Reservation Agreement, as well as enforcement of other remedies under the Contract to Sell.' },
  ], y);
  y += 5;

  // Paragraph 5 — normal
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 30, 30);
  doc.text('Kindly disregard this letter if payment has been made.', L, y);
  y += 10;

  // Paragraph 6 — contact info
  if (contactName) {
    const p6segs: { t: string; bold?: boolean }[] = [{ t: 'Should you have any inquiries, please feel free to contact ' }];
    p6segs.push({ t: contactName, bold: true });
    if (contactPhone) { p6segs.push({ t: ' at ' }); p6segs.push({ t: contactPhone, bold: true }); }
    if (contactEmail) p6segs.push({ t: ' or send an email to ' + contactEmail + '.' });
    else p6segs.push({ t: '.' });
    y = richPara(p6segs, y);
    y += 5;
  }

  // Please be guided accordingly
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 30, 30);
  doc.text('Please be guided accordingly.', L, y);
  y += 14;

  // Closing
  doc.text('Very truly yours,', L, y);
  y += 6;
  doc.text('Billing and Collection Team', L, y);
  y += 14;

  // Italic disclaimer
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 85);
  doc.text('This is a computer-generated letter. No signature required.', L, y);

  // ── Footer ───────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(160, 160, 165);
  doc.text('Page 1 of 1', R, pageH - 6, { align: 'right' });

  const notice2Filename = `2nd Notice-${res?.client_id ?? 'unknown'}_${reservationId}.pdf`;
  const notice2BlobUrl  = doc.output('bloburl') as unknown as string;
  if (win && typeof (win as any).close === 'function') {
    (win as Window).close();
    const a = document.createElement('a');
    a.href = notice2BlobUrl;
    a.download = notice2Filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } else if (win) {
    win.location.href = notice2BlobUrl;
  } else {
    doc.output('dataurlnewwindow');
  }
}

// ── Delinquency Final Notice (Notice of Cancellation) ─────────────────────────

export async function generateDelinquencyFinalNotice(reservationId: string | null): Promise<void> {
  if (!reservationId) return;
  const win = window.open('', '_blank');

  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const L = 20, R = pageW - 20, W = R - L;

  // ── Data fetch ──────────────────────────────────────────────────────────────
  const [resResult, penaltyResult, settingsResult] = await Promise.all([
    supabase
      .from('reservations')
      .select('reservation_id, client_id, client_name, project, inventory_code')
      .eq('reservation_id', reservationId)
      .single(),
    supabase
      .from('penalty_lines')
      .select('penalty_amount, balance_receivables, generated_at')
      .eq('reservation_id', reservationId)
      .in('payment_status', ['Unpaid', 'Partial'])
      .order('original_due_date'),
    supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['app_legal_name', 'collection_contact_name', 'collection_contact_phone', 'collection_contact_email']),
  ]);

  const res       = resResult.data as any;
  const penalties = (penaltyResult.data ?? []) as any[];
  const settings  = Object.fromEntries(((settingsResult.data ?? []) as any[]).map((r: any) => [r.key, r.value]));
  const contactName  = settings['collection_contact_name']  ?? '';
  const contactPhone = settings['collection_contact_phone'] ?? '';
  const contactEmail = settings['collection_contact_email'] ?? '';

  // Mailing address + last name from client
  let mailingAddress = '';
  let lastName = '';
  if (res?.client_id) {
    const { data: clientRow } = await supabase
      .from('clients').select('id, last_name').eq('client_id', res.client_id).maybeSingle();
    lastName = (clientRow as any)?.last_name ?? '';
    const bi = (clientRow as any)?.id ? await fetchBuyerInfo((clientRow as any).id).catch(() => null) : null;
    if (bi) {
      mailingAddress = [bi.home_street, bi.home_barangay, bi.home_city_municipality, bi.home_region_province]
        .filter(Boolean).join(', ');
    }
  }

  const maxGenAt = penalties.length > 0
    ? penalties.reduce((m: string, p: any) => (p.generated_at > m ? p.generated_at : m), penalties[0].generated_at as string)
    : null;
  const today   = maxGenAt ? new Date(maxGenAt) : new Date();
  const dateStr = today.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  const year    = today.getFullYear();

  const totalPenalty   = penalties.reduce((s: number, p: any) => s + (p.penalty_amount ?? 0), 0);
  const totalPrincipal = penalties.reduce((s: number, p: any) => s + (p.balance_receivables ?? 0), 0);
  const grandTotal     = totalPrincipal + totalPenalty;
  const fmtAmt = (n: number) => 'PhP ' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── Rich text paragraph helper ───────────────────────────────────────────────
  type RichSeg = { t: string; bold?: boolean };
  const richPara = (segs: RichSeg[], startY: number, fontSize = 10.5, lineH = 5.8): number => {
    doc.setFontSize(fontSize);
    const tokens: (RichSeg & { word: string })[] = [];
    for (const seg of segs) {
      const words = seg.t.split(' ');
      words.forEach((word, i) => {
        tokens.push({ ...seg, word: word + (i < words.length - 1 ? ' ' : '') });
      });
    }
    let cx = L, y = startY, lineStart = true;
    doc.setTextColor(30, 30, 30);
    for (const tok of tokens) {
      doc.setFont('helvetica', tok.bold ? 'bold' : 'normal');
      const wFull = doc.getTextWidth(tok.word);
      const wTrim = doc.getTextWidth(tok.word.trimEnd());
      if (cx + wTrim > R && !lineStart) {
        if (tok.word.trim() === '') { y += lineH; cx = L; lineStart = true; continue; }
        y += lineH; cx = L; lineStart = false;
      }
      if (!(lineStart && tok.word.trim() === '')) {
        doc.text(tok.word, cx, y);
        cx += wFull;
        lineStart = false;
      }
    }
    return y + lineH;
  };

  // ── Layout ───────────────────────────────────────────────────────────────────
  let y = 22;

  // NOTICE OF CANCELLATION
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(30, 30, 30);
  doc.text('NOTICE OF CANCELLATION', L, y);
  y += 10;

  // Date
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 30, 30);
  doc.text(dateStr, L, y);
  y += 6;

  // Client name (bold)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(res?.client_name ?? '—', L, y);
  y += 5.5;

  // Address
  if (mailingAddress) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(30, 30, 30);
    const addrLines = doc.splitTextToSize(mailingAddress, W);
    addrLines.forEach((line: string) => { doc.text(line, L, y); y += 5.5; });
  }
  y += 8;

  // PROJECT :
  const projectLabel = [res?.project, res?.inventory_code].filter(Boolean).join(', ');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'bold');
  const projLabelW = doc.getTextWidth('PROJECT : ');
  doc.text('PROJECT : ', L, y);
  doc.setFont('helvetica', 'normal');
  doc.text(projectLabel, L + projLabelW, y);
  y += 10;

  // Salutation
  const saluteName = lastName || (res?.client_name ?? 'Valued Client');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 30, 30);
  doc.text(`Mr./Ms. ${saluteName},`, L, y);
  y += 10;

  // Paragraph 1 — amount bold
  y = richPara([
    { t: 'Our records show that your account remains unpaid (' },
    { t: fmtAmt(grandTotal), bold: true },
    { t: ') despite demands for payment. A grace period has been given for you to update your account, but you still have failed to settle your arrears.' },
  ], y);
  y += 5;

  // Paragraph 2 — termination sentence bold
  y = richPara([
    { t: 'In view of the foregoing, ' },
    { t: 'we regret to inform you that the Contract to Sell is hereby terminated, cancelled, and rescinded', bold: true },
    { t: '. The termination, cancellation, and rescission of the Contract to Sell dated shall take effect thirty (30) calendar days after receipt of this Notice.' },
  ], y);
  y += 5;

  // Paragraph 3 — contact info
  if (contactName) {
    const p3segs: { t: string; bold?: boolean }[] = [
      { t: 'Should you have any inquiries, please feel free to contact ' },
      { t: contactName, bold: true },
    ];
    if (contactPhone) { p3segs.push({ t: ' at ' }); p3segs.push({ t: contactPhone, bold: true }); }
    if (contactEmail) p3segs.push({ t: ' or send an email to ' + contactEmail + '.' });
    else p3segs.push({ t: '.' });
    y = richPara(p3segs, y);
    y += 5;
  }

  // Closing
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 30, 30);
  doc.text('Very truly yours,', L, y);
  y += 6;
  doc.text('Billing and Collection Team', L, y);
  y += 16;

  // ── Notary / Jurat section ───────────────────────────────────────────────────
  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.3);

  // Republic of the Philippines block
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 30, 30);
  const bracketX = R - 12;
  doc.text('REPUBLIC OF THE PHILIPPINES', L, y);
  doc.text(']', bracketX, y);
  y += 5.5;
  doc.text('] s.s.', bracketX, y);
  y += 10;

  // Subscribed and Sworn line
  const sworn1 = 'SUBSCRIBED AND SWORN to before me this ';
  const blank1 = '_____________';
  const at1    = ' at ';
  const blank2 = '____________';
  const pipe   = ' | ';
  const blank3 = '____________';
  const comma  = ', affiant';

  doc.setFont('helvetica', 'bold');
  let sx = L;
  doc.text(sworn1, sx, y); sx += doc.getTextWidth(sworn1);
  doc.setFont('helvetica', 'normal');
  doc.text(blank1, sx, y); sx += doc.getTextWidth(blank1);
  doc.text(at1,    sx, y); sx += doc.getTextWidth(at1);
  doc.text(blank2, sx, y); sx += doc.getTextWidth(blank2);
  doc.text(pipe,   sx, y); sx += doc.getTextWidth(pipe);
  doc.text(blank3, sx, y); sx += doc.getTextWidth(blank3);
  doc.text(comma,  sx, y);
  y += 5.5;

  const sworn2a = 'exhibited to me his/her ';
  const blank4  = '__________________________';
  const sworn2b = ' issued on ';
  const blank5  = '_____________';
  const sworn2c = ' at ';
  const blank6  = '_____________.';
  sx = L;
  doc.text(sworn2a, sx, y); sx += doc.getTextWidth(sworn2a);
  doc.text(blank4,  sx, y); sx += doc.getTextWidth(blank4);
  doc.text(sworn2b, sx, y); sx += doc.getTextWidth(sworn2b);
  doc.text(blank5,  sx, y); sx += doc.getTextWidth(blank5);
  doc.text(sworn2c, sx, y); sx += doc.getTextWidth(sworn2c);
  doc.text(blank6,  sx, y);
  y += 16;

  // Notary Public
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('NOTARY PUBLIC', L, y);
  y += 10;

  // Doc/Page/Book/Series
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  const notaryLines = [
    `Doc. No. _________;`,
    `Page No. _________;`,
    `Book No. _________;`,
    `Series of ${year}.`,
  ];
  notaryLines.forEach(line => { doc.text(line, L, y); y += 6; });

  // ── Footer ───────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(160, 160, 165);
  doc.text('Page 1 of 1', R, pageH - 6, { align: 'right' });

  const finalFilename = `Final Notice-${res?.client_id ?? 'unknown'}_${reservationId}.pdf`;
  const finalBlobUrl  = doc.output('bloburl') as unknown as string;
  if (win && typeof (win as any).close === 'function') {
    (win as Window).close();
    const a = document.createElement('a');
    a.href = finalBlobUrl;
    a.download = finalFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } else if (win) {
    win.location.href = finalBlobUrl;
  } else {
    doc.output('dataurlnewwindow');
  }
}
