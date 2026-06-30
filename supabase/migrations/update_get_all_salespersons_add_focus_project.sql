-- Migration: add focus_project to get_all_salespersons RPC

drop function if exists public.get_all_salespersons();

create or replace function public.get_all_salespersons()
returns table (
  seller_name            text,
  seller_id              text,
  position_code          text,
  position_rank          text,
  seller_group           text,
  focus_project          text,
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
    "Sales Team"             as seller_group,
    "Focus Project"          as focus_project,
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
