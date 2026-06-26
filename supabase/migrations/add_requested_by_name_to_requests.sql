ALTER TABLE requests_and_inquiries
  ADD COLUMN IF NOT EXISTS requested_by_name TEXT;
