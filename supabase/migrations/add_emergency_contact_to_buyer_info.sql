-- Add emergency contact columns to clients table
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS emergency_contact_name     text,
  ADD COLUMN IF NOT EXISTS emergency_contact_no       text,
  ADD COLUMN IF NOT EXISTS emergency_contact_relation text,
  ADD COLUMN IF NOT EXISTS emergency_contact_email    text;

-- Add alternate address columns to clients table
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS alt_country           text,
  ADD COLUMN IF NOT EXISTS alt_region_province   text,
  ADD COLUMN IF NOT EXISTS alt_city_municipality text,
  ADD COLUMN IF NOT EXISTS alt_barangay          text,
  ADD COLUMN IF NOT EXISTS alt_street            text,
  ADD COLUMN IF NOT EXISTS alt_unit              text;

-- Drop ALL overloads of update_buyer_info (handles ambiguous signatures)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (SELECT oid::regprocedure AS fn FROM pg_proc WHERE proname = 'update_buyer_info')
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.fn;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION update_buyer_info(
  p_id                     uuid,
  p_gender                 text    DEFAULT NULL,
  p_civil_status           text    DEFAULT NULL,
  p_tin                    text    DEFAULT NULL,
  p_no_tin                 boolean DEFAULT false,
  p_has_co_ownership       boolean DEFAULT false,
  p_has_atty_in_fact       boolean DEFAULT false,
  p_home_ownership         text    DEFAULT NULL,
  p_home_country           text    DEFAULT NULL,
  p_home_region_province   text    DEFAULT NULL,
  p_home_city_municipality text    DEFAULT NULL,
  p_home_barangay          text    DEFAULT NULL,
  p_home_street            text    DEFAULT NULL,
  p_home_unit              text    DEFAULT NULL,
  p_employer               text    DEFAULT NULL,
  p_nature_of_business     text    DEFAULT NULL,
  p_employment_sector      text    DEFAULT NULL,
  p_employment_status      text    DEFAULT NULL,
  p_job_title              text    DEFAULT NULL,
  p_rank                   text    DEFAULT NULL,
  p_salary_range           text    DEFAULT NULL,
  p_work_mobile_code       text    DEFAULT NULL,
  p_work_mobile            text    DEFAULT NULL,
  p_work_landline          text    DEFAULT NULL,
  p_work_email             text    DEFAULT NULL,
  p_work_country           text    DEFAULT NULL,
  p_work_region_province   text    DEFAULT NULL,
  p_work_city_municipality text    DEFAULT NULL,
  p_work_barangay          text    DEFAULT NULL,
  p_work_street            text    DEFAULT NULL,
  p_work_building_unit     text    DEFAULT NULL,
  p_mailing_type           text    DEFAULT NULL,
  p_mailing_other          text    DEFAULT NULL,
  p_emergency_contact_name     text DEFAULT NULL,
  p_emergency_contact_no       text DEFAULT NULL,
  p_emergency_contact_relation text DEFAULT NULL,
  p_emergency_contact_email    text DEFAULT NULL,
  p_alt_country                text DEFAULT NULL,
  p_alt_region_province        text DEFAULT NULL,
  p_alt_city_municipality      text DEFAULT NULL,
  p_alt_barangay               text DEFAULT NULL,
  p_alt_street                 text DEFAULT NULL,
  p_alt_unit                   text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE clients SET
    gender                    = p_gender,
    civil_status              = p_civil_status,
    tin                       = p_tin,
    no_tin                    = p_no_tin,
    has_co_ownership          = p_has_co_ownership,
    has_atty_in_fact          = p_has_atty_in_fact,
    buyer_info_saved          = true,
    home_ownership            = p_home_ownership,
    home_country              = p_home_country,
    home_region_province      = p_home_region_province,
    home_city_municipality    = p_home_city_municipality,
    home_barangay             = p_home_barangay,
    home_street               = p_home_street,
    home_unit                 = p_home_unit,
    employer                  = p_employer,
    nature_of_business        = p_nature_of_business,
    employment_sector         = p_employment_sector,
    employment_status         = p_employment_status,
    job_title                 = p_job_title,
    rank                      = p_rank,
    salary_range              = p_salary_range,
    work_mobile_code          = p_work_mobile_code,
    work_mobile               = p_work_mobile,
    work_landline             = p_work_landline,
    work_email                = p_work_email,
    work_country              = p_work_country,
    work_region_province      = p_work_region_province,
    work_city_municipality    = p_work_city_municipality,
    work_barangay             = p_work_barangay,
    work_street               = p_work_street,
    work_building_unit        = p_work_building_unit,
    mailing_type              = p_mailing_type,
    mailing_other             = p_mailing_other,
    emergency_contact_name     = p_emergency_contact_name,
    emergency_contact_no       = p_emergency_contact_no,
    emergency_contact_relation = p_emergency_contact_relation,
    emergency_contact_email    = p_emergency_contact_email,
    alt_country                = p_alt_country,
    alt_region_province        = p_alt_region_province,
    alt_city_municipality      = p_alt_city_municipality,
    alt_barangay               = p_alt_barangay,
    alt_street                 = p_alt_street,
    alt_unit                   = p_alt_unit
  WHERE id = p_id;
END;
$$;

-- Drop ALL overloads of get_buyer_info
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (SELECT oid::regprocedure AS fn FROM pg_proc WHERE proname = 'get_buyer_info')
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.fn;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION get_buyer_info(p_id uuid)
RETURNS TABLE (
  buyer_info_saved          boolean,
  gender                    text,
  civil_status              text,
  tin                       text,
  no_tin                    boolean,
  has_co_ownership          boolean,
  has_atty_in_fact          boolean,
  home_ownership            text,
  home_country              text,
  home_region_province      text,
  home_city_municipality    text,
  home_barangay             text,
  home_street               text,
  home_unit                 text,
  employer                  text,
  nature_of_business        text,
  employment_sector         text,
  employment_status         text,
  job_title                 text,
  rank                      text,
  salary_range              text,
  work_mobile_code          text,
  work_mobile               text,
  work_landline             text,
  work_email                text,
  work_country              text,
  work_region_province      text,
  work_city_municipality    text,
  work_barangay             text,
  work_street               text,
  work_building_unit        text,
  mailing_type              text,
  mailing_other             text,
  emergency_contact_name     text,
  emergency_contact_no       text,
  emergency_contact_relation text,
  emergency_contact_email    text,
  alt_country                text,
  alt_region_province        text,
  alt_city_municipality      text,
  alt_barangay               text,
  alt_street                 text,
  alt_unit                   text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.buyer_info_saved,
    c.gender, c.civil_status, c.tin, c.no_tin,
    c.has_co_ownership, c.has_atty_in_fact,
    c.home_ownership, c.home_country,
    c.home_region_province, c.home_city_municipality,
    c.home_barangay, c.home_street, c.home_unit,
    c.employer, c.nature_of_business,
    c.employment_sector, c.employment_status,
    c.job_title, c.rank, c.salary_range,
    c.work_mobile_code, c.work_mobile, c.work_landline, c.work_email,
    c.work_country, c.work_region_province, c.work_city_municipality,
    c.work_barangay, c.work_street, c.work_building_unit,
    c.mailing_type, c.mailing_other,
    c.emergency_contact_name,
    c.emergency_contact_no,
    c.emergency_contact_relation,
    c.emergency_contact_email,
    c.alt_country,
    c.alt_region_province,
    c.alt_city_municipality,
    c.alt_barangay,
    c.alt_street,
    c.alt_unit
  FROM clients c
  WHERE c.id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION update_buyer_info TO authenticated;
GRANT EXECUTE ON FUNCTION get_buyer_info TO authenticated;
