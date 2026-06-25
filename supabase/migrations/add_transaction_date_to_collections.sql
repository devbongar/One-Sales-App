ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS transaction_date date;
