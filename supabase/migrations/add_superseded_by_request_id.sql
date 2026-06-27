-- Track which BRF request superseded each receivable line.
-- Allows the collection posting page to show only the immediately prior schedule
-- instead of accumulating lines from all historical BRFs.

ALTER TABLE receivables_database
  ADD COLUMN IF NOT EXISTS superseded_by_request_id text;
