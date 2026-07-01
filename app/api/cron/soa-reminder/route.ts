import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { renderSOAToBase64, type SOAReservation, type SOALine } from '@/lib/soa-pdf-server';

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── types ──────────────────────────────────────────────────────────────────────

interface SoaPolicy {
  automation_enabled: boolean;
  run_hour: number;
  grace_days: number;
  email_config: {
    to: string[];
    cc: string[];
    subject: string;
    body: string;
  };
}

export interface SoaDryRunItem {
  reservation_id: string;
  client_name: string;
  inventory_code: string;
  target_date: string;
  has_client_email: boolean;
}

// ── Graph API helpers ──────────────────────────────────────────────────────────

async function getAccessToken(): Promise<string> {
  const { AZURE_TENANT_ID: t, AZURE_CLIENT_ID: c, AZURE_CLIENT_SECRET: s } = process.env;
  if (!t || !c || !s) throw new Error('Azure credentials not configured');
  const res = await fetch(`https://login.microsoftonline.com/${t}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: c, client_secret: s, scope: 'https://graph.microsoft.com/.default' }),
  });
  if (!res.ok) throw new Error(`Token request failed: ${await res.text()}`);
  return (await res.json()).access_token as string;
}

async function getSenderEmail(): Promise<string> {
  const { data } = await adminClient.from('app_settings').select('value').eq('key', 'email_sender').maybeSingle();
  const sender = (data as any)?.value;
  if (!sender) throw new Error('Sender email not configured in System Settings');
  return sender;
}

async function sendEmailWithPDF(
  accessToken: string,
  senderEmail: string,
  to: string[],
  cc: string[],
  subject: string,
  htmlBody: string,
  pdfBase64: string,
  filename: string,
): Promise<void> {
  const message: any = {
    subject,
    body: { contentType: 'HTML', content: htmlBody },
    toRecipients: to.map(a => ({ emailAddress: { address: a } })),
    attachments: [{
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: filename,
      contentType: 'application/pdf',
      contentBytes: pdfBase64,
    }],
  };
  if (cc.length > 0) message.ccRecipients = cc.map(a => ({ emailAddress: { address: a } }));
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${senderEmail}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });
  if (!res.ok) throw new Error(`Graph API error: ${await res.text()}`);
}

// ── template helper ────────────────────────────────────────────────────────────

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}

// ── resolve email addresses for a notice ──────────────────────────────────────

// Roles resolved via profiles table (system-wide, not reservation-specific)
const PROFILE_ROLE_MAP: Record<string, string> = {
  account_management: 'Account Management',
  finance:            'Finance Verification',
};

// Reservation ID columns for hierarchy roles
const HIERARCHY_RES_COL: Record<string, string> = {
  seller:              'seller_id',
  sales_manager:       'sales_manager_id',
  sales_director:      'sales_director_id',
  sales_division_head: 'sales_division_head_id',
  sales_head:          'sales_head_id',
};

async function resolveRecipients(
  roles: string[],
  res: {
    client_id?: string;
    broker_id?: string | null;
    broker_network_associate_id?: string | null;
    seller_id?: string;
    sales_manager_id?: string;
    sales_director_id?: string;
    sales_division_head_id?: string;
    sales_head_id?: string;
  },
): Promise<string[]> {
  if (!roles.length) return [];

  const emails: string[] = [];
  const isBroker = !!(res as any).broker_id;

  for (const role of roles) {
    if (role === 'client') {
      if (res.client_id) {
        const { data } = await adminClient.from('clients').select('email').eq('client_id', res.client_id).maybeSingle();
        const e = (data as any)?.email;
        if (e) emails.push(e);
      }
    } else if (isBroker && role === 'seller') {
      // BNA acts as seller for broker reservations — look up in broker_personnel
      const bnaId = (res as any).broker_network_associate_id;
      if (bnaId) {
        const { data: bp } = await adminClient.from('broker_personnel')
          .select('email_address').eq('personnel_id', bnaId).maybeSingle();
        const e = (bp as any)?.email_address;
        if (e) emails.push(e);
      }
    } else if (isBroker && role === 'sales_manager') {
      // BNO is stored in sales_manager_id for broker reservations — look up in broker_personnel
      const bnoId = (res as any).sales_manager_id;
      if (bnoId) {
        const { data: bp } = await adminClient.from('broker_personnel')
          .select('email_address').eq('personnel_id', bnoId).maybeSingle();
        const e = (bp as any)?.email_address;
        if (e) emails.push(e);
      }
    } else if (HIERARCHY_RES_COL[role]) {
      // In-house hierarchy + broker SD/SDH/SH — all in Salesperson table
      const personId = (res as any)[HIERARCHY_RES_COL[role]];
      if (personId) {
        const { data: sp } = await adminClient.from('Salesperson')
          .select('"Email Address"').eq('Seller Id', personId).maybeSingle();
        const e = (sp as any)?.['Email Address'];
        if (e) emails.push(e);
      }
    } else {
      const roleName = PROFILE_ROLE_MAP[role];
      if (roleName) {
        const { data: profiles } = await adminClient
          .from('profiles')
          .select('email, access_roles!inner(role_name)')
          .eq('access_roles.role_name', roleName);
        (profiles ?? []).forEach((p: any) => { if (p.email) emails.push(p.email); });
      }
    }
  }
  return [...new Set(emails.filter(Boolean))];
}

// ── server-side penalty reset ──────────────────────────────────────────────────
// Mirrors lib/collections.ts resetPenaltyCollections but uses adminClient.

async function serverResetPenaltyCollections(reservationId: string): Promise<void> {
  const { data: lineIdRows, error: idErr } = await adminClient
    .from('penalty_lines').select('id').eq('reservation_id', reservationId);
  if (idErr) throw new Error(`Reset fetch ids: ${idErr.message}`);

  const { error: resetErr } = await adminClient
    .from('penalty_lines')
    .update({ collection: 0, payment_status: 'Unpaid', ar_no: null, ar_date: null })
    .eq('reservation_id', reservationId);
  if (resetErr) throw new Error(`Reset penalty_lines: ${resetErr.message}`);

  const ids = (lineIdRows ?? []).map((l: any) => l.id as number);
  if (ids.length > 0) {
    const { error: delAppErr } = await adminClient.from('penalty_collection_applications').delete().in('penalty_line_id', ids);
    if (delAppErr) throw new Error(`Delete applications: ${delAppErr.message}`);
  }
  const { error: delCreditErr } = await adminClient.from('penalty_credits').delete().eq('reservation_id', reservationId);
  if (delCreditErr) throw new Error(`Delete credits: ${delCreditErr.message}`);
}

// ── server-side penalty reapply ────────────────────────────────────────────────
// Mirrors lib/collections.ts reapplyPenaltyCollections but uses adminClient.
// Note: includes its own reset at the start — do NOT call serverResetPenaltyCollections
// separately before this; call this directly after generate_penalty_lines.

async function serverReapplyPenaltyCollections(reservationId: string): Promise<void> {
  await serverResetPenaltyCollections(reservationId);

  const { data: collections } = await adminClient
    .from('collections')
    .select('id, amount_received, acknowledgement_receipt_no, posting_date')
    .eq('reservation_id', reservationId)
    .eq('type_of_collection', 'Penalties')
    .order('posting_date', { ascending: true })
    .order('created_at',   { ascending: true });

  if (!collections || collections.length === 0) return;

  for (const col of collections as any[]) {
    const { data: penaltyLines } = await adminClient
      .from('penalty_lines')
      .select('id, penalty_amount, collection, payment_status')
      .eq('reservation_id', reservationId)
      .in('payment_status', ['Unpaid', 'Partial'])
      .order('original_due_date', { ascending: true });

    let remaining = Number(col.amount_received);

    if (!penaltyLines || penaltyLines.length === 0) {
      if (remaining > 0.005) {
        await adminClient.from('penalty_credits').insert({
          reservation_id: reservationId, source_collection_id: col.id,
          ar_no: col.acknowledgement_receipt_no ?? null,
          amount: Math.round(remaining * 100) / 100,
        });
      }
      continue;
    }

    const apps:    { collection_id: string; penalty_line_id: number; amount_applied: number }[] = [];
    const updates: { id: number; collection: number; payment_status: string }[] = [];

    for (const line of penaltyLines as any[]) {
      if (remaining <= 0) break;
      const currentCollection = Number(line.collection ?? 0);
      const lineBalance = Math.max(0, Number(line.penalty_amount) - currentCollection);
      if (lineBalance <= 0) continue;

      const applied       = Math.min(remaining, lineBalance);
      const newCollection = currentCollection + applied;
      const newStatus     = newCollection >= Number(line.penalty_amount) - 0.005 ? 'Paid' : 'Partial';

      apps.push({ collection_id: col.id, penalty_line_id: line.id, amount_applied: applied });
      updates.push({ id: line.id, collection: newCollection, payment_status: newStatus });
      remaining -= applied;
    }

    if (apps.length > 0) {
      const { error: appErr } = await adminClient.from('penalty_collection_applications').insert(apps);
      if (appErr) throw new Error(`Insert applications: ${appErr.message}`);
    }
    for (const upd of updates) {
      const { error: updErr } = await adminClient.from('penalty_lines').update({
        collection:     upd.collection,
        payment_status: upd.payment_status,
        ar_no:          col.acknowledgement_receipt_no ?? null,
        ar_date:        col.posting_date,
      }).eq('id', upd.id);
      if (updErr) throw new Error(`Update penalty_line ${upd.id}: ${updErr.message}`);
    }

    if (remaining > 0.005) {
      const { error: creditErr } = await adminClient.from('penalty_credits').insert({
        reservation_id: reservationId, source_collection_id: col.id,
        ar_no: col.acknowledgement_receipt_no ?? null,
        amount: Math.round(remaining * 100) / 100,
      });
      if (creditErr) throw new Error(`Insert credit: ${creditErr.message}`);
    }
  }
}

// ── fetch cohort reservations ──────────────────────────────────────────────────

async function fetchCohortReservations(targetDate: string): Promise<any[]> {
  const { data: dueLines } = await adminClient
    .from('receivables_database')
    .select('reservation_id')
    .eq('due_date', targetDate);

  if (!dueLines || dueLines.length === 0) return [];

  const reservationIds = [...new Set((dueLines as any[]).map(l => l.reservation_id as string))];

  const { data: reservations } = await adminClient
    .from('reservations')
    .select('reservation_id, client_id, client_name, project, tower, inventory_code, scheme_name, term_months, net_list_price, vat, other_charges, total_contract_price, hic_discount, broker_id, broker_network_associate_id, seller_id, sales_manager_id, sales_director_id, sales_division_head_id, sales_head_id')
    .in('reservation_id', reservationIds)
    .eq('status', 'Booked');

  return (reservations ?? []) as any[];
}

// ── target dates for today / both ─────────────────────────────────────────────

function targetDatesForDay(dayOfMonth: number, year: number, month: string, graceDays: number): string[] {
  const runFor15 = 15 - graceDays;
  const runFor30 = 30 - graceDays;
  const targets: string[] = [];
  if (dayOfMonth === runFor15) targets.push(`${year}-${month}-15`);
  if (dayOfMonth === runFor30) targets.push(`${year}-${month}-30`);
  return targets;
}

function allTargetDates(today: Date): { targetDate: string; label: string }[] {
  const year  = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  return [
    { targetDate: `${year}-${month}-15`, label: '15th cohort' },
    { targetDate: `${year}-${month}-30`, label: '30th cohort' },
  ];
}

// ── process one reservation (steps 1-4) ───────────────────────────────────────

async function processReservation(
  res: any,
  targetDate: string,
  todayStr: string,
  policy: SoaPolicy,
  accessToken: string,
  senderEmail: string,
  noticeId: number | null,
  skipPenaltyRegen = false,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!skipPenaltyRegen) {
      // Step 1: Reset penalty collections (collection=0 so generate_penalty_lines computes correctly)
      await serverResetPenaltyCollections(res.reservation_id);

      // Step 2: Regenerate penalty lines with updated days_overdue + penalty_amount
      const { error: rpcErr } = await adminClient.rpc('generate_penalty_lines', {
        p_as_of_date: todayStr,
        p_reservation_id: res.reservation_id,
      });
      if (rpcErr) throw new Error(`generate_penalty_lines: ${rpcErr.message}`);

      // Step 3: Reapply existing penalty collections against fresh lines
      await serverReapplyPenaltyCollections(res.reservation_id);
    }

    // Step 4: Resolve client email
    const toEmails = await resolveRecipients(policy.email_config.to ?? ['client'], res);
    const ccEmails = await resolveRecipients(policy.email_config.cc ?? [], res);

    if (toEmails.length === 0) throw new Error('No client email found');

    // Step 5: Mailing address
    let mailingAddress = '';
    if (res.client_id) {
      const { data: clientRow } = await adminClient.from('clients').select('id').eq('client_id', res.client_id).maybeSingle();
      const clientUuid = (clientRow as any)?.id ?? '';
      if (clientUuid) {
        const { data: bi } = await adminClient.rpc('get_buyer_info', { p_id: clientUuid });
        if (bi) {
          mailingAddress = [
            (bi as any).home_street, (bi as any).home_barangay,
            (bi as any).home_city_municipality, (bi as any).home_region_province,
          ].filter(Boolean).join(', ');
        }
      }
    }

    // Step 6: Fetch all receivable lines (PDF now reflects updated penalty data)
    const { data: allLines } = await adminClient
      .from('receivables_database')
      .select('*')
      .eq('reservation_id', res.reservation_id)
      .order('due_date');

    // Step 7: Generate SOA PDF
    const pdfBase64 = await renderSOAToBase64(res as SOAReservation, (allLines ?? []) as SOALine[], mailingAddress);

    // Step 8: Build email from policy template
    const vars: Record<string, string> = {
      client_name:    res.client_name ?? '',
      reservation_id: res.reservation_id,
      project:        res.project ?? '',
      unit:           res.inventory_code ?? '',
      due_date:       targetDate,
      amount_due:     '',
    };
    const subject  = fillTemplate(policy.email_config.subject, vars);
    const bodyText = fillTemplate(policy.email_config.body, vars);
    const htmlBody = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;">${bodyText.replace(/\n/g, '<br/>')}</div>`;

    // Step 9: Send email
    await sendEmailWithPDF(accessToken, senderEmail, toEmails, ccEmails, subject, htmlBody, pdfBase64, `SOA_${res.reservation_id}.pdf`);

    if (noticeId !== null) {
      await adminClient.from('soa_notices').update({
        email_status: 'sent', email_sent_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', noticeId);
    }

    return { ok: true };
  } catch (e: any) {
    if (noticeId !== null) {
      await adminClient.from('soa_notices').update({
        email_status: 'failed', email_error: e.message, updated_at: new Date().toISOString(),
      }).eq('id', noticeId);
    }
    return { ok: false, error: e.message };
  }
}

// ── core run ──────────────────────────────────────────────────────────────────

async function runSOA(
  triggeredBy: 'cron' | 'manual',
  targetDates: { targetDate: string; label: string }[],
  policy: SoaPolicy,
  runId: number | null,
  dryRun: boolean,
): Promise<{
  sent: number;
  failed: number;
  skipped: number;
  errors: string[];
  preview?: SoaDryRunItem[];
}> {
  const today    = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  let [accessToken, senderEmail] = ['', ''];
  if (!dryRun) {
    try {
      [accessToken, senderEmail] = await Promise.all([getAccessToken(), getSenderEmail()]);
    } catch (e: any) {
      return { sent: 0, failed: 0, skipped: 0, errors: [`Email setup failed: ${e.message}`] };
    }
  }

  let sent = 0, failed = 0, skipped = 0;
  const errors: string[] = [];
  const preview: SoaDryRunItem[] = [];

  for (const { targetDate } of targetDates) {
    const reservations = await fetchCohortReservations(targetDate);

    for (const res of reservations) {
      if (dryRun) {
        const toEmails = await resolveRecipients(policy.email_config.to ?? ['client'], res);
        preview.push({
          reservation_id: res.reservation_id,
          client_name:    res.client_name ?? '',
          inventory_code: res.inventory_code ?? '',
          target_date:    targetDate,
          has_client_email: toEmails.length > 0,
        });
        continue;
      }

      // Create queued notice row
      const { data: noticeRow } = await adminClient.from('soa_notices').insert({
        automation_run_id: runId, reservation_id: res.reservation_id,
        client_id: res.client_id, client_name: res.client_name,
        target_date: targetDate, email_status: 'queued',
      }).select('id').single();
      const noticeId = (noticeRow as any)?.id ?? null;

      const result = await processReservation(res, targetDate, todayStr, policy, accessToken, senderEmail, noticeId);
      if (result.ok) sent++;
      else { failed++; errors.push(`${res.reservation_id}: ${result.error}`); }
    }
  }

  return { sent, failed, skipped, errors, ...(dryRun ? { preview } : {}) };
}

// ── GET — Vercel Cron ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: policyRow } = await adminClient.from('soa_policy').select('*').eq('id', 1).single();
  const policy = policyRow as SoaPolicy | null;

  if (!policy?.automation_enabled) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'automation_disabled' });
  }

  const today      = new Date();
  const dayOfMonth = today.getUTCDate();
  const todayHr    = today.getUTCHours();

  const month = String(today.getUTCMonth() + 1).padStart(2, '0');
  const year  = today.getUTCFullYear();
  const dates = targetDatesForDay(dayOfMonth, year, month, policy.grace_days ?? 5);

  if (dates.length === 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'not_a_run_day', day: dayOfMonth });
  }
  if (todayHr !== policy.run_hour) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'not_run_hour', hour: todayHr, run_hour: policy.run_hour });
  }

  const startMs = Date.now();
  const { data: runRow } = await adminClient
    .from('automation_runs')
    .insert({ triggered_by: 'cron', status: 'running', type: 'soa' })
    .select('id').single();
  const runId = (runRow as any)?.id as number | null;

  try {
    const targets = dates.map(d => ({ targetDate: d, label: '' }));
    const result  = await runSOA('cron', targets, policy, runId, false);
    const duration = Date.now() - startMs;

    if (runId) {
      await adminClient.from('automation_runs').update({
        status: 'completed',
        accounts_processed: result.sent + result.failed,
        emails_sent: result.sent,
        error_count: result.failed,
        error_detail: result.errors.length ? result.errors.join('\n') : null,
        duration_ms: duration, completed_at: new Date().toISOString(),
      }).eq('id', runId);
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    if (runId) {
      await adminClient.from('automation_runs').update({
        status: 'failed', error_detail: e.message,
        duration_ms: Date.now() - startMs, completed_at: new Date().toISOString(),
      }).eq('id', runId);
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── POST — Manual / Dry Run / Resend ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: { user }, error: userErr } = await adminClient.auth.getUser(token);
  if (userErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body   = await req.json().catch(() => ({}));
  const action = body.action ?? 'run';

  const { data: policyRow } = await adminClient.from('soa_policy').select('*').eq('id', 1).single();
  const policy = policyRow as SoaPolicy;

  // ── resend failed notices ──────────────────────────────────────────────────
  if (action === 'resend') {
    const noticeIds: number[] = body.notice_ids ?? [];
    let toResend: any[] = [];

    if (noticeIds.length > 0) {
      const { data } = await adminClient.from('soa_notices')
        .select('id, reservation_id, client_id, client_name, target_date')
        .in('id', noticeIds);
      toResend = data ?? [];
    } else {
      const { data } = await adminClient.from('soa_notices')
        .select('id, reservation_id, client_id, client_name, target_date')
        .eq('email_status', 'failed');
      toResend = data ?? [];
    }

    if (toResend.length === 0) return NextResponse.json({ ok: true, sent: 0, failed: 0 });

    // Re-queue all
    await adminClient.from('soa_notices')
      .update({ email_status: 'queued', email_error: null, updated_at: new Date().toISOString() })
      .in('id', toResend.map((n: any) => n.id));

    let [accessToken, senderEmail] = ['', ''];
    try {
      [accessToken, senderEmail] = await Promise.all([getAccessToken(), getSenderEmail()]);
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: `Email setup failed: ${e.message}` });
    }

    const today    = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    let sent = 0, failed = 0;
    const errors: string[] = [];

    for (const notice of toResend as any[]) {
      const { data: resData } = await adminClient
        .from('reservations')
        .select('reservation_id, client_id, client_name, project, tower, inventory_code, scheme_name, term_months, net_list_price, vat, other_charges, total_contract_price, hic_discount, broker_id, broker_network_associate_id, seller_id, sales_manager_id, sales_director_id, sales_division_head_id, sales_head_id')
        .eq('reservation_id', notice.reservation_id).maybeSingle();
      if (!resData) { failed++; errors.push(`${notice.reservation_id}: reservation not found`); continue; }

      // Resend: skip penalty regen/reapply — just regenerate PDF and resend email
      const result = await processReservation(resData, notice.target_date, todayStr, policy, accessToken, senderEmail, notice.id, true);
      if (result.ok) sent++; else { failed++; errors.push(`${notice.reservation_id}: ${result.error}`); }
    }

    return NextResponse.json({ ok: true, sent, failed, errors });
  }

  // ── dry run ───────────────────────────────────────────────────────────────
  if (action === 'dry_run') {
    const today   = new Date();
    const targets = allTargetDates(today);
    const result  = await runSOA('manual', targets, policy, null, true);
    return NextResponse.json({ ok: true, ...result });
  }

  // ── full manual run ───────────────────────────────────────────────────────
  const startMs = Date.now();
  const { data: runRow } = await adminClient
    .from('automation_runs')
    .insert({ triggered_by: 'manual', status: 'running', type: 'soa' })
    .select('id').single();
  const runId = (runRow as any)?.id as number | null;

  try {
    const today   = new Date();
    const targets = allTargetDates(today);
    const result  = await runSOA('manual', targets, policy, runId, false);
    const duration = Date.now() - startMs;

    if (runId) {
      await adminClient.from('automation_runs').update({
        status: 'completed',
        accounts_processed: result.sent + result.failed,
        emails_sent: result.sent,
        error_count: result.failed,
        error_detail: result.errors.length ? result.errors.join('\n') : null,
        duration_ms: duration, completed_at: new Date().toISOString(),
      }).eq('id', runId);
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    if (runId) {
      await adminClient.from('automation_runs').update({
        status: 'failed', error_detail: e.message,
        duration_ms: Date.now() - startMs, completed_at: new Date().toISOString(),
      }).eq('id', runId);
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
