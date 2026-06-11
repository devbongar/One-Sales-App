-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: fix save RPCs to upsert (not insert) + add delete functions
-- Run in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────
--
-- BEFORE RUNNING: verify the actual table names in your Supabase database.
-- The table names used here are: atty_in_fact, co_owners, spouse_info
-- If yours differ, do a find-and-replace in this file before running.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. save_atty_in_fact — fix INSERT → upsert ────────────────────────────────

create or replace function public.save_atty_in_fact(
  p_reservation_id  text,
  p_last_name       text,
  p_first_name      text,
  p_middle_name     text,
  p_suffix          text,
  p_mobile_code     text,
  p_mobile          text,
  p_landline        text,
  p_email           text
) returns void language plpgsql security definer as $$
begin
  insert into public.atty_in_fact (
    reservation_id, last_name, first_name, middle_name, suffix,
    mobile_code, mobile, landline, email
  ) values (
    p_reservation_id, p_last_name, p_first_name, p_middle_name, p_suffix,
    p_mobile_code, p_mobile, p_landline, p_email
  )
  on conflict (reservation_id) do update set
    last_name    = excluded.last_name,
    first_name   = excluded.first_name,
    middle_name  = excluded.middle_name,
    suffix       = excluded.suffix,
    mobile_code  = excluded.mobile_code,
    mobile       = excluded.mobile,
    landline     = excluded.landline,
    email        = excluded.email;
end;
$$;


-- ── 2. delete_atty_in_fact — remove a row by reservation_id ──────────────────

create or replace function public.delete_atty_in_fact(
  p_reservation_id text
) returns void language plpgsql security definer as $$
begin
  delete from public.atty_in_fact
  where reservation_id = p_reservation_id;
end;
$$;


-- ── 3. save_co_owner — fix INSERT → upsert ────────────────────────────────────

create or replace function public.save_co_owner(
  p_reservation_id          text,
  p_last_name               text,
  p_first_name              text,
  p_middle_name             text,
  p_suffix                  text,
  p_gender                  text,
  p_civil_status            text,
  p_citizenship             text,
  p_date_of_birth           text,
  p_mobile_code             text,
  p_mobile                  text,
  p_landline                text,
  p_email                   text,
  p_tin                     text,
  p_no_tin                  boolean,
  p_home_ownership          text,
  p_home_country            text,
  p_home_region_province    text,
  p_home_city_municipality  text,
  p_home_barangay           text,
  p_home_street             text,
  p_home_unit               text,
  p_employer                text,
  p_nature_of_business      text,
  p_employment_sector       text,
  p_employment_status       text,
  p_job_title               text,
  p_rank                    text,
  p_salary_range            text,
  p_work_mobile_code        text,
  p_work_mobile             text,
  p_work_landline           text,
  p_work_email              text,
  p_work_country            text,
  p_work_region_province    text,
  p_work_city_municipality  text,
  p_work_barangay           text,
  p_work_street             text,
  p_work_building_unit      text,
  p_mailing_type            text,
  p_mailing_other           text,
  p_co_owner_is_spouse      boolean
) returns void language plpgsql security definer as $$
begin
  insert into public.co_owners (
    reservation_id, last_name, first_name, middle_name, suffix,
    gender, civil_status, citizenship, date_of_birth,
    mobile_code, mobile, landline, email, tin, no_tin,
    home_ownership, home_country, home_region_province, home_city_municipality,
    home_barangay, home_street, home_unit,
    employer, nature_of_business, employment_sector, employment_status,
    job_title, rank, salary_range,
    work_mobile_code, work_mobile, work_landline, work_email,
    work_country, work_region_province, work_city_municipality,
    work_barangay, work_street, work_building_unit,
    mailing_type, mailing_other, co_owner_is_spouse
  ) values (
    p_reservation_id, p_last_name, p_first_name, p_middle_name, p_suffix,
    p_gender, p_civil_status, p_citizenship,
    nullif(p_date_of_birth, '')::date,
    p_mobile_code, p_mobile, p_landline, p_email, p_tin, p_no_tin,
    p_home_ownership, p_home_country, p_home_region_province, p_home_city_municipality,
    p_home_barangay, p_home_street, p_home_unit,
    p_employer, p_nature_of_business, p_employment_sector, p_employment_status,
    p_job_title, p_rank, p_salary_range,
    p_work_mobile_code, p_work_mobile, p_work_landline, p_work_email,
    p_work_country, p_work_region_province, p_work_city_municipality,
    p_work_barangay, p_work_street, p_work_building_unit,
    p_mailing_type, p_mailing_other, p_co_owner_is_spouse
  )
  on conflict (reservation_id) do update set
    last_name               = excluded.last_name,
    first_name              = excluded.first_name,
    middle_name             = excluded.middle_name,
    suffix                  = excluded.suffix,
    gender                  = excluded.gender,
    civil_status            = excluded.civil_status,
    citizenship             = excluded.citizenship,
    date_of_birth           = excluded.date_of_birth,
    mobile_code             = excluded.mobile_code,
    mobile                  = excluded.mobile,
    landline                = excluded.landline,
    email                   = excluded.email,
    tin                     = excluded.tin,
    no_tin                  = excluded.no_tin,
    home_ownership          = excluded.home_ownership,
    home_country            = excluded.home_country,
    home_region_province    = excluded.home_region_province,
    home_city_municipality  = excluded.home_city_municipality,
    home_barangay           = excluded.home_barangay,
    home_street             = excluded.home_street,
    home_unit               = excluded.home_unit,
    employer                = excluded.employer,
    nature_of_business      = excluded.nature_of_business,
    employment_sector       = excluded.employment_sector,
    employment_status       = excluded.employment_status,
    job_title               = excluded.job_title,
    rank                    = excluded.rank,
    salary_range            = excluded.salary_range,
    work_mobile_code        = excluded.work_mobile_code,
    work_mobile             = excluded.work_mobile,
    work_landline           = excluded.work_landline,
    work_email              = excluded.work_email,
    work_country            = excluded.work_country,
    work_region_province    = excluded.work_region_province,
    work_city_municipality  = excluded.work_city_municipality,
    work_barangay           = excluded.work_barangay,
    work_street             = excluded.work_street,
    work_building_unit      = excluded.work_building_unit,
    mailing_type            = excluded.mailing_type,
    mailing_other           = excluded.mailing_other,
    co_owner_is_spouse      = excluded.co_owner_is_spouse;
end;
$$;


-- ── 4. delete_co_owner — remove a row by reservation_id ──────────────────────

create or replace function public.delete_co_owner(
  p_reservation_id text
) returns void language plpgsql security definer as $$
begin
  delete from public.co_owners
  where reservation_id = p_reservation_id;
end;
$$;


-- ── 5. save_spouse_info — fix INSERT → upsert ─────────────────────────────────

create or replace function public.save_spouse_info(
  p_reservation_id          text,
  p_last_name               text,
  p_first_name              text,
  p_middle_name             text,
  p_suffix                  text,
  p_gender                  text,
  p_civil_status            text,
  p_citizenship             text,
  p_date_of_birth           text,
  p_mobile_code             text,
  p_mobile                  text,
  p_landline                text,
  p_email                   text,
  p_tin                     text,
  p_no_tin                  boolean,
  p_home_ownership          text,
  p_home_country            text,
  p_home_region_province    text,
  p_home_city_municipality  text,
  p_home_barangay           text,
  p_home_street             text,
  p_home_unit               text,
  p_employer                text,
  p_nature_of_business      text,
  p_employment_sector       text,
  p_employment_status       text,
  p_job_title               text,
  p_rank                    text,
  p_salary_range            text,
  p_work_mobile_code        text,
  p_work_mobile             text,
  p_work_landline           text,
  p_work_email              text,
  p_work_country            text,
  p_work_region_province    text,
  p_work_city_municipality  text,
  p_work_barangay           text,
  p_work_street             text,
  p_work_building_unit      text,
  p_mailing_type            text,
  p_mailing_other           text
) returns void language plpgsql security definer as $$
begin
  insert into public.spouse_info (
    reservation_id, last_name, first_name, middle_name, suffix,
    gender, civil_status, citizenship, date_of_birth,
    mobile_code, mobile, landline, email, tin, no_tin,
    home_ownership, home_country, home_region_province, home_city_municipality,
    home_barangay, home_street, home_unit,
    employer, nature_of_business, employment_sector, employment_status,
    job_title, rank, salary_range,
    work_mobile_code, work_mobile, work_landline, work_email,
    work_country, work_region_province, work_city_municipality,
    work_barangay, work_street, work_building_unit,
    mailing_type, mailing_other
  ) values (
    p_reservation_id, p_last_name, p_first_name, p_middle_name, p_suffix,
    p_gender, p_civil_status, p_citizenship,
    nullif(p_date_of_birth, '')::date,
    p_mobile_code, p_mobile, p_landline, p_email, p_tin, p_no_tin,
    p_home_ownership, p_home_country, p_home_region_province, p_home_city_municipality,
    p_home_barangay, p_home_street, p_home_unit,
    p_employer, p_nature_of_business, p_employment_sector, p_employment_status,
    p_job_title, p_rank, p_salary_range,
    p_work_mobile_code, p_work_mobile, p_work_landline, p_work_email,
    p_work_country, p_work_region_province, p_work_city_municipality,
    p_work_barangay, p_work_street, p_work_building_unit,
    p_mailing_type, p_mailing_other
  )
  on conflict (reservation_id) do update set
    last_name               = excluded.last_name,
    first_name              = excluded.first_name,
    middle_name             = excluded.middle_name,
    suffix                  = excluded.suffix,
    gender                  = excluded.gender,
    civil_status            = excluded.civil_status,
    citizenship             = excluded.citizenship,
    date_of_birth           = excluded.date_of_birth,
    mobile_code             = excluded.mobile_code,
    mobile                  = excluded.mobile,
    landline                = excluded.landline,
    email                   = excluded.email,
    tin                     = excluded.tin,
    no_tin                  = excluded.no_tin,
    home_ownership          = excluded.home_ownership,
    home_country            = excluded.home_country,
    home_region_province    = excluded.home_region_province,
    home_city_municipality  = excluded.home_city_municipality,
    home_barangay           = excluded.home_barangay,
    home_street             = excluded.home_street,
    home_unit               = excluded.home_unit,
    employer                = excluded.employer,
    nature_of_business      = excluded.nature_of_business,
    employment_sector       = excluded.employment_sector,
    employment_status       = excluded.employment_status,
    job_title               = excluded.job_title,
    rank                    = excluded.rank,
    salary_range            = excluded.salary_range,
    work_mobile_code        = excluded.work_mobile_code,
    work_mobile             = excluded.work_mobile,
    work_landline           = excluded.work_landline,
    work_email              = excluded.work_email,
    work_country            = excluded.work_country,
    work_region_province    = excluded.work_region_province,
    work_city_municipality  = excluded.work_city_municipality,
    work_barangay           = excluded.work_barangay,
    work_street             = excluded.work_street,
    work_building_unit      = excluded.work_building_unit,
    mailing_type            = excluded.mailing_type,
    mailing_other           = excluded.mailing_other;
end;
$$;
