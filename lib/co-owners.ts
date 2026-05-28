import { supabase } from '@/lib/supabase';

export interface CoOwnerPayload {
  reservation_id: string;
  // Personal
  last_name: string;
  first_name: string;
  middle_name: string;
  suffix: string;
  gender: string;
  civil_status: string;
  citizenship: string;
  date_of_birth: string;
  mobile_code: string;
  mobile: string;
  landline: string;
  email: string;
  tin: string;
  no_tin: boolean;
  // Home Address
  home_ownership: string;
  home_country: string;
  home_region_province: string;
  home_city_municipality: string;
  home_barangay: string;
  home_street: string;
  home_unit: string;
  // Employment
  employer: string;
  nature_of_business: string;
  employment_sector: string;
  employment_status: string;
  job_title: string;
  rank: string;
  salary_range: string;
  work_mobile_code: string;
  work_mobile: string;
  work_landline: string;
  work_email: string;
  // Work Address
  work_country: string;
  work_region_province: string;
  work_city_municipality: string;
  work_barangay: string;
  work_street: string;
  work_building_unit: string;
  // Mailing
  mailing_type: string;
  mailing_other: string;
  // Flag
  co_owner_is_spouse: boolean;
}

export interface CoOwnerRecord {
  reservation_id: string;
  last_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  suffix: string | null;
  gender: string | null;
  civil_status: string | null;
  citizenship: string | null;
  date_of_birth: string | null;
  mobile_code: string | null;
  mobile: string | null;
  landline: string | null;
  email: string | null;
  tin: string | null;
  no_tin: boolean | null;
  home_ownership: string | null;
  home_country: string | null;
  home_region_province: string | null;
  home_city_municipality: string | null;
  home_barangay: string | null;
  home_street: string | null;
  home_unit: string | null;
  employer: string | null;
  nature_of_business: string | null;
  employment_sector: string | null;
  employment_status: string | null;
  job_title: string | null;
  rank: string | null;
  salary_range: string | null;
  work_mobile_code: string | null;
  work_mobile: string | null;
  work_landline: string | null;
  work_email: string | null;
  work_country: string | null;
  work_region_province: string | null;
  work_city_municipality: string | null;
  work_barangay: string | null;
  work_street: string | null;
  work_building_unit: string | null;
  mailing_type: string | null;
  mailing_other: string | null;
}

export async function fetchCoOwner(reservationId: string): Promise<CoOwnerRecord | null> {
  const { data, error } = await supabase.rpc('get_co_owner', { p_reservation_id: reservationId });
  if (error) throw error;
  return data as CoOwnerRecord | null;
}

export async function checkCoOwnerExists(reservationId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_co_owner_exists', { p_reservation_id: reservationId });
  if (error) throw error;
  return data as boolean;
}

export async function saveCoOwner(payload: CoOwnerPayload): Promise<void> {
  const { error } = await supabase.rpc('save_co_owner', {
    p_reservation_id:         payload.reservation_id,
    p_last_name:              payload.last_name              || null,
    p_first_name:             payload.first_name             || null,
    p_middle_name:            payload.middle_name            || null,
    p_suffix:                 payload.suffix                 || null,
    p_gender:                 payload.gender                 || null,
    p_civil_status:           payload.civil_status           || null,
    p_citizenship:            payload.citizenship            || null,
    p_date_of_birth:          payload.date_of_birth          || null,
    p_mobile_code:            payload.mobile_code            || null,
    p_mobile:                 payload.mobile                 || null,
    p_landline:               payload.landline               || null,
    p_email:                  payload.email                  || null,
    p_tin:                    payload.tin                    || null,
    p_no_tin:                 payload.no_tin,
    p_home_ownership:         payload.home_ownership         || null,
    p_home_country:           payload.home_country           || null,
    p_home_region_province:   payload.home_region_province   || null,
    p_home_city_municipality: payload.home_city_municipality || null,
    p_home_barangay:          payload.home_barangay          || null,
    p_home_street:            payload.home_street            || null,
    p_home_unit:              payload.home_unit              || null,
    p_employer:               payload.employer               || null,
    p_nature_of_business:     payload.nature_of_business     || null,
    p_employment_sector:      payload.employment_sector      || null,
    p_employment_status:      payload.employment_status      || null,
    p_job_title:              payload.job_title              || null,
    p_rank:                   payload.rank                   || null,
    p_salary_range:           payload.salary_range           || null,
    p_work_mobile_code:       payload.work_mobile_code       || null,
    p_work_mobile:            payload.work_mobile            || null,
    p_work_landline:          payload.work_landline          || null,
    p_work_email:             payload.work_email             || null,
    p_work_country:           payload.work_country           || null,
    p_work_region_province:   payload.work_region_province   || null,
    p_work_city_municipality: payload.work_city_municipality || null,
    p_work_barangay:          payload.work_barangay          || null,
    p_work_street:            payload.work_street            || null,
    p_work_building_unit:     payload.work_building_unit     || null,
    p_mailing_type:           payload.mailing_type           || null,
    p_mailing_other:          payload.mailing_other          || null,
    p_co_owner_is_spouse:     payload.co_owner_is_spouse,
  });
  if (error) throw error;
}
