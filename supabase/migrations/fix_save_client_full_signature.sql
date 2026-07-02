-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: drop ALL overloads of save_client / update_client and recreate with
-- the correct signature. Run in Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Drop ALL overloads dynamically ───────────────────────────────────────────

do $$
declare
  r record;
begin
  for r in
    select oid::regprocedure::text as sig
    from pg_proc
    where proname = 'save_client'
      and pronamespace = 'public'::regnamespace
  loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;

  for r in
    select oid::regprocedure::text as sig
    from pg_proc
    where proname = 'update_client'
      and pronamespace = 'public'::regnamespace
  loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end;
$$;

-- ── save_client ───────────────────────────────────────────────────────────────

create function public.save_client(
  p_client_type                  text,
  p_last_name                    text,
  p_first_name                   text,
  p_middle_name                  text,
  p_suffix                       text,
  p_gender                       text,
  p_civil_status                 text,
  p_date_of_birth                text,
  p_citizenship                  text,
  p_country_code                 text,
  p_mobile_number                text,
  p_landline_no                  text,
  p_email                        text,
  p_reason_for_buying            text,
  p_source_of_sale               text,
  p_monthly_household_income     text,
  p_seller_type                  text,
  p_property_specialist          text,
  p_sales_manager                text,
  p_sales_director               text,
  p_sales_division_head          text,
  p_sales_head                   text,
  p_broker_bir_name              text,
  p_broker_network_associate     text,
  p_broker_network_officer       text,
  p_broker_sales_director        text,
  p_broker_director_head         text,
  p_broker_sales_head            text,
  p_is_megawide_employee         boolean default false
) returns text language plpgsql security definer as $$
declare
  v_client_id text;
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
    seller_type, is_megawide_employee,
    property_specialist, sales_manager, sales_director,
    sales_division_head, sales_head,
    broker_bir_name, broker_network_associate, broker_network_officer,
    broker_sales_director, broker_director_head, broker_sales_head
  ) values (
    v_client_id, p_client_type,
    p_last_name, p_first_name, p_middle_name, p_suffix,
    p_gender, p_civil_status,
    nullif(p_date_of_birth, '')::date,
    p_citizenship,
    p_country_code, p_mobile_number, p_landline_no, p_email,
    p_reason_for_buying, p_source_of_sale, p_monthly_household_income,
    p_seller_type, p_is_megawide_employee,
    p_property_specialist, p_sales_manager, p_sales_director,
    p_sales_division_head, p_sales_head,
    p_broker_bir_name, p_broker_network_associate, p_broker_network_officer,
    p_broker_sales_director, p_broker_director_head, p_broker_sales_head
  );

  return v_client_id;
end;
$$;

grant execute on function public.save_client to authenticated;


-- ── update_client ─────────────────────────────────────────────────────────────

create function public.update_client(
  p_id                           uuid,
  p_client_type                  text,
  p_last_name                    text,
  p_first_name                   text,
  p_middle_name                  text,
  p_suffix                       text,
  p_gender                       text,
  p_civil_status                 text,
  p_date_of_birth                text,
  p_citizenship                  text,
  p_country_code                 text,
  p_mobile_number                text,
  p_landline_no                  text,
  p_email                        text,
  p_reason_for_buying            text,
  p_source_of_sale               text,
  p_monthly_household_income     text,
  p_seller_type                  text,
  p_property_specialist          text,
  p_sales_manager                text,
  p_sales_director               text,
  p_sales_division_head          text,
  p_sales_head                   text,
  p_broker_bir_name              text,
  p_broker_network_associate     text,
  p_broker_network_officer       text,
  p_broker_sales_director        text,
  p_broker_director_head         text,
  p_broker_sales_head            text,
  p_is_megawide_employee         boolean default null
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
    is_megawide_employee     = coalesce(p_is_megawide_employee, is_megawide_employee),
    property_specialist      = p_property_specialist,
    sales_manager            = p_sales_manager,
    sales_director           = p_sales_director,
    sales_division_head      = p_sales_division_head,
    sales_head               = p_sales_head,
    broker_bir_name          = p_broker_bir_name,
    broker_network_associate = p_broker_network_associate,
    broker_network_officer   = p_broker_network_officer,
    broker_sales_director    = p_broker_sales_director,
    broker_director_head     = p_broker_director_head,
    broker_sales_head        = p_broker_sales_head
  where id = p_id;
end;
$$;

grant execute on function public.update_client to authenticated;
