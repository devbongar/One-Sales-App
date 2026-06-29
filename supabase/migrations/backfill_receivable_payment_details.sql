-- Backfill payment detail columns on receivables_database from the most recent
-- collection per line. Overwrites all Paid/Partial lines.
UPDATE receivables_database rd
SET
  mode_of_payment            = latest.mode_of_payment,
  acknowledgement_receipt_no = latest.acknowledgement_receipt_no,
  sales_invoice_number       = latest.sales_invoice_number,
  posting_date               = latest.posting_date,
  check_no                   = latest.check_no,
  check_date                 = latest.check_date
FROM (
  SELECT DISTINCT ON (ca.receivable_line_id)
    ca.receivable_line_id,
    c.mode_of_payment,
    c.acknowledgement_receipt_no,
    c.sales_invoice_number,
    c.posting_date,
    c.check_no,
    c.check_date
  FROM collection_applications ca
  JOIN collections c ON c.id = ca.collection_id
  ORDER BY ca.receivable_line_id, c.posting_date DESC, c.created_at DESC
) latest
WHERE rd.id::text = latest.receivable_line_id
  AND rd.payment_status IN ('Paid', 'Partial');
