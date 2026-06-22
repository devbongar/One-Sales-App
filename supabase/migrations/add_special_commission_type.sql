-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Special Commission Rate support on Commission_Tranching
-- Run in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- Add columns to Commission_Tranching
ALTER TABLE public."Commission_Tranching"
  ADD COLUMN IF NOT EXISTS commission_type   text NOT NULL DEFAULT 'Regular',
  ADD COLUMN IF NOT EXISTS effectivity_start date,
  ADD COLUMN IF NOT EXISTS effectivity_end   date;

-- Backfill existing rows as Regular
UPDATE public."Commission_Tranching"
  SET commission_type = 'Regular'
  WHERE commission_type IS NULL OR commission_type = '';

-- ─── Update RPC: get_commission_tranching_schedule ────────────────────────────
-- Prefers Special rows when an active special exists for today's date.
-- Falls back to Regular otherwise.

drop function if exists public.get_commission_tranching_schedule(text, text, text, text);

create function public.get_commission_tranching_schedule(
  p_project       text,
  p_position_rank text,
  p_product_type  text,
  p_seller_type   text
)
returns table (
  tranche                 int,
  percentage_collection   numeric,
  commission_release_rate numeric,
  commission_rate         numeric,
  seller_type             text
)
language sql security definer as $$
  select
    "Tranche"::int                      as tranche,
    "Percentage Collection"::numeric    as percentage_collection,
    "Commission Release Rate"::numeric  as commission_release_rate,
    "Commission Rate"::numeric          as commission_rate,
    "Seller Type"                       as seller_type
  from public."Commission_Tranching"
  where "Project"       = p_project
    and "Position Rank" = p_position_rank
    and "Product Type"  = p_product_type
    and "Seller Type"   = p_seller_type
    and "Status"        = 'Active'
    and commission_type = (
      case
        when exists (
          select 1
          from public."Commission_Tranching"
          where "Project"       = p_project
            and "Position Rank" = p_position_rank
            and "Product Type"  = p_product_type
            and "Seller Type"   = p_seller_type
            and "Status"        = 'Active'
            and commission_type = 'Special'
            and effectivity_start <= current_date
            and effectivity_end   >= current_date
        ) then 'Special'
        else 'Regular'
      end
    )
    and (
      commission_type = 'Regular'
      or (effectivity_start <= current_date and effectivity_end >= current_date)
    )
  order by "Tranche"::int;
$$;
