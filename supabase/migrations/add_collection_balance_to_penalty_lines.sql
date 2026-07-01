-- Add collection and balance columns to penalty_lines.
-- Note: payment_status already exists and covers "status".
-- balance is a stored generated column: penalty_amount - collection.

alter table public.penalty_lines
  add column if not exists collection numeric(14,2) default 0;

alter table public.penalty_lines
  add column if not exists balance numeric(14,2)
    generated always as (coalesce(penalty_amount, 0) - coalesce(collection, 0)) stored;
