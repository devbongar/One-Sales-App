-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add broker accreditation columns + get_broker_recruits RPC
-- Most columns already exist in the Brokers table.
-- Only "Suffix" is new.
-- ─────────────────────────────────────────────────────────────────────────────

-- Add only the missing column
alter table public."Brokers"
  add column if not exists "Suffix" text;

-- ─── RPC: get_broker_recruits ─────────────────────────────────────────────────
drop function if exists public.get_broker_recruits();

create function public.get_broker_recruits()
returns table (
  full_name                text,
  broker_id                text,
  business_unit            text,
  broker_status            text,
  broker_category          text,
  broker_type              text,
  last_name                text,
  first_name               text,
  middle_name              text,
  suffix                   text,
  email_address            text,
  sales_head               text,
  sales_director_head      text,
  broker_network_officer   text,
  broker_network_associate text,
  bir_registered_name      text,
  vat_registration_type    text,
  tin                      text,
  ewt_cwt_rate             text,
  bir_cor_address          text
)
language sql security definer as $$
  select
    "Full Name"                     as full_name,
    "Broker ID"                     as broker_id,
    "Business Unit"                 as business_unit,
    "Status"                        as broker_status,
    "Broker Category"               as broker_category,
    "Broker Type"                   as broker_type,
    "Last Name"                     as last_name,
    "First Name"                    as first_name,
    "Middle Name"                   as middle_name,
    "Suffix"                        as suffix,
    "Broker Email Address"          as email_address,
    "Sales Head"                    as sales_head,
    "Sales Director Head"           as sales_director_head,
    "Broker Network Officer"        as broker_network_officer,
    "Broker Network Associate"      as broker_network_associate,
    "BIR Registered Name"           as bir_registered_name,
    "VAT Registration Type"         as vat_registration_type,
    "TIN"                           as tin,
    "EWT / CWT"                     as ewt_cwt_rate,
    "BIR COR Address"               as bir_cor_address
  from public."Brokers"
  order by "Full Name";
$$;

grant execute on function public.get_broker_recruits() to anon;
