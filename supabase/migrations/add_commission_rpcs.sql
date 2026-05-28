-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Sales Commission RPCs
-- Run in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── RPC 1: get_commission_summary ───────────────────────────────────────────
-- Returns all Approved reservations with commission rate + total commission
-- Joins Salesperson (In-house) OR Brokers table to resolve position_rank + seller_type
-- Then joins Commission_Tranching filtered by seller_type

drop function if exists public.get_commission_summary();

create function public.get_commission_summary()
returns table (
  reservation_id        text,
  client_name           text,
  project               text,
  tower                 text,
  floor                 text,
  unit_no               text,
  inventory_code        text,
  unit_type             text,
  product_type          text,
  seller_name           text,
  seller_type           text,
  position_rank         text,
  total_contract_price  numeric,
  net_list_price        numeric,
  commission_rate       numeric,
  total_commission      numeric,
  status                text,
  created_at            timestamptz
)
language sql security definer as $$
  select
    r.reservation_id,
    r.client_name,
    r.project,
    r.tower,
    r.floor,
    r.unit_no,
    r.inventory_code,
    r.unit_type,
    case when lower(r.unit_type) like '%parking%' then 'Parking' else 'Residential Unit' end as product_type,
    r.seller_name,
    case
      when s."Seller Name" is not null then 'In-house'
      when b."Full Name"   is not null then 'Broker'
      else null
    end as seller_type,
    coalesce(s.position_rank, b.position_rank) as position_rank,
    r.total_contract_price,
    r.net_list_price,
    ct."Commission Rate"::numeric                                       as commission_rate,
    r.net_list_price * ct."Commission Rate"::numeric / 100             as total_commission,
    r.status,
    r.created_at
  from public.reservations r
  left join public."Salesperson" s
    on s."Seller Name" = r.seller_name
  left join public."Brokers" b
    on b."Full Name" = r.seller_name
  left join lateral (
    select "Commission Rate"
    from public."Commission_Tranching"
    where "Project"       = r.project
      and "Position Rank" = coalesce(s.position_rank, b.position_rank)
      and "Product Type"  = case when lower(r.unit_type) like '%parking%' then 'Parking' else 'Residential Unit' end
      and "Seller Type"   = case
                              when s."Seller Name" is not null then 'In-house'
                              when b."Full Name"   is not null then 'Broker'
                              else null
                            end
      and "Status"        = 'Active'
    limit 1
  ) ct on true
  where r.status = 'Approved'
  order by r.created_at desc;
$$;


-- ─── RPC 2: get_commission_tranching_schedule ─────────────────────────────────
-- Returns the tranche release schedule filtered by seller_type

drop function if exists public.get_commission_tranching_schedule(text, text, text);
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
  order by "Tranche"::int;
$$;
