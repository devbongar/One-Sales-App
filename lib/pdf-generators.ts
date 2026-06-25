import jsPDF from 'jspdf';
import { fetchAllClients, fetchBuyerInfo, type ClientRecord, type BuyerInfoRecord } from '@/lib/clients';
import { fetchReceivableLines, type ReceivableLine } from '@/lib/receivables';
import { fetchSellerSignature } from '@/lib/salesperson';
import { fetchSpouseInfo } from '@/lib/spouse-info';
import { fetchCoOwner } from '@/lib/co-owners';
import { fetchAttyInFact } from '@/lib/atty-in-fact';
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

  if (buyerSig)  { const c = await compressImage(buyerSig,  300, 50); doc.addImage(c, 'JPEG', L,         y - sigImgH, sigW, sigImgH); }
  if (sellerSig) { const c = await compressImage(sellerSig, 300, 50); doc.addImage(c, 'JPEG', rightSigX, y - sigImgH, sigW, sigImgH); }

  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.4);
  doc.line(L, y, L + sigW, y);
  doc.line(rightSigX, y, pageW - L, y);
  doc.setFontSize(7.5);
  doc.setTextColor(28, 28, 30);
  doc.text(today, L + sigW, y - 1, { align: 'right' });
  doc.text(today, pageW - L, y - 1, { align: 'right' });
  doc.setFontSize(7);
  doc.setTextColor(110, 110, 115);
  doc.text('Buyer Signature over Printed Name', L, y + 4);
  doc.text('Seller Signature over Printed Name', rightSigX, y + 4);
  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(120, 120, 125);
  const note = 'All personal information collected herein is done so exclusively with my/our consent to appropriately process my/our future request using the information that I/We\'ve provided. PH1 World Developers, Inc. will use and apply the appropriate security measures to preserve the confidentiality of my/our information.';
  const noteLines = doc.splitTextToSize(note, W);
  doc.text(noteLines, L, y);

  footerBlock(doc);
  if (win) win.location.href = doc.output('bloburl') as unknown as string;
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

  const fmtN   = (n: number | null | undefined) => n != null ? n.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '—';
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
  const blobUrl0 = doc.output('bloburl') as unknown as string;
  if (!openInNewTab) return blobUrl0;
  if (win) win.location.href = blobUrl0;
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
  const blobUrl1 = doc.output('bloburl') as unknown as string;
  if (!openInNewTab) return blobUrl1;
  const raFilename = res?.client_id && reservationId
    ? `RA-${res.client_id}${reservationId}.pdf`
    : 'reservation-agreement.pdf';
  const raLink = document.createElement('a');
  raLink.href = blobUrl1;
  raLink.download = raFilename;
  raLink.click();
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
  const CELL = 13, GAP = 0.6;
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
    doc.setFontSize(6.5);
    doc.setTextColor(110, 110, 115);
    doc.text(label.toUpperCase(), x + 2, y + 4);
    doc.setFontSize(8);
    doc.setTextColor(28, 28, 30);
    doc.text(value || '—', x + 2, y + 10);
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
  void C2;

  const subLabel = (text: string, y: number): number => {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(80, 80, 85);
    doc.text(text, L, y + 4);
    return y + 7;
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
    },
    currentY = 36,
    opts: { preamble?: string; employmentPrefix?: string; showCivilStatus?: boolean; showHomeOwnership?: boolean } = {}
  ) => {
    const { preamble, employmentPrefix = '', showCivilStatus = true, showHomeOwnership = true } = opts;
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
    doc.setFontSize(7);
    doc.setTextColor(80, 80, 85);
    doc.text('Full Name (As found in your valid government issued ID)', L, y + 4);
    y += 7;

    drawCell('Last name',    p.last_name    ?? '—', L,           y, C4);
    drawCell('First Name',   p.first_name   ?? '—', L + C4,      y, C4);
    drawCell('Middle Name',  p.middle_name  ?? '—', L + C4 * 2,  y, C4);
    drawCell('Date of Birth', fmtDate(p.date_of_birth), L + C4 * 3, y, C4); y += CELL + 4;

    if (showCivilStatus) {
      drawCell('Gender',                p.gender       ?? '—', L,           y, C4);
      drawCell('Citizenship',           p.citizenship  ?? '—', L + C4,      y, C4);
      drawCell('Civil Status',          p.civil_status ?? '—', L + C4 * 2,  y, C4);
      drawCell('Tax Identification No.', p.tin || (p.no_tin ? 'No TIN' : '—'), L + C4 * 3, y, C4);
    } else {
      drawCell('Gender',                p.gender       ?? '—', L,           y, C3);
      drawCell('Citizenship',           p.citizenship  ?? '—', L + C3,      y, C3);
      drawCell('Tax Identification No.', p.tin || (p.no_tin ? 'No TIN' : '—'), L + C3 * 2, y, C3);
    }
    y += CELL + 7;

    y = checkBreak(7 + (CELL + 4), y);
    y = subLabel('Contact Information', y);
    const mobileStr = p.mobile_code && p.mobile ? `${p.mobile_code} ${p.mobile}` : (p.mobile ?? '—');
    drawCell('Mobile Number',  mobileStr,          L,          y, C3);
    drawCell('Landline Number', p.landline ?? '—', L + C3,     y, C3);
    drawCell('Email Address',  p.email    ?? '—',  L + C3 * 2, y, C3); y += CELL + 7;

    y = checkBreak(7 + (CELL + 4) * 2, y);
    y = subLabel('Address', y);
    drawCell('Unit No. Building / House No. Block No.', p.home_unit    ?? '—', L,          y, C3);
    drawCell('Street, Subdivision / Village',           p.home_street  ?? '—', L + C3,     y, C3);
    drawCell('Barangay',                                p.home_barangay ?? '—', L + C3 * 2, y, C3); y += CELL + 4;

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
    y += CELL + 8;

    y = checkBreak(7 + (CELL + 4) * 3, y);
    const empTitle = employmentPrefix ? `${employmentPrefix} EMPLOYMENT / BUSINESS INFORMATION` : 'EMPLOYMENT / BUSINESS INFORMATION';
    y = drawSecBar(empTitle, y) + 2;

    drawCell('Employment Status',        p.employment_status  ?? '—', L,          y, C3);
    drawCell('Employment Sector',        p.employment_sector  ?? '—', L + C3,     y, C3);
    drawCell('Employer / Business Name', p.employer           ?? '—', L + C3 * 2, y, C3); y += CELL + 4;

    drawCell('Nature of Business',   p.nature_of_business ?? '—', L,           y, C4);
    drawCell('Rank',                  p.rank               ?? '—', L + C4,      y, C4);
    drawCell('Job Title / Position',  p.job_title          ?? '—', L + C4 * 2,  y, C4);
    drawCell('Salary Range',          p.salary_range       ?? '—', L + C4 * 3,  y, C4); y += CELL + 7;

    y = checkBreak(7 + (CELL + 4), y);
    y = subLabel('Contact Information', y);
    const workMobileStr = p.work_mobile_code && p.work_mobile ? `${p.work_mobile_code} ${p.work_mobile}` : (p.work_mobile ?? '—');
    drawCell('Mobile Number',  workMobileStr,           L,          y, C3);
    drawCell('Landline Number', p.work_landline ?? '—', L + C3,     y, C3);
    drawCell('Email Address',  p.work_email    ?? '—',  L + C3 * 2, y, C3); y += CELL + 7;

    y = checkBreak(7 + (CELL + 4) * 2, y);
    y = subLabel('Address', y);
    drawCell('Unit No. Building / House No. Block No.', p.work_building_unit ?? '—', L,          y, C3);
    drawCell('Street, Subdivision / Village',           p.work_street        ?? '—', L + C3,     y, C3);
    drawCell('Barangay',                                p.work_barangay      ?? '—', L + C3 * 2, y, C3); y += CELL + 4;

    y = checkBreak(CELL + 4, y);
    drawCell('City / Municipality', p.work_city_municipality ?? '—', L,          y, C3);
    drawCell('Province / Region',   p.work_region_province   ?? '—', L + C3,     y, C3);
    drawCell('Country',             p.work_country           ?? '—', L + C3 * 2, y, C3); y += CELL + 8;

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
  };
  y = renderPersonBlock('BUYER INFORMATION', buyerPayload, y, { showCivilStatus: true, showHomeOwnership: true });

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
    }, y, {
      preamble: 'If with Co-Owner, the Buyer agrees that the co-owner and his/her spouse shall sign the Contract-to-Sell should they agree to be co-owners.',
      employmentPrefix: 'CO-OWNER', showCivilStatus: true, showHomeOwnership: false,
    });

    if (coOwnerInfo.civil_status === 'Married') {
      y = renderPersonBlock('CO-OWNER SPOUSE INFORMATION', {
        last_name: null, first_name: null, middle_name: null, suffix: null,
        gender: null, civil_status: null, citizenship: null, date_of_birth: null,
        mobile_code: null, mobile: null, landline: null, email: null,
        tin: null, no_tin: false,
        home_ownership: null, home_country: null, home_region_province: null,
        home_city_municipality: null, home_barangay: null, home_street: null, home_unit: null,
        employer: null, nature_of_business: null, employment_sector: null, employment_status: null,
        job_title: null, rank: null, salary_range: null,
        work_mobile_code: null, work_mobile: null, work_landline: null, work_email: null,
        work_country: null, work_region_province: null, work_city_municipality: null,
        work_barangay: null, work_street: null, work_building_unit: null, mailing_type: null,
      }, y, { employmentPrefix: 'CO-OWNER SPOUSE', showCivilStatus: false, showHomeOwnership: false });
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
  if (clientSigB64) { const c = await compressImage(clientSigB64, 300, 60); doc.addImage(c, 'JPEG', cx2, pY - sigImgH2, sigW2, sigImgH2); }
  doc.setDrawColor(100, 100, 100); doc.setLineWidth(0.4);
  doc.line(cx2, pY, cx2 + sigW2, pY);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(110, 110, 115);
  doc.text('Buyer Signature over Printed Name', cx2, pY + 4);
  doc.setFontSize(7.5); doc.setTextColor(28, 28, 30);
  doc.text(today2, cx2 + sigW2, pY - 1, { align: 'right' });

  if (progress?.privacy_consent) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(34, 120, 34);
    doc.text('✓ Data Privacy Policy consented', cx2, pY + 12);
  }

  footerBlock(doc);
  const blobUrl2 = doc.output('bloburl') as unknown as string;
  if (!openInNewTab) return blobUrl2;
  if (win) win.location.href = blobUrl2;
  else doc.output('dataurlnewwindow');
}

// ── Sample Computation ────────────────────────────────────────────────────────

export async function generateSampleComputation(): Promise<void> {
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
  if (win) win.location.href = doc.output('bloburl') as unknown as string;
  else doc.output('dataurlnewwindow');
}

// ── SOA ───────────────────────────────────────────────────────────────────────

export async function generateSOA(reservationId: string | null): Promise<void> {
  if (!reservationId) return;
  const win = window.open('', '_blank');

  const doc   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();   // 297mm landscape
  const pageH = doc.internal.pageSize.getHeight();  // 210mm landscape
  const L = 12, R = pageW - 12, W = R - L;
  let pageNum = 1;

  // ── Data fetch ────────────────────────────────────────────────────────────
  const [resResult, linesRaw] = await Promise.all([
    supabase
      .from('reservations')
      .select(`reservation_id, client_id, client_name, project, tower, inventory_code,
               scheme_name, term_months,
               net_list_price, vat, other_charges, total_contract_price,
               hic_discount, employee_discount_amount`)
      .eq('reservation_id', reservationId)
      .single(),
    fetchReceivableLines(reservationId),
  ]);
  const res = resResult.data as any;
  const isHIC = (res?.hic_discount ?? 0) > 0;

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
  const schedLines  = lines.filter((l) => !isPenalty(l));
  const today       = new Date();
  const todayStr    = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Billing detail calculations
  const totalBilled  = schedLines.reduce((s, l) => s + l.total_amount_due, 0);
  const totalPaid    = schedLines.reduce((s, l) => s + (l.amount_paid ?? 0), 0);
  const amountDue    = Math.max(0, totalBilled - totalPaid);
  const creditBal    = Math.max(0, totalPaid - totalBilled);

  // Penalty lines — overdue unpaid/partial schedule lines
  const overdueLines = schedLines.filter(
    (l) => l.due_date < todayStr && l.payment_status !== 'Paid'
  );
  const DAILY_RATE   = 0.001; // ~3% per month
  const penaltyLines = overdueLines.map((l) => {
    const daysOverdue = Math.floor(
      (today.getTime() - new Date(l.due_date + 'T00:00:00').getTime()) / 86400000
    );
    const basis       = l.principal ?? l.total_amount_due;
    const penAmt      = basis * daysOverdue * DAILY_RATE;
    return { ...l, daysOverdue, basis, penAmt };
  });
  const totalPenalty = penaltyLines.reduce((s, p) => s + p.penAmt, 0);
  const totalAmtDue  = amountDue + totalPenalty;

  // Next unpaid due date
  const nextUnpaid  = schedLines.find((l) => l.payment_status !== 'Paid');
  const nextDueDate = nextUnpaid?.due_date ?? '';

  // ── Helpers ───────────────────────────────────────────────────────────────
  const fmtN = (n: number | null | undefined, prefix = '') =>
    n != null ? prefix + n.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '—';
  const fmtD = (d: string | null | undefined) =>
    d ? new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

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
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(160, 160, 165);
    doc.text(`Page ${pageNum}`, R, pageH - 6, { align: 'right' });
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
    doc.setFontSize(7);
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
    doc.setFontSize(7.5);
    doc.setTextColor(110, 110, 115);
    doc.text(lbl, COL2X, ry);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 9 : 8);
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

  // Left column: price items stacked vertically; right column: payterm info
  const CD_LEFT_W  = W * 0.62;
  const CD_RIGHT_W = W * 0.34;
  const CD_RIGHT_X = R - CD_RIGHT_W;
  const CD_ROW_H   = 11;

  const cdLeftRows: [string, string, boolean][] = [
    ['Net List Price (incl. VAT)',   fmtN((res?.net_list_price ?? 0) + (res?.vat ?? 0), 'PHP '), false],
    ['Other Charges',                fmtN(res?.other_charges, 'PHP '),                            false],
    ...(isHIC ? [['Home Improvement Contract', fmtN(res?.hic_discount, 'PHP '), false] as [string, string, boolean]] : []),
    ['Total Contract Price',         fmtN(res?.total_contract_price, 'PHP '),                     true ],
    ['Remaining Balance',            fmtN(Math.max(0, (res?.total_contract_price ?? 0) - totalPaid), 'PHP '), false],
  ];
  const cdRightRows: [string, string][] = [
    ['Payterm Scheme', res?.scheme_name ?? '—'],
    ['Term',           res?.term_months != null ? `${res.term_months} months` : '—'],
  ];

  const cdStartY = y;
  cdLeftRows.forEach((row, i) => {
    const ry2 = cdStartY + i * CD_ROW_H;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(110, 110, 115);
    doc.text(row[0], L, ry2);
    doc.setFont('helvetica', row[2] ? 'bold' : 'normal');
    doc.setFontSize(row[2] ? 9 : 8.5);
    doc.setTextColor(28, 28, 30);
    doc.text(row[1], L, ry2 + 5);
  });
  cdRightRows.forEach((row, i) => {
    const ry2 = cdStartY + i * CD_ROW_H;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(110, 110, 115);
    doc.text(row[0], CD_RIGHT_X, ry2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(28, 28, 30);
    doc.text(row[1], CD_RIGHT_X, ry2 + 5);
  });
  void CD_LEFT_W;

  y += cdLeftRows.length * CD_ROW_H + 4;

  // ── Schedule of Payment table ──────────────────────────────────────────────
  y = checkBreak(20, y);
  doc.addImage(darkImg, 'PNG', L, y, W, 7);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('SCHEDULE OF PAYMENT', L + 3, y + 5);
  y += 7;

  // Column layout: Description | Due Date | Principal | VAT | OC | [HIC] | Total | Collection | Pmt Date | Status | AR No. | AR Date
  const schedCols = isHIC
    ? ['Description', 'Due Date', 'Principal', 'VAT', 'Other Chgs', 'HIC', 'Total', 'Collection', 'Pmt Date', 'Status', 'AR No.', 'AR Date']
    : ['Description', 'Due Date', 'Principal', 'VAT', 'Other Chgs', 'Total', 'Collection', 'Pmt Date', 'Status', 'AR No.', 'AR Date'];
  const schedColW = isHIC
    ? [40, 18, 20, 18, 18, 18, 22, 22, 18, 16, 25, 20]
    : [48, 20, 22, 20, 20, 24, 24, 20, 18, 28, 20];

  const tblHdrH = 6;
  let cx2 = L;
  schedCols.forEach((col, i) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(28, 28, 30);
    doc.text(col, cx2 + 1, y + 4.5);
    cx2 += schedColW[i];
  });
  y += tblHdrH;
  doc.setDrawColor(200, 200, 205);
  doc.setLineWidth(0.2);
  doc.line(L, y, R, y);

  const rowH = 6.5;
  schedLines.forEach((ln, idx) => {
    y = checkBreak(rowH + 2, y);
    if (idx % 2 === 0) {
      doc.setFillColor(248, 248, 250);
      doc.rect(L, y, W, rowH, 'F');
    }
    const cols = isHIC
      ? [
          ln.type_of_payment,
          fmtD(ln.due_date),
          fmtN(ln.principal),
          fmtN(ln.vat),
          fmtN(ln.other_charges),
          fmtN(ln.hic),
          fmtN(ln.total_amount_due),
          fmtN(ln.amount_paid),
          fmtD(ln.posting_date),
          ln.payment_status,
          ln.acknowledgement_receipt_no ?? '—',
          fmtD(ln.check_date),
        ]
      : [
          ln.type_of_payment,
          fmtD(ln.due_date),
          fmtN(ln.principal),
          fmtN(ln.vat),
          fmtN(ln.other_charges),
          fmtN(ln.total_amount_due),
          fmtN(ln.amount_paid),
          fmtD(ln.posting_date),
          ln.payment_status,
          ln.acknowledgement_receipt_no ?? '—',
          fmtD(ln.check_date),
        ];
    let tx = L;
    cols.forEach((val, i) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(
        val === 'Paid' ? 34 : val === 'Unpaid' ? 180 : val === 'Partial' ? 120 : 40,
        val === 'Paid' ? 120 : val === 'Unpaid' ? 30 : val === 'Partial' ? 80 : 40,
        val === 'Paid' ? 34 : val === 'Unpaid' ? 30 : val === 'Partial' ? 30 : 45,
      );
      const truncated = doc.splitTextToSize(String(val), schedColW[i] - 2)[0] ?? '';
      doc.text(truncated, tx + 1, y + 4.5);
      tx += schedColW[i];
    });
    y += rowH;
  });

  // Totals row
  y = checkBreak(8, y);
  doc.addImage(makeColorDataURL(70, 70, 75), 'PNG', L, y, W, 7);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
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
        fmtN(totalBilled),
        fmtN(totalPaid),
      ]
    : [
        fmtN(schedLines.reduce((s, l) => s + (l.principal ?? 0), 0)),
        fmtN(schedLines.reduce((s, l) => s + (l.vat ?? 0), 0)),
        fmtN(schedLines.reduce((s, l) => s + (l.other_charges ?? 0), 0)),
        fmtN(totalBilled),
        fmtN(totalPaid),
      ];
  let totX = L + totColOffset;
  totVals.forEach((val, i) => {
    doc.text(val, totX + 1, y + 4.5);
    totX += schedColW[isHIC ? i + 2 : i + 2];
  });
  y += 9;

  // ── Penalties table ───────────────────────────────────────────────────────
  y = checkBreak(20, y);
  doc.addImage(darkImg, 'PNG', L, y, W, 7);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('PENALTIES', L + 3, y + 5);
  y += 7;

  const penCols  = ['Original Due Date', 'Days Overdue', 'Daily Rate*', 'Principal Basis', 'Penalty Amount', 'Collection', 'Status', 'Remarks', 'AR No.', 'AR Date'];
  const penColW  = [30, 22, 18, 30, 30, 25, 18, 30, 28, 22];
  let px = L;
  penCols.forEach((col, i) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(28, 28, 30);
    doc.text(col, px + 1, y + 4.5);
    px += penColW[i];
  });
  y += tblHdrH;
  doc.line(L, y, R, y);

  if (penaltyLines.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(160, 160, 165);
    doc.text('No penalties', L + 3, y + 5);
    y += 8;
  } else {
    penaltyLines.forEach((pl, idx) => {
      y = checkBreak(rowH + 2, y);
      if (idx % 2 === 0) { doc.setFillColor(248, 248, 250); doc.rect(L, y, W, rowH, 'F'); }
      const pCols = [
        fmtD(pl.due_date),
        String(pl.daysOverdue),
        '0.1%/day',
        fmtN(pl.basis),
        fmtN(pl.penAmt),
        '—', pl.payment_status, '—', '—', '—',
      ];
      let ptx = L;
      pCols.forEach((val, i) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(40, 40, 45);
        doc.text(String(val), ptx + 1, y + 4.5);
        ptx += penColW[i];
      });
      y += rowH;
    });
  }

  y += 4;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6);
  doc.setTextColor(130, 130, 135);
  doc.text('*effectively 3% per month', L, y);

  // ── Footer ────────────────────────────────────────────────────────────────
  const now   = new Date();
  const stamp = now.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    + '  ' + now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(L, pageH - 10, R, pageH - 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(160, 160, 165);
  doc.text(`Generated: ${stamp}`, L, pageH - 6);
  doc.text(`Page 1 of ${pageNum}`, R, pageH - 6, { align: 'right' });

  if (win) win.location.href = doc.output('bloburl') as unknown as string;
  else doc.output('dataurlnewwindow');
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
  if ((documentKey === 'client_registration' || documentKey === 'reservation_agreement') && reservationId) {
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
    if (documentKey === 'client_registration')   await generateClientRegistration(client);
    if (documentKey === 'terms_of_payment')      await generateTermsOfPayment(reservationId);
    if (documentKey === 'reservation_agreement') await generateReservationAgreement(reservationId);
    if (documentKey === 'buyer_info_form')       await generateBuyerInformationForm(reservationId);
    if (documentKey === 'soa')                   await generateSOA(reservationId);
  } finally {
    window.open = origOpen;
  }

  const blobUrl = win.location.href;
  if (!blobUrl.startsWith('blob:')) throw new Error(`PDF generation failed for "${documentKey}"`);

  const blob = await fetch(blobUrl).then(r => r.blob());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      let filename = PDF_FILENAMES[documentKey] ?? 'document.pdf';
      if (documentKey === 'reservation_agreement' && reservationClientId && reservationId) {
        filename = `RA-${reservationClientId}${reservationId}.pdf`;
      }
      resolve({ base64: (reader.result as string).split(',')[1], filename });
    };
    reader.onerror = () => reject(new Error('Failed to read PDF blob'));
    reader.readAsDataURL(blob);
  });
}
