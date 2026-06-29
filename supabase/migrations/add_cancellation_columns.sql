-- Add cancellation tracking columns to reservations
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS amd_rejected_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by      TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
