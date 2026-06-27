-- Store computed new-unit financials at BRF submission time so previews
-- always show exactly what the submitter saw — no re-derivation needed.
-- Applies to both Change of Unit and Payment Schedule Restructuring.

ALTER TABLE requests_and_inquiries
  ADD COLUMN IF NOT EXISTS new_list_price   numeric,
  ADD COLUMN IF NOT EXISTS new_promo_amt    numeric,
  ADD COLUMN IF NOT EXISTS new_employee_amt numeric,
  ADD COLUMN IF NOT EXISTS new_payterm_amt  numeric,
  ADD COLUMN IF NOT EXISTS new_hic_amt      numeric,
  ADD COLUMN IF NOT EXISTS new_nlp          numeric,
  ADD COLUMN IF NOT EXISTS new_vat          numeric,
  ADD COLUMN IF NOT EXISTS new_oc           numeric,
  ADD COLUMN IF NOT EXISTS new_tcp          numeric;
