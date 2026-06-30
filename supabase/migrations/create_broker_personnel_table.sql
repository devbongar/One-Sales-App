-- Migration: broker_personnel table
-- Stores BNA and BNO records with crossover references to Salesperson for SD+

create table public.broker_personnel (
  id                     bigserial primary key,
  personnel_id           text unique,
  full_name              text not null,
  first_name             text,
  middle_name            text,
  last_name              text,
  position_code          text,
  position_rank          text,
  personnel_status       text default 'Active',
  email_address          text,
  joined_date            date,
  focus_project          text,
  bno_name               text,
  sales_director         text,
  sales_director_id      text,
  sales_division_head    text,
  sales_division_head_id text,
  sales_head             text,
  sales_head_id          text,
  app_role_id            int references access_roles(id),
  created_at             timestamptz default now()
);

alter table public.broker_personnel enable row level security;

create policy "broker_personnel_select" on public.broker_personnel
  for select to authenticated using (true);

create policy "broker_personnel_insert" on public.broker_personnel
  for insert to authenticated with check (true);

create policy "broker_personnel_update" on public.broker_personnel
  for update to authenticated using (true);
