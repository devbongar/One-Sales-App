-- Add BRF approval workflow columns to requests_and_inquiries
-- Only 'Payment Schedule Restructuring' and 'Change of Unit' use these columns.
-- All other request types leave them null.

ALTER TABLE requests_and_inquiries
  ADD COLUMN IF NOT EXISTS status              text DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS approval_status     text,      -- Pending | Approved | Disapproved
  ADD COLUMN IF NOT EXISTS resolution_status   text,      -- Resolved | Rejected
  ADD COLUMN IF NOT EXISTS approved_by         text,
  ADD COLUMN IF NOT EXISTS date_approved       date,
  ADD COLUMN IF NOT EXISTS processed_at        timestamptz,
  ADD COLUMN IF NOT EXISTS requested_by        text,
  -- Change of Unit payload
  ADD COLUMN IF NOT EXISTS new_inventory_code  text,
  -- Payment Schedule Restructuring payload (filled at approval time by AM)
  ADD COLUMN IF NOT EXISTS new_payterm_scheme  text,
  ADD COLUMN IF NOT EXISTS new_term_months     integer,
  ADD COLUMN IF NOT EXISTS remaining_balance   numeric;
