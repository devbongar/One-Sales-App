import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// ── Microsoft Graph send ──────────────────────────────────────────────────────

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

async function sendInviteEmail(to: string, sellerName: string, inviteLink: string): Promise<void> {
  const [token, sender] = await Promise.all([getGraphToken(), getSenderEmail()]);

  const firstName = sellerName.split(' ')[0];
  const html = `
    <p>Hi ${firstName},</p>
    <p>Your One Sales App account is ready. Click the button below to set your password and get started.</p>
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

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { seller_names } = await req.json() as { seller_names: string[] };
    if (!Array.isArray(seller_names) || seller_names.length === 0) {
      return NextResponse.json({ error: 'seller_names array is required' }, { status: 400 });
    }

    const results: { seller_name: string; status: 'invited' | 'skipped' | 'error'; reason?: string }[] = [];

    for (const sellerName of seller_names) {
      try {
        // Fetch seller record
        const { data: sp, error: spErr } = await adminClient
          .from('Salesperson')
          .select('"Email Address", "Seller Id", app_role_id')
          .eq('Seller Name', sellerName)
          .maybeSingle();

        if (spErr || !sp) {
          results.push({ seller_name: sellerName, status: 'error', reason: spErr?.message ?? 'Seller not found' });
          continue;
        }

        const email: string | null      = (sp as any)['Email Address'];
        const sellerCode: string | null = (sp as any)['Seller Id'];
        const appRoleId: number | null  = (sp as any)['app_role_id'];

        if (!email) {
          results.push({ seller_name: sellerName, status: 'skipped', reason: 'No email address' });
          continue;
        }

        // Check if account already exists
        const { data: existing } = await adminClient
          .from('profiles')
          .select('id')
          .eq('email', email)
          .maybeSingle();

        if (existing) {
          results.push({ seller_name: sellerName, status: 'skipped', reason: 'Account already exists' });
          continue;
        }

        const origin     = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? '';
        const redirectTo = `${origin}/seller-onboarding`;

        // Generate invite link — creates the user and returns the magic link
        const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
          type:       'invite',
          email,
          options:    { data: { full_name: sellerName }, redirectTo },
        });

        if (linkErr || !linkData?.properties?.action_link) {
          results.push({ seller_name: sellerName, status: 'error', reason: linkErr?.message ?? 'Failed to generate invite link' });
          continue;
        }

        const inviteLink = linkData.properties.action_link;
        const userId     = linkData.user.id;

        // Upsert profile with role + seller link
        await adminClient.from('profiles').upsert({
          id:        userId,
          email,
          full_name: sellerName,
          role_id:   appRoleId,
          seller_id: sellerCode,
        }, { onConflict: 'id' });

        // Send invite via Microsoft Graph (bypasses Supabase mailer)
        await sendInviteEmail(email, sellerName, inviteLink);

        results.push({ seller_name: sellerName, status: 'invited' });

      } catch (e: any) {
        results.push({ seller_name: sellerName, status: 'error', reason: e.message });
      }
    }

    const invited = results.filter(r => r.status === 'invited').length;
    return NextResponse.json({ ok: true, invited, results });

  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Failed to create accounts' }, { status: 500 });
  }
}
