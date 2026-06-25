-- Add amd_approved_at and booked_at date columns to reservations

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS amd_approved_at date,
  ADD COLUMN IF NOT EXISTS booked_at       date;

-- ── Trigger 1: stamp amd_approved_at when booking_review_status → 'amd-approved' ──

CREATE OR REPLACE FUNCTION stamp_amd_approved_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.booking_review_status = 'amd-approved'
     AND (OLD.booking_review_status IS DISTINCT FROM 'amd-approved') THEN
    NEW.amd_approved_at = CURRENT_DATE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stamp_amd_approved_at ON reservations;
CREATE TRIGGER trg_stamp_amd_approved_at
  BEFORE UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION stamp_amd_approved_at();

-- ── Trigger 2: stamp booked_at = GREATEST(amd_approved_at, date_of_1st_dp) when status → 'Booked' ──

CREATE OR REPLACE FUNCTION stamp_booked_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'Booked'
     AND (OLD.status IS DISTINCT FROM 'Booked') THEN
    NEW.booked_at = GREATEST(NEW.amd_approved_at, NEW.date_of_1st_dp::date);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stamp_booked_at ON reservations;
CREATE TRIGGER trg_stamp_booked_at
  BEFORE UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION stamp_booked_at();
