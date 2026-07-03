-- Helper RPCs for commission chain lookup — avoids PostgREST column-name-with-spaces issues

create or replace function public.get_salesperson_hierarchy(p_seller_id text)
returns table (
  seller_name            text,
  seller_id              text,
  position_rank          text,
  sales_manager          text,
  sales_manager_id       text,
  sales_director         text,
  sales_director_id      text,
  sales_division_head    text,
  sales_division_head_id text,
  sales_head             text,
  sales_head_id          text
)
language sql security definer as $$
  select
    "Seller Name"            as seller_name,
    "Seller Id"              as seller_id,
    position_rank,
    "Sales Manager"          as sales_manager,
    "Sales Manager ID"       as sales_manager_id,
    "Sales Director"         as sales_director,
    "Sales Director ID"      as sales_director_id,
    "Sales Division Head"    as sales_division_head,
    "Sales Division Head ID" as sales_division_head_id,
    "Sales Head"             as sales_head,
    "Sales Head ID"          as sales_head_id
  from public."Salesperson"
  where "Seller Id" = p_seller_id
  limit 1;
$$;
grant execute on function public.get_salesperson_hierarchy(text) to authenticated;
grant execute on function public.get_salesperson_hierarchy(text) to anon;

-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.get_broker_hierarchy(p_broker_id text)
returns table (
  broker_id                   text,
  broker_network_officer      text,
  broker_network_officer_id   text,
  sales_director              text,
  sales_director_id           text,
  sales_director_head         text,
  sales_director_head_id      text,
  sales_head                  text,
  sales_head_id               text
)
language sql security definer as $$
  select
    "Broker ID"                  as broker_id,
    "Broker Network Officer"     as broker_network_officer,
    "Broker Network Officer ID"  as broker_network_officer_id,
    "Sales Director"             as sales_director,
    "Sales Director ID"          as sales_director_id,
    "Sales Director Head"        as sales_director_head,
    "Sales Director Head ID"     as sales_director_head_id,
    "Sales Head"                 as sales_head,
    "Sales Head ID"              as sales_head_id
  from public."Brokers"
  where "Broker ID" = p_broker_id
  limit 1;
$$;
grant execute on function public.get_broker_hierarchy(text) to authenticated;
grant execute on function public.get_broker_hierarchy(text) to anon;

notify pgrst, 'reload schema';
