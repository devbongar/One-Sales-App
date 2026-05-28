-- RPC: get_all_brokers
-- Returns broker list for the Sales Commission search

drop function if exists public.get_all_brokers();

create function public.get_all_brokers()
returns table (
  seller_name            text,
  bir_registered_name    text,
  broker_network_officer text,
  sales_director_head    text,
  sales_head             text,
  position_rank          text
)
language sql security definer as $$
  select
    "Full Name"                   as seller_name,
    "BIR Registered Name"         as bir_registered_name,
    "Broker Network Officer"      as broker_network_officer,
    "Sales Director Head"         as sales_director_head,
    "Sales Head"                  as sales_head,
    position_rank
  from public."Brokers"
  where "Status" = 'Active'
    and "Full Name" is not null
  order by "Full Name";
$$;
