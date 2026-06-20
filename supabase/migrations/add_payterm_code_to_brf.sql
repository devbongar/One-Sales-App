ALTER TABLE requests_and_inquiries
  ADD COLUMN IF NOT EXISTS new_payterm_code text;
