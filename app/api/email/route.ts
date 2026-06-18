import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Azure Graph API token ─────────────────────────────────────────────────────

async function getAccessToken(): Promise<string> {
  const tenantId     = process.env.AZURE_TENANT_ID;
  const clientId     = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Azure credentials not configured (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET)');
  }

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     clientId,
        client_secret: clientSecret,
        scope:         'https://graph.microsoft.com/.default',
      }),
    }
  );
  if (!res.ok) throw new Error(`Token request failed: ${await res.text()}`);
  return (await res.json()).access_token as string;
}

// ── Settings helpers ──────────────────────────────────────────────────────────

async function getSenderEmail(): Promise<string> {
  const { data } = await adminClient
    .from('app_settings')
    .select('value')
    .eq('key', 'email_sender')
    .maybeSingle();
  const sender = (data as any)?.value;
  if (!sender) throw new Error('Sender email not configured in System Settings');
  return sender;
}

async function getEmailTemplates(): Promise<Record<string, any>> {
  const { data } = await adminClient
    .from('app_settings')
    .select('value')
    .eq('key', 'email_templates')
    .maybeSingle();
  try { return JSON.parse((data as any)?.value ?? '{}'); } catch { return {}; }
}

// ── Graph API send ────────────────────────────────────────────────────────────

interface Attachment { name: string; base64: string }

async function sendViaGraph(
  accessToken: string,
  senderEmail: string,
  to: string[],
  cc: string[],
  subject: string,
  htmlBody: string,
  attachments?: Attachment[],
): Promise<void> {
  const message: Record<string, unknown> = {
    subject,
    body:         { contentType: 'HTML', content: htmlBody },
    toRecipients: to.map(a => ({ emailAddress: { address: a } })),
    ccRecipients: cc.map(a => ({ emailAddress: { address: a } })),
  };

  if (attachments?.length) {
    message.attachments = attachments.map(att => ({
      '@odata.type':  '#microsoft.graph.fileAttachment',
      name:           att.name,
      contentType:    'application/pdf',
      contentBytes:   att.base64,
    }));
  }

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${senderEmail}/sendMail`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, saveToSentItems: true }),
    }
  );
  if (!res.ok) throw new Error(`Graph API error: ${await res.text()}`);
}

// ── Recipient resolution ──────────────────────────────────────────────────────

const ROLE_NAME_MAP: Record<string, string> = {
  sales_director:     'Sales Director',
  account_management: 'Account Management',
  finance:            'Finance Verification',
};

async function resolveRoleEmails(roles: string[], reservationId: string): Promise<string[]> {
  if (!roles.length) return [];

  const { data: res } = await adminClient
    .from('reservations')
    .select('client_id, seller_name')
    .eq('reservation_id', reservationId)
    .maybeSingle();

  let clientEmail = '';
  let sellerEmail = '';

  if (res?.client_id) {
    const { data: c } = await adminClient
      .from('clients')
      .select('email')
      .eq('client_id', res.client_id)
      .maybeSingle();
    clientEmail = (c as any)?.email ?? '';
  }

  const sellerName = (res as any)?.seller_name ?? '';
  if (sellerName) {
    const { data: sp } = await adminClient
      .from('Salesperson')
      .select('"Email Address"')
      .eq('Seller Name', sellerName)
      .maybeSingle();
    sellerEmail = (sp as any)?.['Email Address'] ?? '';
  }

  const emails: string[] = [];
  for (const role of roles) {
    if (role === 'client') {
      if (clientEmail) emails.push(clientEmail);
    } else if (role === 'seller') {
      if (sellerEmail) emails.push(sellerEmail);
    } else {
      const roleName = ROLE_NAME_MAP[role];
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

/** Look up a salesperson's email by name from the Salesperson table. */
async function sellerEmailByName(name: string): Promise<string> {
  if (!name) return '';
  const { data } = await adminClient
    .from('Salesperson')
    .select('"Email Address"')
    .eq('Seller Name', name)
    .maybeSingle();
  return (data as any)?.['Email Address'] ?? '';
}

/** Resolve role-based recipients using a client UUID directly (no reservation needed). */
async function resolveClientRoleEmails(roles: string[], clientUuid: string): Promise<string[]> {
  if (!roles.length) return [];

  const { data: c } = await adminClient
    .from('clients')
    .select('email, property_specialist, sales_manager, sales_director')
    .eq('id', clientUuid)
    .maybeSingle();

  const clientEmail  = (c as any)?.email               ?? '';
  const psName       = (c as any)?.property_specialist  ?? '';
  const smName       = (c as any)?.sales_manager         ?? '';
  const sdName       = (c as any)?.sales_director        ?? '';

  const [sellerEmail, smEmail, sdEmail] = await Promise.all([
    sellerEmailByName(psName),
    sellerEmailByName(smName),
    sellerEmailByName(sdName),
  ]);

  const emails: string[] = [];
  for (const role of roles) {
    if (role === 'client')         { if (clientEmail)  emails.push(clientEmail);  }
    else if (role === 'seller')    { if (sellerEmail)  emails.push(sellerEmail);  }
    else if (role === 'sales_director') { if (sdEmail) emails.push(sdEmail);      }
    else {
      const roleName = ROLE_NAME_MAP[role];
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

// ── Template variable substitution ───────────────────────────────────────────

async function resolveVars(reservationId: string): Promise<Record<string, string>> {
  const { data: res } = await adminClient
    .from('reservations')
    .select('reservation_id, client_id, client_name, project, inventory_code, seller_name')
    .eq('reservation_id', reservationId)
    .maybeSingle();

  return {
    '{client_name}':    (res as any)?.client_name    ?? '',
    '{reservation_id}': (res as any)?.reservation_id ?? '',
    '{project}':        (res as any)?.project         ?? '',
    '{unit}':           (res as any)?.inventory_code  ?? '',
    '{seller_name}':    (res as any)?.seller_name     ?? '',
  };
}

async function resolveClientVars(clientUuid: string): Promise<Record<string, string>> {
  const { data: c } = await adminClient
    .from('clients')
    .select('first_name, middle_name, last_name, property_specialist')
    .eq('id', clientUuid)
    .maybeSingle();

  const clientName = [(c as any)?.first_name, (c as any)?.middle_name, (c as any)?.last_name]
    .filter(Boolean).join(' ');

  return {
    '{client_name}':    clientName,
    '{reservation_id}': '',
    '{project}':        '',
    '{unit}':           '',
    '{seller_name}':    (c as any)?.property_specialist ?? '',
  };
}

function applyVars(text: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(k, v), text);
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // ── Manual / test mode: { to, subject, body, attachment? } ───────────────
    if (body.to) {
      const { to, subject, body: emailBody, attachment } = body as {
        to: string; subject: string; body: string;
        attachment?: Attachment;
      };
      if (!to || !subject || !emailBody) {
        return NextResponse.json({ error: 'Missing required fields: to, subject, body' }, { status: 400 });
      }
      const [accessToken, senderEmail] = await Promise.all([getAccessToken(), getSenderEmail()]);
      await sendViaGraph(
        accessToken, senderEmail,
        [to], [],
        subject,
        emailBody.replace(/\n/g, '<br>'),
        attachment ? [attachment] : undefined,
      );
      return NextResponse.json({ ok: true });
    }

    // ── Client mode: { document_key, client_uuid, attachment?, extra_vars? } ─────
    if (body.client_uuid) {
      const { document_key, client_uuid, attachment, extra_vars } = body as {
        document_key: string; client_uuid: string; attachment?: Attachment;
        extra_vars?: Record<string, string>;
      };
      const templates = await getEmailTemplates();
      const tpl = templates[document_key];
      if (!tpl)              return NextResponse.json({ error: `No template configured for "${document_key}"` }, { status: 400 });
      if (!tpl.enabled)      return NextResponse.json({ error: `Email template for "${document_key}" is disabled` }, { status: 400 });

      const [toEmails, ccEmails, baseVars, accessToken, senderEmail] = await Promise.all([
        resolveClientRoleEmails(tpl.to ?? [], client_uuid),
        resolveClientRoleEmails(tpl.cc ?? [], client_uuid),
        resolveClientVars(client_uuid),
        getAccessToken(),
        getSenderEmail(),
      ]);

      if (!toEmails.length) return NextResponse.json({ error: 'No To recipients resolved — check template role assignments' }, { status: 400 });

      const vars = { ...baseVars, ...(extra_vars ?? {}) };
      const subject  = applyVars(tpl.subject ?? '', vars);
      const htmlBody = applyVars((tpl.body ?? '').replace(/\n/g, '<br>'), vars);
      await sendViaGraph(accessToken, senderEmail, toEmails, ccEmails, subject, htmlBody, attachment ? [attachment] : undefined);
      return NextResponse.json({ ok: true, to: toEmails, cc: ccEmails });
    }

    // ── Auto mode: { document_key, reservation_id, attachment?, attachments? } ──
    const { document_key, reservation_id, attachment, attachments } = body as {
      document_key: string; reservation_id: string;
      attachment?: Attachment; attachments?: Attachment[];
    };
    if (!document_key || !reservation_id) {
      return NextResponse.json(
        { error: 'Missing required fields: document_key, reservation_id (or: to, subject, body)' },
        { status: 400 }
      );
    }

    const templates = await getEmailTemplates();
    const tpl = templates[document_key];
    if (!tpl) {
      return NextResponse.json({ error: `No template configured for "${document_key}"` }, { status: 400 });
    }
    if (tpl.enabled === false) {
      return NextResponse.json({ error: `Email template for "${document_key}" is disabled` }, { status: 400 });
    }

    const [toEmails, ccEmails, vars, accessToken, senderEmail] = await Promise.all([
      resolveRoleEmails(tpl.to ?? [], reservation_id),
      resolveRoleEmails(tpl.cc ?? [], reservation_id),
      resolveVars(reservation_id),
      getAccessToken(),
      getSenderEmail(),
    ]);

    if (!toEmails.length) {
      return NextResponse.json(
        { error: 'No To recipients resolved — check template role assignments' },
        { status: 400 }
      );
    }

    const subject  = applyVars(tpl.subject ?? '', vars);
    const htmlBody = applyVars((tpl.body ?? '').replace(/\n/g, '<br>'), vars);

    const allAttachments = attachments ?? (attachment ? [attachment] : undefined);
    await sendViaGraph(accessToken, senderEmail, toEmails, ccEmails, subject, htmlBody, allAttachments);
    return NextResponse.json({ ok: true, to: toEmails, cc: ccEmails });

  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Failed to send email' }, { status: 500 });
  }
}
