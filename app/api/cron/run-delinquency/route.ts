import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── types ──────────────────────────────────────────────────────────────────────

type StageKey = 'none' | '1st_notice' | '2nd_notice' | 'final_notice';
const STAGE_ORDER: StageKey[] = ['none', '1st_notice', '2nd_notice', 'final_notice'];
const stageRank = (s: StageKey) => STAGE_ORDER.indexOf(s);
const maxStage  = (a: StageKey, b: StageKey): StageKey =>
  stageRank(a) >= stageRank(b) ? a : b;

interface NoticeEmailConfig {
  to: string[];   // 'client'
  cc: string[];
  subject: string;
  body: string;
}

interface Policy {
  automation_enabled: boolean;
  run_hour: number;
  grace_days: number;
  notice_1_threshold_months: number;
  notice_2_threshold_months: number;
  final_notice_threshold_months: number;
  recurring_threshold: number;
  notice_email_config: Record<StageKey, NoticeEmailConfig>;
}

export interface DryRunItem {
  reservation_id: string;
  client_name: string;
  inventory_code: string;
  months_behind: number;
  current_stage: StageKey;
  would_stage: StageKey;
  action: 'open_episode' | 'advance_stage' | 'resolve' | 'no_change' | 'no_overdue';
  notice_type: StageKey | null;
}

// ── helpers ────────────────────────────────────────────────────────────────────

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function computeRunDay(dueDay: number, graceDays: number): number {
  const r = dueDay + graceDays;
  return r > 31 ? r - 30 : r;
}

function computedRunDays(dueDays: number[], graceDays: number): number[] {
  return dueDays.map(d => computeRunDay(d, graceDays));
}

function dueDayForRunDay(runDay: number, dueDays: number[], graceDays: number): number | null {
  return dueDays.find(d => computeRunDay(d, graceDays) === runDay) ?? null;
}

function cohortRange(dueDay: number): { min: number; max: number } {
  return dueDay <= 20 ? { min: 1, max: 20 } : { min: 21, max: 31 };
}

function matchedRunDay(dueDays: number[], graceDays: number, today: Date): number | null {
  const dom  = today.getUTCDate();
  const last = lastDayOfMonth(today.getUTCFullYear(), today.getUTCMonth());
  return computedRunDays(dueDays, graceDays).find(d => Math.min(d, last) === dom) ?? null;
}

function monthsBehind(firstMissed: Date, today: Date): number {
  return (today.getFullYear() - firstMissed.getFullYear()) * 12
    + (today.getMonth() - firstMissed.getMonth());
}

function stageForMonths(months: number, p: Policy): StageKey {
  if (months >= p.final_notice_threshold_months) return 'final_notice';
  if (months >= p.notice_2_threshold_months)     return '2nd_notice';
  if (months >= p.notice_1_threshold_months)     return '1st_notice';
  return 'none';
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}

function fmtCurrency(n: number): string {
  return n.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

// ── Graph API ──────────────────────────────────────────────────────────────────

async function getGraphToken(): Promise<string> {
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

async function sendEmail(
  token: string, sender: string,
  to: string[], cc: string[],
  subject: string, htmlBody: string,
): Promise<void> {
  const message: any = {
    subject,
    body: { contentType: 'HTML', content: htmlBody },
    toRecipients: to.map(a => ({ emailAddress: { address: a } })),
  };
  if (cc.length > 0) message.ccRecipients = cc.map(a => ({ emailAddress: { address: a } }));
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${sender}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });
  if (!res.ok) throw new Error(`Graph API error: ${await res.text()}`);
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

// ── send queued notices ────────────────────────────────────────────────────────

async function sendQueuedNotices(
  policy: Policy,
  bookedReservations: any[],
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const { data: toSend } = await adminClient
    .from('delinquency_notices')
    .select('id, reservation_id, client_id, notice_type, months_behind_at_send, total_receivable_balance, total_penalty_balance')
    .eq('email_status', 'queued');

  if (!toSend || toSend.length === 0) return { sent: 0, failed: 0, errors: [] };

  let graphToken: string | null = null;
  let senderEmail: string | null = null;
  const errors: string[] = [];

  try {
    const { data: senderRow } = await adminClient.from('app_settings').select('value').eq('key', 'email_sender').maybeSingle();
    senderEmail = (senderRow as any)?.value ?? null;
    if (senderEmail) graphToken = await getGraphToken();
  } catch (e: any) {
    return { sent: 0, failed: toSend.length, errors: [`Email setup failed: ${e.message}`] };
  }

  let sent = 0, failed = 0;

  for (const notice of toSend as any[]) {
    const rid        = notice.reservation_id as string;
    const noticeType = notice.notice_type as StageKey;
    const resData    = bookedReservations.find((r: any) => r.reservation_id === rid);

    try {
      const emailCfg = policy.notice_email_config?.[noticeType];
      if (!emailCfg) throw new Error(`No email config for ${noticeType}`);
      if (!senderEmail || !graphToken) throw new Error('Email service not configured');

      const vars: Record<string, string> = {
        client_name:         resData?.client_name ?? '',
        reservation_id:      rid,
        project:             resData?.project ?? '',
        unit:                resData?.inventory_code ?? '',
        months_behind:       String(notice.months_behind_at_send ?? 0),
        outstanding_balance: fmtCurrency(Number(notice.total_receivable_balance ?? 0)),
        penalty_balance:     fmtCurrency(Number(notice.total_penalty_balance ?? 0)),
      };

      const toEmails = await resolveRecipients(emailCfg.to, resData ?? { client_id: notice.client_id });
      const ccEmails = await resolveRecipients(emailCfg.cc, resData ?? { client_id: notice.client_id });

      if (toEmails.length === 0) throw new Error('No recipient email resolved');

      const subject  = fillTemplate(emailCfg.subject, vars);
      const bodyText = fillTemplate(emailCfg.body, vars);
      const htmlBody = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;">${bodyText.replace(/\n/g, '<br/>')}</div>`;

      await sendEmail(graphToken, senderEmail, toEmails, ccEmails, subject, htmlBody);

      await adminClient.from('delinquency_notices').update({
        email_status: 'sent', email_sent_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', notice.id);

      sent++;
    } catch (e: any) {
      await adminClient.from('delinquency_notices').update({
        email_status: 'failed', email_error: e.message, updated_at: new Date().toISOString(),
      }).eq('id', notice.id);
      errors.push(`${rid}: ${e.message}`);
      failed++;
    }
  }

  return { sent, failed, errors };
}

// ── core automation logic ──────────────────────────────────────────────────────

async function runAutomation(
  triggeredBy: 'cron' | 'manual',
  cohort: { min: number; max: number } | null,
  policy: Policy,
  dryRun = false,
): Promise<{
  accounts_processed: number;
  notices_created: number;
  emails_sent: number;
  emails_failed: number;
  episodes_resolved: number;
  error_count: number;
  errors: string[];
  preview?: DryRunItem[];
}> {
  const today    = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // ── fetch due days from due_date_assignments ───────────────────────────────
  const { data: dueDateRows } = await adminClient.from('due_date_assignments').select('due_date');
  const dueDays: number[] = [...new Set((dueDateRows ?? []).map((r: any) => Number(r.due_date)))].sort((a, b) => a - b);

  // ── booked reservations ────────────────────────────────────────────────────
  const { data: bookedReservations, error: resErr } = await adminClient
    .from('reservations')
    .select('reservation_id, client_id, client_name, inventory_code, project, broker_id, broker_network_associate_id, seller_id, sales_manager_id, sales_director_id, sales_division_head_id, sales_head_id')
    .eq('status', 'Booked');

  if (resErr) throw new Error(`Failed to fetch reservations: ${resErr.message}`);
  if (!bookedReservations || bookedReservations.length === 0) {
    return { accounts_processed: 0, notices_created: 0, emails_sent: 0, emails_failed: 0, episodes_resolved: 0, error_count: 0, errors: [] };
  }

  const reservationIds = bookedReservations.map((r: any) => r.reservation_id as string);

  // ── overdue receivables ────────────────────────────────────────────────────
  const { data: overdueLines } = await adminClient
    .from('receivables_database')
    .select('reservation_id, due_date, balance_receivables')
    .in('reservation_id', reservationIds)
    .lt('due_date', todayStr)
    .in('payment_status', ['Unpaid', 'Partial'])
    .not('type_of_payment', 'ilike', '%penalty%')
    .order('due_date');

  const overdueMap: Record<string, { firstMissedDate: string; totalBalance: number }> = {};
  for (const line of (overdueLines ?? []) as any[]) {
    const rid    = line.reservation_id as string;
    const dueDay = new Date(line.due_date + 'T00:00:00').getDate();
    if (cohort && (dueDay < cohort.min || dueDay > cohort.max)) continue;
    if (!overdueMap[rid]) overdueMap[rid] = { firstMissedDate: line.due_date, totalBalance: 0 };
    overdueMap[rid].totalBalance += Number(line.balance_receivables ?? 0);
  }

  // ── penalty balances ───────────────────────────────────────────────────────
  const { data: penaltyLines } = await adminClient
    .from('penalty_lines')
    .select('reservation_id, penalty_amount, amount_paid')
    .in('reservation_id', reservationIds)
    .in('payment_status', ['Unpaid', 'Partial']);

  const penaltyMap: Record<string, number> = {};
  for (const pl of (penaltyLines ?? []) as any[]) {
    const bal = Number(pl.penalty_amount ?? 0) - Number(pl.amount_paid ?? 0);
    penaltyMap[pl.reservation_id] = (penaltyMap[pl.reservation_id] ?? 0) + bal;
  }

  // ── active episodes ────────────────────────────────────────────────────────
  const { data: activeEpisodes } = await adminClient
    .from('delinquency_accounts')
    .select('*')
    .in('reservation_id', reservationIds)
    .eq('status', 'active');

  const episodeByReservation: Record<string, any> = {};
  for (const ep of (activeEpisodes ?? []) as any[]) episodeByReservation[ep.reservation_id] = ep;

  // ── process each reservation ───────────────────────────────────────────────
  let accounts_processed = 0, notices_created = 0, episodes_resolved = 0, error_count = 0;
  const errors: string[] = [];
  const preview: DryRunItem[] = [];

  for (const res of bookedReservations as any[]) {
    const rid     = res.reservation_id as string;
    const overdue = overdueMap[rid];
    const episode = episodeByReservation[rid];

    try {
      // Resolve episode if no more overdue lines
      if (!overdue && episode) {
        const dryItem: DryRunItem = {
          reservation_id: rid, client_name: res.client_name, inventory_code: res.inventory_code ?? '',
          months_behind: episode.months_behind, current_stage: episode.current_stage, would_stage: 'none',
          action: 'resolve', notice_type: null,
        };
        if (dryRun) { preview.push(dryItem); episodes_resolved++; accounts_processed++; continue; }

        await adminClient.from('delinquency_accounts').update({
          status: 'resolved', resolved_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq('id', episode.id);

        const { data: clientRow } = await adminClient
          .from('clients').select('id, delinquency_count, worst_stage_ever')
          .eq('client_id', res.client_id).maybeSingle();
        if (clientRow) {
          const newCount = ((clientRow as any).delinquency_count ?? 0) + 1;
          await adminClient.from('clients').update({
            delinquency_count:       newCount,
            is_recurring_delinquent: newCount >= policy.recurring_threshold,
            worst_stage_ever:        maxStage((clientRow as any).worst_stage_ever ?? 'none', episode.highest_stage),
          }).eq('client_id', res.client_id);
        }
        episodes_resolved++; accounts_processed++;
        continue;
      }

      if (!overdue) {
        if (dryRun) preview.push({ reservation_id: rid, client_name: res.client_name, inventory_code: res.inventory_code ?? '', months_behind: 0, current_stage: episode?.current_stage ?? 'none', would_stage: 'none', action: 'no_overdue', notice_type: null });
        continue;
      }

      const firstMissed = new Date(overdue.firstMissedDate + 'T00:00:00');
      const months      = monthsBehind(firstMissed, today);
      const targetStage = stageForMonths(months, policy);
      accounts_processed++;

      if (!episode) {
        const dryItem: DryRunItem = {
          reservation_id: rid, client_name: res.client_name, inventory_code: res.inventory_code ?? '',
          months_behind: months, current_stage: 'none', would_stage: targetStage,
          action: targetStage !== 'none' ? 'open_episode' : 'no_change',
          notice_type: targetStage !== 'none' ? targetStage : null,
        };
        if (dryRun) { preview.push(dryItem); if (targetStage !== 'none') notices_created++; continue; }

        const { data: prevEps } = await adminClient
          .from('delinquency_accounts').select('episode_number').eq('reservation_id', rid)
          .order('episode_number', { ascending: false }).limit(1);
        const episodeNumber = ((prevEps?.[0] as any)?.episode_number ?? 0) + 1;

        const { data: newEp, error: epErr } = await adminClient
          .from('delinquency_accounts').insert({
            reservation_id: rid, client_id: res.client_id, episode_number: episodeNumber,
            first_missed_date: overdue.firstMissedDate, current_stage: targetStage,
            highest_stage: targetStage, months_behind: months, updated_at: new Date().toISOString(),
          }).select('id').single();

        if (epErr || !newEp) { errors.push(`${rid}: failed to open episode — ${epErr?.message}`); error_count++; continue; }

        if (targetStage !== 'none') {
          await adminClient.from('delinquency_notices').insert({
            delinquency_account_id: (newEp as any).id, reservation_id: rid, client_id: res.client_id,
            notice_type: targetStage, months_behind_at_send: months,
            total_receivable_balance: overdue.totalBalance, total_penalty_balance: penaltyMap[rid] ?? 0,
            email_status: 'queued',
          });
          notices_created++;
        }
      } else {
        const prevHighest   = episode.highest_stage as StageKey;
        const prevCurrent   = episode.current_stage as StageKey;
        const newHighest    = maxStage(prevHighest, targetStage);
        const stageAdvanced = stageRank(targetStage) > stageRank(prevCurrent);

        const dryItem: DryRunItem = {
          reservation_id: rid, client_name: res.client_name, inventory_code: res.inventory_code ?? '',
          months_behind: months, current_stage: prevCurrent, would_stage: targetStage,
          action: stageAdvanced ? 'advance_stage' : 'no_change',
          notice_type: stageAdvanced && targetStage !== 'none' ? targetStage : null,
        };
        if (dryRun) { preview.push(dryItem); if (stageAdvanced && targetStage !== 'none') notices_created++; continue; }

        await adminClient.from('delinquency_accounts').update({
          current_stage: targetStage, highest_stage: newHighest, months_behind: months, updated_at: new Date().toISOString(),
        }).eq('id', episode.id);

        if (stageAdvanced && targetStage !== 'none') {
          const { error: noticeErr } = await adminClient.from('delinquency_notices').insert({
            delinquency_account_id: episode.id, reservation_id: rid, client_id: res.client_id,
            notice_type: targetStage, months_behind_at_send: months,
            total_receivable_balance: overdue.totalBalance, total_penalty_balance: penaltyMap[rid] ?? 0,
            email_status: 'queued',
          });
          if (!noticeErr) notices_created++;
        }
      }
    } catch (e: any) {
      errors.push(`${rid}: ${e.message}`);
      error_count++;
    }
  }

  if (dryRun) {
    return { accounts_processed, notices_created, emails_sent: 0, emails_failed: 0, episodes_resolved, error_count, errors, preview };
  }

  // ── send queued notices ────────────────────────────────────────────────────
  const emailResult = await sendQueuedNotices(policy, bookedReservations);
  errors.push(...emailResult.errors);

  return {
    accounts_processed, notices_created,
    emails_sent: emailResult.sent, emails_failed: emailResult.failed,
    episodes_resolved, error_count: error_count + emailResult.failed, errors,
  };
}

// ── GET — Vercel Cron ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: policyRow } = await adminClient.from('penalty_policy').select('*').eq('id', 1).single();
  const policy = policyRow as Policy | null;

  if (!policy?.automation_enabled) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'automation_disabled' });
  }

  const { data: dueDateRows } = await adminClient.from('due_date_assignments').select('due_date');
  const dueDays: number[] = [...new Set((dueDateRows ?? []).map((r: any) => Number(r.due_date)))].sort((a, b) => a - b);

  const today    = new Date();
  const todayHr  = today.getUTCHours();
  const matchedDay = matchedRunDay(dueDays, policy.grace_days, today);

  if (matchedDay === null) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'not_a_run_day', day: today.getUTCDate(), computed_run_days: computedRunDays(dueDays, policy.grace_days) });
  }
  if (todayHr !== policy.run_hour) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'not_run_hour', hour: todayHr, run_hour: policy.run_hour });
  }

  const dueDay = dueDayForRunDay(matchedDay, dueDays, policy.grace_days)!;
  const cohort = cohortRange(dueDay);
  const startMs = Date.now();

  const { data: runRow } = await adminClient
    .from('automation_runs').insert({ triggered_by: 'cron', status: 'running', type: 'delinquency' }).select('id').single();
  const runId = (runRow as any)?.id as number | null;

  try {
    const result = await runAutomation('cron', cohort, policy);
    const duration = Date.now() - startMs;
    if (runId) {
      await adminClient.from('automation_runs').update({
        status: 'completed', accounts_processed: result.accounts_processed,
        notices_created: result.notices_created, emails_queued: result.notices_created,
        emails_sent: result.emails_sent, episodes_resolved: result.episodes_resolved,
        error_count: result.error_count,
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

  const body = await req.json().catch(() => ({}));
  const action: string = body.action ?? 'run';

  const { data: policyRow } = await adminClient.from('penalty_policy').select('*').eq('id', 1).single();
  const policy = policyRow as Policy;

  // ── resend failed / specific notices ──────────────────────────────────────
  if (action === 'resend') {
    const noticeIds: number[] = body.notice_ids ?? [];
    const filter = noticeIds.length > 0
      ? adminClient.from('delinquency_notices').update({ email_status: 'queued', email_error: null, updated_at: new Date().toISOString() }).in('id', noticeIds)
      : adminClient.from('delinquency_notices').update({ email_status: 'queued', email_error: null, updated_at: new Date().toISOString() }).eq('email_status', 'failed');
    await filter;

    const { data: bookedReservations } = await adminClient
      .from('reservations').select('reservation_id, client_id, client_name, inventory_code, project, broker_id, broker_network_associate_id, seller_id, sales_manager_id, sales_director_id, sales_division_head_id, sales_head_id').eq('status', 'Booked');
    const emailResult = await sendQueuedNotices(policy, bookedReservations ?? []);
    return NextResponse.json({ ok: true, ...emailResult });
  }

  // ── dry run ───────────────────────────────────────────────────────────────
  if (action === 'dry_run') {
    const result = await runAutomation('manual', null, policy, true);
    return NextResponse.json({ ok: true, ...result });
  }

  // ── full manual run ───────────────────────────────────────────────────────
  const startMs = Date.now();
  const { data: runRow } = await adminClient
    .from('automation_runs').insert({ triggered_by: 'manual', status: 'running', type: 'delinquency' }).select('id').single();
  const runId = (runRow as any)?.id as number | null;

  try {
    const result = await runAutomation('manual', null, policy);
    const duration = Date.now() - startMs;
    if (runId) {
      await adminClient.from('automation_runs').update({
        status: 'completed', accounts_processed: result.accounts_processed,
        notices_created: result.notices_created, emails_queued: result.notices_created,
        emails_sent: result.emails_sent, episodes_resolved: result.episodes_resolved,
        error_count: result.error_count,
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
