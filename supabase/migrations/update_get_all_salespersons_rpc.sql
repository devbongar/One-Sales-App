-- ─────────────────────────────────────────────────────────────
-- Migration: update get_all_salespersons RPC to include position_rank
-- Run this in your Supabase SQL editor
-- ─────────────────────────────────────────────────────────────

create or replace function public.get_all_salespersons()
returns table (
  seller_name        text,
  position_code      text,
  position_rank      text,
  sales_manager      text,
  sales_director     text,
  sales_division_head text
)
language sql
security definer
as $$
  select
    "Seller Name"        as seller_name,
    "POSITION CODE"      as position_code,
    position_rank,
    "Sales Manager"      as sales_manager,
    "Sales Director"     as sales_director,
    "Sales Division Head" as sales_division_head
  from public."Salesperson"
  where "Seller Status" = 'Active'
  order by "Seller Name";
$$;
