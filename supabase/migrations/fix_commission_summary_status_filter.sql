-- Fix get_commission_summary: previous filter used 'Approved'/'Reserved-paid'
-- which don't exist in the reservations table. Actual statuses are 'Booked'
-- and 'Reserved'. Cancelled reservations are excluded from commission summary.
--
-- This also keeps the project_id-based join from migrate_commission_to_project_id.sql.

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
