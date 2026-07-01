-- Add balance_receivables as a stored generated column.
-- Always in sync: recomputed automatically on every INSERT or UPDATE to the row.

alter table public.receivables_database
  add column if not exists balance_receivables numeric(14,2)
    generated always as (coalesce(total_amount_due, 0) - coalesce(amount_paid, 0)) stored;
