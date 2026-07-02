import { supabase } from '@/lib/supabase';

export interface CoOwnerSpousePayload {
  reservation_id: string;
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
}

export interface CoOwnerSpouseRecord {
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
}

export async function fetchCoOwnerSpouse(reservationId: string): Promise<CoOwnerSpouseRecord | null> {
  const { data, error } = await supabase.rpc('get_co_owner_spouse_info', { p_reservation_id: reservationId });
  if (error) throw error;
  return (data as CoOwnerSpouseRecord[] | null)?.[0] ?? null;
}

export async function saveCoOwnerSpouse(payload: CoOwnerSpousePayload): Promise<void> {
  const { error } = await supabase.rpc('save_co_owner_spouse_info', {
    p_reservation_id:     payload.reservation_id,
    p_last_name:          payload.last_name          || null,
    p_first_name:         payload.first_name         || null,
    p_middle_name:        payload.middle_name        || null,
    p_suffix:             payload.suffix             || null,
    p_gender:             payload.gender             || null,
    p_civil_status:       payload.civil_status       || null,
    p_citizenship:        payload.citizenship        || null,
    p_date_of_birth:      payload.date_of_birth      || null,
    p_mobile_code:        payload.mobile_code        || null,
    p_mobile:             payload.mobile             || null,
    p_landline:           payload.landline           || null,
    p_email:              payload.email              || null,
    p_tin:                payload.tin                || null,
    p_no_tin:             payload.no_tin,
    p_employer:           payload.employer           || null,
    p_nature_of_business: payload.nature_of_business || null,
    p_employment_sector:  payload.employment_sector  || null,
    p_employment_status:  payload.employment_status  || null,
    p_job_title:          payload.job_title          || null,
    p_rank:               payload.rank               || null,
    p_salary_range:       payload.salary_range       || null,
    p_work_mobile_code:   payload.work_mobile_code   || null,
    p_work_mobile:        payload.work_mobile        || null,
    p_work_landline:      payload.work_landline      || null,
    p_work_email:         payload.work_email         || null,
  });
  if (error) throw error;
}
