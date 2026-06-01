-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: fix get_seller_recruits — rename "Seller Code" → "Seller Id"
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.get_seller_recruits();

create function public.get_seller_recruits()
returns table (
  seller_name            text,
  seller_id              text,
  position_code          text,
  position_rank          text,
  seller_status          text,
  first_name             text,
  middle_name            text,
  last_name              text,
  email_address          text,
  hired_date             text,
  business_units         text,
  focus_project          text,
  sales_manager          text,
  sales_director         text,
  sales_division_head    text,
  sales_head             text,
  sales_team             text,
  payroll_code           text,
  payroll_account_number text,
  vat_registration_type  text,
  tin                    text,
  ewt_rate               text,
  bir_cor_address        text
)
language sql security definer as $$
  select
    "Seller Name"            as seller_name,
    "Seller Id"              as seller_id,
    "POSITION CODE"          as position_code,
    position_rank,
    "Seller Status"          as seller_status,
    "FIRST NAME"             as first_name,
    "MIDDLE NAME"            as middle_name,
    "LAST NAME"              as last_name,
    "Email Address"          as email_address,
    "Hired Date"             as hired_date,
    "Business Units"         as business_units,
    "Focus Project"          as focus_project,
    "Sales Manager"          as sales_manager,
    "Sales Director"         as sales_director,
    "Sales Division Head"    as sales_division_head,
    "Sales Head"             as sales_head,
    "Sales Team"             as sales_team,
    "Payroll Code"           as payroll_code,
    "Payroll Account Number" as payroll_account_number,
    "VAT Registration Type"  as vat_registration_type,
    "TIN"                    as tin,
    "EWT/WT Rate"            as ewt_rate,
    "BIR COR Address"        as bir_cor_address
  from public."Salesperson"
  order by "Seller Name";
$$;

grant execute on function public.get_seller_recruits() to anon;
