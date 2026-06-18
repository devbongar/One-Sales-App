import { buildPDFBase64, type ClientRecord } from '@/lib/pdf-generators';

/**
 * Fire client_registration email on create or update.
 * event: 'on_client_created' | 'on_client_updated'
 */
export async function triggerClientEmail(
  client: ClientRecord,
  event: 'on_client_created' | 'on_client_updated',
): Promise<void> {
  const res = await fetch('/api/settings');
  const settings = await res.json();
  let templates: Record<string, any> = {};
  try { templates = JSON.parse(settings.email_templates ?? '{}'); } catch {}

  const tpl = templates['client_registration'];
  if (!tpl?.enabled || !(tpl.triggers ?? []).includes(event)) return;

  const { base64, filename } = await buildPDFBase64('client_registration', null, client);

  await fetch('/api/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document_key: 'client_registration', client_uuid: client.id, attachment: { name: filename, base64 } }),
  });
}

/**
 * Fire emails for all templates whose trigger matches the given event.
 * All matching documents are bundled into ONE email with multiple PDF attachments.
 * The first matching template's recipients/subject/body is used for the envelope.
 * Call fire-and-forget: triggerEmails('on_booked', id).catch(() => {})
 */
export async function triggerEmails(trigger: string, reservationId: string): Promise<void> {
  const res = await fetch('/api/settings');
  const settings = await res.json();
  let templates: Record<string, any> = {};
  try { templates = JSON.parse(settings.email_templates ?? '{}'); } catch {}

  const matching = Object.entries(templates).filter(
    ([, tpl]) => (tpl as any).enabled && ((tpl as any).triggers ?? []).includes(trigger)
  );

  if (matching.length === 0) return;

  // Expand reservation_package into both constituent PDFs
  const pdfKeys: string[] = matching.flatMap(([docKey]) =>
    docKey === 'reservation_package' ? ['reservation_agreement', 'terms_of_payment'] : [docKey]
  );

  // Generate all PDFs in parallel
  const pdfResults = await Promise.allSettled(
    pdfKeys.map(docKey =>
      buildPDFBase64(docKey, reservationId).catch(e => {
        console.error(`[email-trigger] pdf-gen ${trigger}/${docKey}:`, e);
        return null;
      })
    )
  );

  const attachments = pdfResults
    .map(r => r.status === 'fulfilled' && r.value ? { name: r.value.filename, base64: r.value.base64 } : null)
    .filter(Boolean) as { name: string; base64: string }[];

  if (attachments.length === 0) return;

  // Use the first matching template for the email envelope (To, CC, subject, body)
  const [primaryDocKey] = matching[0];

  await fetch('/api/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      document_key: primaryDocKey,
      reservation_id: reservationId,
      attachments,
    }),
  }).catch(e => console.error(`[email-trigger] send ${trigger}:`, e));
}

/** Send using the configured template (role-based recipients, template vars). No PDF attached. */
export async function sendDocumentEmail(
  documentKey: string,
  reservationId: string,
): Promise<void> {
  const res = await fetch('/api/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document_key: documentKey, reservation_id: reservationId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? 'Failed to send email');
  }
}

/**
 * Fire sample_computation email on quotation save.
 * Uses client_uuid mode when available; falls back to direct clientEmail.
 */
export async function triggerQuotationEmail(
  pdfBase64: string,
  clientUuid: string | null,
  clientEmail: string | null,
  meta?: Record<string, string>,
): Promise<void> {
  const res = await fetch('/api/settings');
  const settings = await res.json();
  let templates: Record<string, any> = {};
  try { templates = JSON.parse(settings.email_templates ?? '{}'); } catch {}

  const tpl = templates['sample_computation'];
  if (!tpl?.enabled || !(tpl.triggers ?? []).includes('on_quotation_saved')) return;

  const filename = `SampleComputation_${Date.now()}.pdf`;
  const attachment = { name: filename, base64: pdfBase64 };

  if (clientUuid) {
    await fetch('/api/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_key: 'sample_computation', client_uuid: clientUuid, attachment, extra_vars: meta }),
    });
  } else if (clientEmail) {
    const subject = tpl.subject || 'Sample Computation';
    const rawBody = tpl.body || '';
    const vars = meta ?? {};
    const resolvedBody = Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(k, v), rawBody);
    const resolvedSubject = Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(k, v), subject);
    await fetch('/api/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: clientEmail, subject: resolvedSubject, body: resolvedBody, attachment }),
    });
  }
}

/** Generate PDF in-browser, then send with template recipients and PDF attached. */
export async function sendDocumentEmailWithPDF(
  documentKey: string,
  reservationId: string,
): Promise<void> {
  const { base64, filename } = await buildPDFBase64(documentKey, reservationId);
  const res = await fetch('/api/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document_key: documentKey, reservation_id: reservationId, attachment: { name: filename, base64 } }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? 'Failed to send email');
  }
}
