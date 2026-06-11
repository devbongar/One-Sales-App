-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add unique constraint on reservation_id for upsert support
-- Run in Supabase SQL Editor BEFORE running fix_save_rpcs_upsert_and_delete.sql
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.atty_in_fact
  add constraint atty_in_fact_reservation_id_key unique (reservation_id);

alter table public.co_owners
  add constraint co_owners_reservation_id_key unique (reservation_id);

alter table public.spouse_info
  add constraint spouse_info_reservation_id_key unique (reservation_id);
