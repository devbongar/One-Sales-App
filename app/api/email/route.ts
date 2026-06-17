import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(req: NextRequest) {
  const { to, subject, body } = await req.json();

  if (!to || !subject || !body) {
    return NextResponse.json({ error: 'Missing required fields: to, subject, body' }, { status: 400 });
  }

  const user = process.env.OUTLOOK_EMAIL;
  const pass = process.env.OUTLOOK_PASSWORD;

  if (!user || !pass) {
    return NextResponse.json({ error: 'OUTLOOK_EMAIL or OUTLOOK_PASSWORD not configured' }, { status: 500 });
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    auth: { user, pass },
    tls: { ciphers: 'SSLv3' },
  });

  try {
    await transporter.sendMail({
      from: `"One Sales App" <${user}>`,
      to,
      subject,
      html: body,
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Failed to send email' }, { status: 500 });
  }
}
