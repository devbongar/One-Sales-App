ALTER TABLE receivables_database
  ADD COLUMN IF NOT EXISTS transaction_date date;

-- Backfill transaction_date from the most recent collection per line
UPDATE receivables_database rd
SET
  transaction_date           = latest.transaction_date,
  posting_date               = latest.posting_date,
  mode_of_payment            = latest.mode_of_payment,
  acknowledgement_receipt_no = latest.acknowledgement_receipt_no,
  sales_invoice_number       = latest.sales_invoice_number,
  check_no                   = latest.check_no,
  check_date                 = latest.check_date
FROM (
  SELECT DISTINCT ON (ca.receivable_line_id)
    ca.receivable_line_id,
    c.transaction_date,
    c.posting_date,
    c.mode_of_payment,
    c.acknowledgement_receipt_no,
    c.sales_invoice_number,
    c.check_no,
    c.check_date
  FROM collection_applications ca
  JOIN collections c ON c.id = ca.collection_id
  ORDER BY ca.receivable_line_id, c.posting_date DESC, c.created_at DESC
) latest
WHERE rd.id::text = latest.receivable_line_id
  AND rd.payment_status IN ('Paid', 'Partial');
