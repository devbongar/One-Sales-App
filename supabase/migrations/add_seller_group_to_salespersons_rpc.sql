-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add seller_group to get_all_salespersons RPC
-- Run in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.get_all_salespersons();

create function public.get_all_salespersons()
returns table (
  seller_name          text,
  position_code        text,
  position_rank        text,
  seller_group         text,
  sales_manager        text,
  sales_director       text,
  sales_division_head  text
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
    "Sales Division Head"  as sales_division_head
  from public."Salesperson"
  where "Seller Status" = 'Active'
  order by "Seller Name";
$$;
