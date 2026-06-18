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

  await Promise.allSettled(
    matching.map(([docKey]) =>
      sendDocumentEmailWithPDF(docKey, reservationId).catch(e =>
        console.error(`[email-trigger] ${trigger}/${docKey}:`, e)
      )
    )
  );
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
