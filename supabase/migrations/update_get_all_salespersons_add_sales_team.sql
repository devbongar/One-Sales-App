-- Migration: update get_all_salespersons to include seller_id, sales_head, and sales_team

drop function if exists public.get_all_salespersons();

create or replace function public.get_all_salespersons()
returns table (
  seller_name          text,
  seller_id            text,
  position_code        text,
  position_rank        text,
  sales_manager        text,
  sales_director       text,
  sales_division_head  text,
  sales_head           text,
  sales_team           text
)
language sql
security definer
as $$
  select
    "Seller Name"          as seller_name,
    "Seller Id"            as seller_id,
    "POSITION CODE"        as position_code,
    position_rank,
    "Sales Manager"        as sales_manager,
    "Sales Director"       as sales_director,
    "Sales Division Head"  as sales_division_head,
    "Sales Head"           as sales_head,
    "Sales Team"           as sales_team
  from public."Salesperson"
  where "Seller Status" = 'Active'
  order by "Seller Name";
$$;

grant execute on function public.get_all_salespersons() to authenticated;
grant execute on function public.get_all_salespersons() to anon;
