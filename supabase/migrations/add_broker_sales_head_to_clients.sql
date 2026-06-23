-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add broker_sales_head to clients table
--            update get_all_brokers RPC to return broker_network_associate
-- Run in Supabase SQL Editor.
--
-- NOTE: save_client and update_client RPCs must also be updated manually in
-- the Supabase dashboard to add p_broker_sales_head parameter and
-- INSERT/SET broker_sales_head = p_broker_sales_head.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Add column ─────────────────────────────────────────────────────────────

alter table public.clients
  add column if not exists broker_sales_head text;

-- ── 2. Update get_all_brokers to include broker_network_associate ─────────────

drop function if exists public.get_all_brokers();

create function public.get_all_brokers()
returns table (
  seller_name              text,
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

grant execute on function public.get_all_brokers() to authenticated;
grant execute on function public.get_all_brokers() to anon;
