-- Update get_all_brokers to include full_name and broker_network_associate
-- (seller_name kept for backward compat with commission code in lib/broker.ts)

drop function if exists public.get_all_brokers();

create function public.get_all_brokers()
returns table (
  seller_name              text,
  full_name                text,
  broker_id                text,
  bir_registered_name      text,
  broker_network_associate text,
  broker_network_officer   text,
  sales_director_head      text,
  sales_head               text,
  position_rank            text
)
language sql security definer as $$
  select
    "Full Name"                   as seller_name,
    "Full Name"                   as full_name,
    "Broker ID"                   as broker_id,
    "BIR Registered Name"         as bir_registered_name,
    "Broker Network Associate"    as broker_network_associate,
    "Broker Network Officer"      as broker_network_officer,
    "Sales Director Head"         as sales_director_head,
    "Sales Head"                  as sales_head,
    position_rank
  from public."Brokers"
  where "Status" = 'Active'
    and "Full Name" is not null
  order by "Full Name";
$$;

grant execute on function public.get_all_brokers() to anon, authenticated;
