-- Add type column to automation_runs to distinguish SOA vs delinquency runs.
-- Create soa_policy (single-row config) and soa_notices (per-reservation email audit).
-- Idempotent: safe to re-run if partially applied.

-- ── automation_runs: add type ─────────────────────────────────────────────────
alter table public.automation_runs
  add column if not exists type text not null default 'delinquency'
    check (type in ('delinquency', 'soa'));


-- ── soa_policy ────────────────────────────────────────────────────────────────
create table if not exists public.soa_policy (
  id                 int primary key default 1 check (id = 1),
  automation_enabled boolean      not null default false,
  run_hour           int          not null default 1,
  grace_days         int          not null default 5,
  email_config       jsonb        not null default '{}'::jsonb,
  created_at         timestamptz  not null default now(),
  updated_at         timestamptz  not null default now()
);

-- Add grace_days if the table existed before this column was introduced
alter table public.soa_policy
  add column if not exists grace_days int not null default 5;

insert into public.soa_policy (id) values (1) on conflict (id) do nothing;

-- Only seed email_config if it is still the empty default (never been configured)
update public.soa_policy
set email_config = '{
  "to": ["client"],
  "cc": [],
  "subject": "Statement of Account — {reservation_id}",
  "body": "Dear {client_name},\n\nPlease find attached your Statement of Account for {project} Unit {unit}.\n\nA payment of {amount_due} is due on {due_date}. Please ensure timely payment to avoid penalties.\n\nIf you have any questions, please contact your property specialist.\n\nThank you."
}'::jsonb
where id = 1 and email_config = '{}'::jsonb;

alter table public.soa_policy enable row level security;
do $$ begin
  create policy "authenticated read soa_policy"
    on public.soa_policy for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "authenticated update soa_policy"
    on public.soa_policy for update to authenticated using (true);
exception when duplicate_object then null; end $$;


-- ── soa_notices ───────────────────────────────────────────────────────────────
-- One row per reservation per automation run. Tracks per-reservation email status.
create table if not exists public.soa_notices (
  id                bigserial    primary key,
  automation_run_id bigint       references public.automation_runs(id) on delete set null,
  reservation_id    text         not null,
  client_id         text,
  client_name       text,
  target_date       date         not null,
  email_status      text         not null default 'queued'
                      check (email_status in ('queued', 'sent', 'failed', 'skipped')),
  email_sent_at     timestamptz,
  email_error       text,
  created_at        timestamptz  not null default now(),
  updated_at        timestamptz  not null default now()
);

alter table public.soa_notices enable row level security;
do $$ begin
  create policy "authenticated all soa_notices"
    on public.soa_notices for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;


notify pgrst, 'reload schema';
