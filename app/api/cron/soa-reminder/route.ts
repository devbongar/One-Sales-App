import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { renderSOAToBase64, type SOAReservation, type SOALine } from '@/lib/soa-pdf-server';

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

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
  to: string,
  subject: string,
  htmlBody: string,
  pdfBase64: string,
  filename: string,
): Promise<void> {
  const message = {
    subject,
    body: { contentType: 'HTML', content: htmlBody },
    toRecipients: [{ emailAddress: { address: to } }],
    attachments: [{
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: filename,
      contentType: 'application/pdf',
      contentBytes: pdfBase64,
    }],
  };
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${senderEmail}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });
  if (!res.ok) throw new Error(`Graph API error: ${await res.text()}`);
}

// ── GET handler (called by Vercel Cron) ───────────────────────────────────────

export async function GET(req: NextRequest) {
  // Verify this is coming from Vercel Cron
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const today      = new Date();
    const dayOfMonth = today.getDate();

    // Only fire on 10th (targets due on 15th) or 25th (targets due on 30th)
    if (dayOfMonth !== 10 && dayOfMonth !== 25) {
      return NextResponse.json({ ok: true, skipped: true, day: dayOfMonth });
    }

    const targetDay = dayOfMonth === 10 ? 15 : 30;
    const year      = today.getFullYear();
    const month     = String(today.getMonth() + 1).padStart(2, '0');
    const targetDate = `${year}-${month}-${String(targetDay).padStart(2, '0')}`;

    // Find reservation IDs with a line due on target date
    const { data: dueLines } = await adminClient
      .from('receivables_database')
      .select('reservation_id')
      .eq('due_date', targetDate);

    if (!dueLines || dueLines.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, targetDate, message: 'No lines due on target date' });
    }

    const reservationIds = [...new Set((dueLines as any[]).map(l => l.reservation_id as string))];

    // Fetch only Booked reservations from that set
    const { data: reservations } = await adminClient
      .from('reservations')
      .select('reservation_id, client_id, client_name, project, tower, inventory_code, scheme_name, term_months, net_list_price, vat, other_charges, total_contract_price, hic_discount')
      .in('reservation_id', reservationIds)
      .eq('status', 'Booked');

    if (!reservations || reservations.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, targetDate, message: 'No Booked reservations matched' });
    }

    const [accessToken, senderEmail] = await Promise.all([getAccessToken(), getSenderEmail()]);

    let sent = 0;
    const errors: string[] = [];

    for (const res of reservations as SOAReservation[]) {
      try {
        // Resolve client email from clients table (client_id is the code, e.g. "CL-...")
        let clientEmail = '';
        let clientUuid  = '';
        if (res.client_id) {
          const { data: clientRow } = await adminClient
            .from('clients')
            .select('id, email')
            .eq('client_id', res.client_id)
            .maybeSingle();
          clientEmail = (clientRow as any)?.email ?? '';
          clientUuid  = (clientRow as any)?.id    ?? '';
        }

        if (!clientEmail) {
          errors.push(`${res.reservation_id}: no client email`);
          continue;
        }

        // Mailing address from buyer info RPC
        let mailingAddress = '';
        if (clientUuid) {
          const { data: bi } = await adminClient.rpc('get_buyer_info', { p_id: clientUuid });
          if (bi) {
            mailingAddress = [
              (bi as any).home_street,
              (bi as any).home_barangay,
              (bi as any).home_city_municipality,
              (bi as any).home_region_province,
            ].filter(Boolean).join(', ');
          }
        }

        // All receivable lines for this reservation
        const { data: allLines } = await adminClient
          .from('receivables_database')
          .select('*')
          .eq('reservation_id', res.reservation_id)
          .order('due_date');

        // Generate SOA PDF
        const pdfBase64 = await renderSOAToBase64(res, (allLines ?? []) as SOALine[], mailingAddress);

        // Build email body
        const unitLabel = res.inventory_code ? ` — Unit ${res.inventory_code}` : '';
        const htmlBody = `
          <p>Dear <strong>${res.client_name}</strong>,</p>
          <p>Please find attached your Statement of Account for <strong>${res.project}${unitLabel}</strong>.</p>
          <p>A payment is due on <strong>${targetDate}</strong>. Please ensure timely payment to avoid penalties.</p>
          <p>If you have any questions, please contact your property specialist.</p>
          <br/>
          <p style="color:#888;font-size:11px;">This is an automated message. Please do not reply directly to this email.</p>
        `.trim();

        await sendEmailWithPDF(
          accessToken,
          senderEmail,
          clientEmail,
          `Statement of Account — ${res.reservation_id}`,
          htmlBody,
          pdfBase64,
          `SOA_${res.reservation_id}.pdf`,
        );

        sent++;
      } catch (e: any) {
        errors.push(`${res.reservation_id}: ${e.message}`);
        console.error(`[soa-cron] ${res.reservation_id}:`, e);
      }
    }

    return NextResponse.json({ ok: true, sent, errors, targetDate });
  } catch (e: any) {
    console.error('[soa-cron]', e);
    return NextResponse.json({ error: e.message ?? 'Cron failed' }, { status: 500 });
  }
}
