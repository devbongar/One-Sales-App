import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

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

export async function POST(req: NextRequest) {
  try {
    const { email, full_name } = await req.json();
    if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 });

    const origin     = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? '';
    const redirectTo = `${origin}/set-password`;

    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type:    'recovery',
      email,
      options: { redirectTo },
    });

    if (linkErr || !linkData?.properties?.action_link) {
      return NextResponse.json({ error: linkErr?.message ?? 'Failed to generate invite link' }, { status: 400 });
    }

    const inviteLink = linkData.properties.action_link;
    const firstName  = (full_name ?? email).split(' ')[0];
    const html = `
      <p>Hi ${firstName},</p>
      <p>Here is your invitation to One Sales App. Click the button below to set your password and get started.</p>
      <p style="margin:24px 0;">
        <a href="${inviteLink}"
          style="background:#C03D25;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;">
          Accept Invitation
        </a>
      </p>
      <p style="color:#8E8E93;font-size:12px;">If you did not expect this email, you can safely ignore it.</p>
    `;

    const [token, sender] = await Promise.all([getGraphToken(), getSenderEmail()]);
    const mailRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${sender}/sendMail`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            subject:      'You\'re invited to One Sales App',
            body:         { contentType: 'HTML', content: html },
            toRecipients: [{ emailAddress: { address: email } }],
          },
          saveToSentItems: true,
        }),
      }
    );
    if (!mailRes.ok) throw new Error(`Graph send failed: ${await mailRes.text()}`);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Server error' }, { status: 500 });
  }
}
