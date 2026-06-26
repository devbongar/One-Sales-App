-- Create a sequence for ticket IDs
CREATE SEQUENCE IF NOT EXISTS brf_ticket_seq START 1;

-- Add ticket_id column
ALTER TABLE requests_and_inquiries
  ADD COLUMN IF NOT EXISTS ticket_id TEXT UNIQUE;

-- Trigger function: auto-assign ticket_id on insert
CREATE OR REPLACE FUNCTION set_brf_ticket_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ticket_id IS NULL THEN
    NEW.ticket_id := 'BRF-' || LPAD(nextval('brf_ticket_seq')::text, 8, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_brf_ticket_id ON requests_and_inquiries;
CREATE TRIGGER trg_set_brf_ticket_id
  BEFORE INSERT ON requests_and_inquiries
  FOR EACH ROW EXECUTE FUNCTION set_brf_ticket_id();

-- Backfill existing rows (oldest first by created_at)
UPDATE requests_and_inquiries
SET ticket_id = 'BRF-' || LPAD(nextval('brf_ticket_seq')::text, 8, '0')
WHERE ticket_id IS NULL;
