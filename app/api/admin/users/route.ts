import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ── Microsoft Graph helpers ───────────────────────────────────────────────────

async function getGraphToken(): Promise<string> {
  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     process.env.AZURE_CLIENT_ID!,
        client_secret: process.env.AZURE_CLIENT_SECRET!,
        scope:         'https://graph.microsoft.com/.default',
      }),
    }
  );
  if (!res.ok) throw new Error(`Graph token failed: ${await res.text()}`);
  return (await res.json()).access_token as string;
}

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

async function sendInviteEmail(to: string, fullName: string, inviteLink: string): Promise<void> {
  const [token, sender] = await Promise.all([getGraphToken(), getSenderEmail()]);
  const firstName = fullName.split(' ')[0];
  const html = `
    <p>Hi ${firstName},</p>
    <p>An account has been created for you on One Sales App. Click the button below to set your password and get started.</p>
    <p style="margin:24px 0;">
      <a href="${inviteLink}"
        style="background:#C03D25;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;">
        Accept Invitation
      </a>
    </p>
    <p style="color:#8E8E93;font-size:12px;">If you did not expect this email, you can safely ignore it.</p>
  `;
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${sender}/sendMail`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject:      'You\'re invited to One Sales App',
          body:         { contentType: 'HTML', content: html },
          toRecipients: [{ emailAddress: { address: to } }],
        },
        saveToSentItems: true,
      }),
    }
  );
  if (!res.ok) throw new Error(`Graph send failed: ${await res.text()}`);
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  const { data, error } = await adminClient
    .from('profiles')
    .select('id, full_name, display_name, email, role_id, seller_id, created_at, access_roles(role_name)')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data ?? [] });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { email, full_name, display_name, role_id } = await req.json();

    if (!email || !full_name) {
      return NextResponse.json({ error: 'Email and full name are required' }, { status: 400 });
    }

    const origin     = process.env.NEXT_PUBLIC_APP_URL ?? req.headers.get('origin') ?? '';
    const redirectTo = `${origin}/set-password`;

    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type:    'invite',
      email,
      options: { data: { full_name }, redirectTo },
    });

    if (linkErr || !linkData?.properties?.action_link) {
      return NextResponse.json({ error: linkErr?.message ?? 'Failed to generate invite link' }, { status: 400 });
    }

    const inviteLink = linkData.properties.action_link;
    const userId     = linkData.user.id;

    await adminClient.from('profiles')
      .update({ full_name, display_name: display_name ?? null, role_id: role_id ?? null })
      .eq('id', userId);

    await sendInviteEmail(email, full_name, inviteLink);

    return NextResponse.json({ user: { id: userId, email } }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Server error' }, { status: 500 });
  }
}
