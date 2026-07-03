-- Migrate commission-related tables and RPCs from project name (text) to project_id.
--
-- Strategy (Path A — commission scope only):
--   - reservations.project stays as a text name for now (not changed here)
--   - Commission_Tranching already has project_id from prior migration
--   - broker_commission_overrides and commission_tranching_history get project_id added + backfilled
--   - All 3 commission RPCs resolve project name → project_id via the projects table
--     so that Commission_Tranching and broker_commission_overrides are joined by stable ID

-- ── 1. Add project_id to broker_commission_overrides ──────────────────────────

alter table public.broker_commission_overrides
  add column if not exists project_id text;

update public.broker_commission_overrides o
set project_id = p.project_id
from public.projects p
where p.name = o.project
  and o.project_id is null;

-- ── 2. Add project_id to commission_tranching_history ─────────────────────────

alter table public.commission_tranching_history
  add column if not exists project_id text;

update public.commission_tranching_history h
set project_id = p.project_id
from public.projects p
where p.name = h.project
  and h.project_id is null;

-- ── 3. get_commission_tranching_schedule ──────────────────────────────────────
-- Accepts p_project as a name string (backward compat).
-- Internally resolves to project_id and joins Commission_Tranching + overrides by ID.

drop function if exists public.get_commission_tranching_schedule(text, text, text, text, text);
drop function if exists public.get_commission_tranching_schedule(text, text, text, text);

create function public.get_commission_tranching_schedule(
  p_project       text,
  p_position_rank text,
  p_product_type  text,
  p_seller_type   text,
  p_broker_id     text default null
)
returns table (
  tranche                 int,
  percentage_collection   numeric,
  commission_release_rate numeric,
  commission_rate         numeric,
  seller_type             text
)
language sql security definer as $$
  with proj as (
    select project_id from public.projects where name = p_project limit 1
  )
  select
    ct."Tranche"::int                     as tranche,
    ct."Percentage Collection"::numeric   as percentage_collection,
    ct."Commission Release Rate"::numeric as commission_release_rate,
    coalesce(
      case
        when p_seller_type = 'Broker' and p_broker_id is not null then (
          select bo.commission_rate
          from public.broker_commission_overrides bo, proj
          where bo.broker_id     = p_broker_id
            and bo.project_id    = proj.project_id
            and bo.product_type  = p_product_type
            and bo.position_rank = p_position_rank
            and bo.status        = 'Active'
          limit 1
        )
      end,
      ct."Commission Rate"::numeric
    ) as commission_rate,
    ct."Seller Type" as seller_type
  from public."Commission_Tranching" ct, proj
  where ct.project_id      = proj.project_id
    and ct."Position Rank" = p_position_rank
    and ct."Product Type"  = p_product_type
    and ct."Seller Type"   = p_seller_type
    and ct."Status"        = 'Active'
    and ct.commission_type = (
      case when exists (
        select 1 from public."Commission_Tranching" ct2, proj
        where ct2.project_id      = proj.project_id
          and ct2."Position Rank" = p_position_rank
          and ct2."Product Type"  = p_product_type
          and ct2."Seller Type"   = p_seller_type
          and ct2."Status"        = 'Active'
          and ct2.commission_type = 'Special'
          and ct2.effectivity_start <= current_date
          and ct2.effectivity_end   >= current_date
      ) then 'Special' else 'Regular' end
    )
    and (
      ct.commission_type = 'Regular'
      or (ct.effectivity_start <= current_date and ct.effectivity_end >= current_date)
    )
  order by ct."Tranche"::int;
$$;

grant execute on function public.get_commission_tranching_schedule(text, text, text, text, text)
  to anon, authenticated;

-- ── 4. get_commission_for_reservation ────────────────────────────────────────
-- Joins projects table to resolve reservations.project (name) → project_id,
-- then matches Commission_Tranching and broker_commission_overrides by project_id.

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
    r.seller_id,
    case
      when s."Seller Name" is not null then 'In-house'
      when b."Full Name"   is not null then 'Broker'
      else null
    end as seller_type,
    coalesce(s.position_rank, b.position_rank) as position_rank,
    r.total_contract_price,
    r.net_list_price,
    coalesce(bo.override_rate, ct.std_rate) as commission_rate,
    r.net_list_price * coalesce(bo.override_rate, ct.std_rate) / 100 as total_commission,
    r.status,
    r.created_at
  from public.reservations r
  left join public.projects proj on proj.name = r.project
  left join public."Salesperson" s on s."Seller Id" = r.seller_id
  left join public."Brokers"     b on b."Broker ID" = r.seller_id
  left join lateral (
    select "Commission Rate"::numeric as std_rate
    from public."Commission_Tranching"
    where project_id      = proj.project_id
      and "Position Rank" = coalesce(s.position_rank, b.position_rank)
      and "Product Type"  = case when lower(r.unit_type) like '%parking%' then 'Parking' else 'Residential Unit' end
      and "Seller Type"   = case
                              when s."Seller Name" is not null then 'In-house'
                              when b."Full Name"   is not null then 'Broker'
                              else null
                            end
      and "Status"        = 'Active'
      and commission_type = (
        case when exists (
          select 1 from public."Commission_Tranching"
          where project_id      = proj.project_id
            and "Position Rank" = coalesce(s.position_rank, b.position_rank)
            and "Product Type"  = case when lower(r.unit_type) like '%parking%' then 'Parking' else 'Residential Unit' end
            and "Seller Type"   = case
                                    when s."Seller Name" is not null then 'In-house'
                                    when b."Full Name"   is not null then 'Broker'
                                    else null
                                  end
            and "Status"        = 'Active'
            and commission_type = 'Special'
            and effectivity_start <= current_date
            and effectivity_end   >= current_date
        ) then 'Special' else 'Regular' end
      )
      and (
        commission_type = 'Regular'
        or (effectivity_start <= current_date and effectivity_end >= current_date)
      )
    limit 1
  ) ct on true
  left join lateral (
    select commission_rate as override_rate
    from public.broker_commission_overrides
    where b."Full Name" is not null
      and broker_id     = r.seller_id
      and project_id    = proj.project_id
      and product_type  = case when lower(r.unit_type) like '%parking%' then 'Parking' else 'Residential Unit' end
      and position_rank = b.position_rank
      and status        = 'Active'
    limit 1
  ) bo on true
  where r.reservation_id = p_reservation_id
  limit 1;
$$;

grant execute on function public.get_commission_for_reservation(text) to authenticated, anon;

-- ── 5. get_commission_summary ─────────────────────────────────────────────────

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
    r.seller_id,
    case
      when s."Seller Name" is not null then 'In-house'
      when b."Full Name"   is not null then 'Broker'
      else null
    end as seller_type,
    coalesce(s.position_rank, b.position_rank) as position_rank,
    r.total_contract_price,
    r.net_list_price,
    coalesce(bo.override_rate, ct.std_rate) as commission_rate,
    r.net_list_price * coalesce(bo.override_rate, ct.std_rate) / 100 as total_commission,
    r.status,
    r.created_at
  from public.reservations r
  left join public.projects proj on proj.name = r.project
  left join public."Salesperson" s on s."Seller Id" = r.seller_id
  left join public."Brokers"     b on b."Broker ID" = r.seller_id
  left join lateral (
    select "Commission Rate"::numeric as std_rate
    from public."Commission_Tranching"
    where project_id      = proj.project_id
      and "Position Rank" = coalesce(s.position_rank, b.position_rank)
      and "Product Type"  = case when lower(r.unit_type) like '%parking%' then 'Parking' else 'Residential Unit' end
      and "Seller Type"   = case
                              when s."Seller Name" is not null then 'In-house'
                              when b."Full Name"   is not null then 'Broker'
                              else null
                            end
      and "Status"        = 'Active'
      and commission_type = (
        case when exists (
          select 1 from public."Commission_Tranching"
          where project_id      = proj.project_id
            and "Position Rank" = coalesce(s.position_rank, b.position_rank)
            and "Product Type"  = case when lower(r.unit_type) like '%parking%' then 'Parking' else 'Residential Unit' end
            and "Seller Type"   = case
                                    when s."Seller Name" is not null then 'In-house'
                                    when b."Full Name"   is not null then 'Broker'
                                    else null
                                  end
            and "Status"        = 'Active'
            and commission_type = 'Special'
            and effectivity_start <= current_date
            and effectivity_end   >= current_date
        ) then 'Special' else 'Regular' end
      )
      and (
        commission_type = 'Regular'
        or (effectivity_start <= current_date and effectivity_end >= current_date)
      )
    limit 1
  ) ct on true
  left join lateral (
    select commission_rate as override_rate
    from public.broker_commission_overrides
    where b."Full Name" is not null
      and broker_id     = r.seller_id
      and project_id    = proj.project_id
      and product_type  = case when lower(r.unit_type) like '%parking%' then 'Parking' else 'Residential Unit' end
      and position_rank = b.position_rank
      and status        = 'Active'
    limit 1
  ) bo on true
  where r.status in ('Booked', 'Reserved')
  order by r.created_at desc;
$$;

grant execute on function public.get_commission_summary() to authenticated, anon;

notify pgrst, 'reload schema';
