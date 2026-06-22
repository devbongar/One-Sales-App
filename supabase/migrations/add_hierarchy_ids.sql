-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add hierarchy ID columns to Salesperson + Brokers tables,
--            update RPCs to expose them, and add seller_id to commission RPC.
-- Run in Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Salesperson: add hierarchy ID columns ──────────────────────────────────

alter table public."Salesperson"
  add column if not exists "Sales Manager ID"       text,
  add column if not exists "Sales Director ID"      text,
  add column if not exists "Sales Division Head ID" text,
  add column if not exists "Sales Head ID"          text;

-- Backfill via self-join on name
update public."Salesperson" s
set "Sales Manager ID" = sm."Seller Id"
from public."Salesperson" sm
where s."Sales Manager" = sm."Seller Name";

update public."Salesperson" s
set "Sales Director ID" = sd."Seller Id"
from public."Salesperson" sd
where s."Sales Director" = sd."Seller Name";

update public."Salesperson" s
set "Sales Division Head ID" = sdh."Seller Id"
from public."Salesperson" sdh
where s."Sales Division Head" = sdh."Seller Name";

update public."Salesperson" s
set "Sales Head ID" = sh."Seller Id"
from public."Salesperson" sh
where s."Sales Head" = sh."Seller Name";

-- ── 2. Brokers: add hierarchy ID columns ─────────────────────────────────────

alter table public."Brokers"
  add column if not exists "Broker Network Associate ID" text,
  add column if not exists "Broker Network Officer ID"   text,
  add column if not exists "Sales Director Head ID"      text,
  add column if not exists "Sales Head ID"               text;

-- Backfill from Salesperson by name
update public."Brokers" b
set "Broker Network Associate ID" = sp."Seller Id"
from public."Salesperson" sp
where b."Broker Network Associate" = sp."Seller Name";

update public."Brokers" b
set "Broker Network Officer ID" = sp."Seller Id"
from public."Salesperson" sp
where b."Broker Network Officer" = sp."Seller Name";

update public."Brokers" b
set "Sales Director Head ID" = sp."Seller Id"
from public."Salesperson" sp
where b."Sales Director Head" = sp."Seller Name";

update public."Brokers" b
set "Sales Head ID" = sp."Seller Id"
from public."Salesperson" sp
where b."Sales Head" = sp."Seller Name";

-- ── 3. Update get_all_salespersons RPC ───────────────────────────────────────

drop function if exists public.get_all_salespersons();

create or replace function public.get_all_salespersons()
returns table (
  seller_name            text,
  seller_id              text,
  position_code          text,
  position_rank          text,
  sales_manager          text,
  sales_manager_id       text,
  sales_director         text,
  sales_director_id      text,
  sales_division_head    text,
  sales_division_head_id text,
  sales_head             text,
  sales_head_id          text,
  sales_team             text
)
language sql security definer as $$
  select
    "Seller Name"            as seller_name,
    "Seller Id"              as seller_id,
    "POSITION CODE"          as position_code,
    position_rank,
    "Sales Manager"          as sales_manager,
    "Sales Manager ID"       as sales_manager_id,
    "Sales Director"         as sales_director,
    "Sales Director ID"      as sales_director_id,
    "Sales Division Head"    as sales_division_head,
    "Sales Division Head ID" as sales_division_head_id,
    "Sales Head"             as sales_head,
    "Sales Head ID"          as sales_head_id,
    "Sales Team"             as sales_team
  from public."Salesperson"
  where "Seller Status" = 'Active'
  order by "Seller Name";
$$;

grant execute on function public.get_all_salespersons() to authenticated;
grant execute on function public.get_all_salespersons() to anon;

-- ── 4. Update get_broker_recruits RPC ────────────────────────────────────────

drop function if exists public.get_broker_recruits();

create function public.get_broker_recruits()
returns table (
  full_name                     text,
  broker_id                     text,
  business_unit                 text,
  broker_status                 text,
  broker_category               text,
  broker_type                   text,
  last_name                     text,
  first_name                    text,
  middle_name                   text,
  suffix                        text,
  email_address                 text,
  sales_head                    text,
  sales_head_id                 text,
  sales_director_head           text,
  sales_director_head_id        text,
  broker_network_officer        text,
  broker_network_officer_id     text,
  broker_network_associate      text,
  broker_network_associate_id   text,
  bir_registered_name           text,
  vat_registration_type         text,
  tin                           text,
  ewt_cwt_rate                  text,
  bir_cor_address               text
)
language sql security definer as $$
  select
    "Full Name"                     as full_name,
    "Broker ID"                     as broker_id,
    "Business Unit"                 as business_unit,
    "Broker Status"                 as broker_status,
    "Broker Category"               as broker_category,
    "Broker Type"                   as broker_type,
    "Last Name"                     as last_name,
    "First Name"                    as first_name,
    "Middle Name"                   as middle_name,
    "Suffix"                        as suffix,
    "Broker Email Address"          as email_address,
    "Sales Head"                    as sales_head,
    "Sales Head ID"                 as sales_head_id,
    "Sales Director Head"           as sales_director_head,
    "Sales Director Head ID"        as sales_director_head_id,
    "Broker Network Officer"        as broker_network_officer,
    "Broker Network Officer ID"     as broker_network_officer_id,
    "Broker Network Associate"      as broker_network_associate,
    "Broker Network Associate ID"   as broker_network_associate_id,
    "BIR Registered Name"           as bir_registered_name,
    "VAT Registration Type"         as vat_registration_type,
    "TIN"                           as tin,
    "EWT / CWT"                     as ewt_cwt_rate,
    "BIR COR Address"               as bir_cor_address
  from public."Brokers"
  order by "Full Name";
$$;

grant execute on function public.get_broker_recruits() to anon;
grant execute on function public.get_broker_recruits() to authenticated;

-- ── 5. Update get_commission_for_reservation RPC to return seller_id ─────────

drop function if exists public.get_commission_for_reservation(text);

create function public.get_commission_for_reservation(p_reservation_id text)
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
  seller_id             text,
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
    coalesce(s."Seller Id", b."Broker ID") as seller_id,
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
  left join public."Salesperson" s on s."Seller Name" = r.seller_name
  left join public."Brokers"     b on b."Full Name"   = r.seller_name
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
      and "Status" = 'Active'
    limit 1
  ) ct on true
  where r.reservation_id = p_reservation_id
  limit 1;
$$;

grant execute on function public.get_commission_for_reservation(text) to anon;
grant execute on function public.get_commission_for_reservation(text) to authenticated;
