-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add Sales Head column to Salesperson table and update RPC
-- Run in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add column
ALTER TABLE public."Salesperson"
  ADD COLUMN IF NOT EXISTS "Sales Head" text;

-- 2. Prefill all existing rows
UPDATE public."Salesperson"
  SET "Sales Head" = 'Amy Rose Tagalicud'
  WHERE "Sales Head" IS NULL;

-- 3. Update get_all_salespersons RPC to include sales_head
drop function if exists public.get_all_salespersons();

create function public.get_all_salespersons()
returns table (
  seller_name          text,
  position_code        text,
  position_rank        text,
  seller_group         text,
  sales_manager        text,
  sales_director       text,
  sales_division_head  text,
  sales_head           text
)
language sql
security definer
as $$
  select
    "Seller Name"          as seller_name,
    "POSITION CODE"        as position_code,
    position_rank,
    "Sales Team"           as seller_group,
    "Sales Manager"        as sales_manager,
    "Sales Director"       as sales_director,
    "Sales Division Head"  as sales_division_head,
    "Sales Head"           as sales_head
  from public."Salesperson"
  where "Seller Status" = 'Active'
  order by "Seller Name";
$$;
