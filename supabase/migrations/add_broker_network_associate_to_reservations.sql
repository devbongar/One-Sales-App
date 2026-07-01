-- Add BNA name + ID columns to reservations.
-- Idempotent: safe to re-run.

alter table public.reservations
  add column if not exists broker_network_associate    text,
  add column if not exists broker_network_associate_id text;

notify pgrst, 'reload schema';
