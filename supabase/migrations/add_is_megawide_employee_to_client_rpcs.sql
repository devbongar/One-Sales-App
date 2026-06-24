-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add p_is_megawide_employee to save_client and update_client RPCs
-- Run in Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. save_client ────────────────────────────────────────────────────────────

drop function if exists public.save_client(
  text,text,text,text,text,text,text,text,text,text,
  text,text,text,text,text,text,text,text,text,text,
  text,text,text,text,text
);

create or replace function public.save_client(
  p_client_type              text,
  p_last_name                text,
  p_first_name               text,
  p_middle_name              text,
  p_suffix                   text,
  p_gender                   text,
  p_civil_status             text,
  p_date_of_birth            text,
  p_citizenship              text,
  p_country_code             text,
  p_mobile_number            text,
  p_landline_no              text,
  p_email                    text,
  p_reason_for_buying        text,
  p_source_of_sale           text,
  p_monthly_household_income text,
  p_seller_type              text,
  p_sales_director           text,
  p_sales_manager            text,
  p_property_specialist      text,
  p_broker_network_associate text,
  p_broker_network_officer   text,
  p_broker_director_head     text,
  p_broker_sales_head        text,
  p_broker_bir_name          text,
  p_is_megawide_employee     boolean default false
) returns text language plpgsql security definer as $$
declare
  v_client_id text;
  v_id        uuid;
  v_seq       int;
begin
  select count(*) + 1 into v_seq from public.clients;
  v_client_id := 'CL-' || lpad(v_seq::text, 8, '0');

  insert into public.clients (
    client_id, client_type,
    last_name, first_name, middle_name, suffix,
    gender, civil_status, date_of_birth, citizenship,
    country_code, mobile_number, landline_no, email,
    reason_for_buying, source_of_sale, monthly_household_income,
    seller_type, sales_director, sales_manager, property_specialist,
    broker_network_associate, broker_network_officer,
    broker_director_head, broker_sales_head, broker_bir_name,
    is_megawide_employee
  ) values (
    v_client_id, p_client_type,
    p_last_name, p_first_name, p_middle_name, p_suffix,
    p_gender, p_civil_status,
    nullif(p_date_of_birth, '')::date,
    p_citizenship,
    p_country_code, p_mobile_number, p_landline_no, p_email,
    p_reason_for_buying, p_source_of_sale, p_monthly_household_income,
    p_seller_type, p_sales_director, p_sales_manager, p_property_specialist,
    p_broker_network_associate, p_broker_network_officer,
    p_broker_director_head, p_broker_sales_head, p_broker_bir_name,
    p_is_megawide_employee
  )
  returning id into v_id;

  return v_client_id;
end;
$$;

grant execute on function public.save_client(
  text,text,text,text,text,text,text,text,text,text,
  text,text,text,text,text,text,text,text,text,text,
  text,text,text,text,text,boolean
) to authenticated;


-- ── 2. update_client ──────────────────────────────────────────────────────────

drop function if exists public.update_client(
  uuid,text,text,text,text,text,text,text,text,text,text,
  text,text,text,text,text,text,text,text,text,text,text,
  text,text,text,text
);

create or replace function public.update_client(
  p_id                       uuid,
  p_client_type              text,
  p_last_name                text,
  p_first_name               text,
  p_middle_name              text,
  p_suffix                   text,
  p_gender                   text,
  p_civil_status             text,
  p_date_of_birth            text,
  p_citizenship              text,
  p_country_code             text,
  p_mobile_number            text,
  p_landline_no              text,
  p_email                    text,
  p_reason_for_buying        text,
  p_source_of_sale           text,
  p_monthly_household_income text,
  p_seller_type              text,
  p_sales_director           text,
  p_sales_manager            text,
  p_property_specialist      text,
  p_broker_network_associate text,
  p_broker_network_officer   text,
  p_broker_director_head     text,
  p_broker_sales_head        text,
  p_broker_bir_name          text,
  p_is_megawide_employee     boolean default null
) returns void language plpgsql security definer as $$
begin
  update public.clients set
    client_type              = p_client_type,
    last_name                = p_last_name,
    first_name               = p_first_name,
    middle_name              = p_middle_name,
    suffix                   = p_suffix,
    gender                   = p_gender,
    civil_status             = p_civil_status,
    date_of_birth            = nullif(p_date_of_birth, '')::date,
    citizenship              = p_citizenship,
    country_code             = p_country_code,
    mobile_number            = p_mobile_number,
    landline_no              = p_landline_no,
    email                    = p_email,
    reason_for_buying        = p_reason_for_buying,
    source_of_sale           = p_source_of_sale,
    monthly_household_income = p_monthly_household_income,
    seller_type              = p_seller_type,
    sales_director           = p_sales_director,
    sales_manager            = p_sales_manager,
    property_specialist      = p_property_specialist,
    broker_network_associate = p_broker_network_associate,
    broker_network_officer   = p_broker_network_officer,
    broker_director_head     = p_broker_director_head,
    broker_sales_head        = p_broker_sales_head,
    broker_bir_name          = p_broker_bir_name,
    is_megawide_employee     = coalesce(p_is_megawide_employee, is_megawide_employee)
  where id = p_id;
end;
$$;

grant execute on function public.update_client(
  uuid,text,text,text,text,text,text,text,text,text,text,
  text,text,text,text,text,text,text,text,text,text,text,
  text,text,text,text,boolean
) to authenticated;
