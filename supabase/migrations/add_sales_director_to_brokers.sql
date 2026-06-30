-- Add Sales Director columns to Brokers table
alter table public."Brokers"
  add column if not exists "Sales Director"    text,
  add column if not exists "Sales Director ID" text;

-- ─── Update get_all_brokers RPC ───────────────────────────────────────────────
drop function if exists public.get_all_brokers();

create function public.get_all_brokers()
returns table (
  seller_name                  text,
  full_name                    text,
  broker_id                    text,
  bir_registered_name          text,
  broker_network_associate     text,
  broker_network_associate_id  text,
  broker_network_officer       text,
  broker_network_officer_id    text,
  sales_director               text,
  sales_director_id            text,
  sales_director_head          text,
  sales_director_head_id       text,
  sales_head                   text,
  sales_head_id                text,
  position_rank                text
)
language sql security definer as $$
  select
    "Full Name"                   as seller_name,
    "Full Name"                   as full_name,
    "Broker ID"                   as broker_id,
    "BIR Registered Name"         as bir_registered_name,
    "Broker Network Associate"    as broker_network_associate,
    "Broker Network Associate ID" as broker_network_associate_id,
    "Broker Network Officer"      as broker_network_officer,
    "Broker Network Officer ID"   as broker_network_officer_id,
    "Sales Director"              as sales_director,
    "Sales Director ID"           as sales_director_id,
    "Sales Director Head"         as sales_director_head,
    "Sales Director Head ID"      as sales_director_head_id,
    "Sales Head"                  as sales_head,
    "Sales Head ID"               as sales_head_id,
    position_rank
  from public."Brokers"
  where "Status" = 'Active'
    and "Full Name" is not null
  order by "Full Name";
$$;

grant execute on function public.get_all_brokers() to anon, authenticated;

-- ─── Update get_broker_recruits RPC ──────────────────────────────────────────
drop function if exists public.get_broker_recruits();

create function public.get_broker_recruits()
returns table (
  full_name                    text,
  broker_id                    text,
  business_unit                text,
  broker_status                text,
  broker_category              text,
  broker_type                  text,
  last_name                    text,
  first_name                   text,
  middle_name                  text,
  suffix                       text,
  email_address                text,
  sales_head                   text,
  sales_head_id                text,
  sales_director_head          text,
  sales_director_head_id       text,
  sales_director               text,
  sales_director_id            text,
  broker_network_officer       text,
  broker_network_officer_id    text,
  broker_network_associate     text,
  broker_network_associate_id  text,
  bir_registered_name          text,
  vat_registration_type        text,
  tin                          text,
  ewt_cwt_rate                 text,
  bir_cor_address              text
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
    "Sales Head ID"                 as sales_head_id,
    "Sales Director Head"           as sales_director_head,
    "Sales Director Head ID"        as sales_director_head_id,
    "Sales Director"                as sales_director,
    "Sales Director ID"             as sales_director_id,
    "Broker Network Officer"        as broker_network_officer,
    "Broker Network Officer ID"     as broker_network_officer_id,
    "Broker Network Associate"      as broker_network_associate,
    "Broker Network Associate ID"   as broker_network_associate_id,
    "BIR Registered Name"           as bir_registered_name,
    "VAT Registration Type"         as vat_registration_type,
    "TIN"                           as tin,
    "EWT / CWT"                     as ewt_cwt_rate,
    "BIR COR Address"               as bir_cor_address
  from public."Brokers"
  order by "Full Name";
$$;

grant execute on function public.get_broker_recruits() to anon, authenticated;
