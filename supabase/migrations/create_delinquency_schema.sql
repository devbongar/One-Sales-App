-- Delinquency notices automation schema.
-- Creates: penalty_policy, delinquency_accounts, delinquency_notices, automation_runs
-- Alters:  clients (delinquency tracking columns)

-- ── penalty_policy ────────────────────────────────────────────────────────────
-- Single-row config table. Always upsert id=1.
create table if not exists public.penalty_policy (
  id                         int primary key default 1 check (id = 1),
  automation_enabled         boolean      not null default false,
  run_days                   int[]        not null default '{11,26}',
  notice_1_threshold_months  int          not null default 1,
  notice_2_threshold_months  int          not null default 2,
  final_notice_threshold_months int       not null default 3,
  recurring_threshold        int          not null default 2,
  created_at                 timestamptz  not null default now(),
  updated_at                 timestamptz  not null default now()
);

-- Seed the single config row
insert into public.penalty_policy (id) values (1)
  on conflict (id) do nothing;

alter table public.penalty_policy enable row level security;
create policy "authenticated read penalty_policy"
  on public.penalty_policy for select to authenticated using (true);
create policy "authenticated update penalty_policy"
  on public.penalty_policy for update to authenticated using (true);


-- ── delinquency_accounts ──────────────────────────────────────────────────────
-- One row per delinquency episode per reservation.
-- Only one episode may be 'active' per reservation at a time.
create table if not exists public.delinquency_accounts (
  id               bigserial    primary key,
  reservation_id   text         not null,
  client_id        text         not null,
  episode_number   int          not null default 1,
  status           text         not null default 'active'
                     check (status in ('active', 'resolved', 'cancelled')),
  first_missed_date date        not null,
  current_stage    text         not null default 'none'
                     check (current_stage in ('none', '1st_notice', '2nd_notice', 'final_notice')),
  highest_stage    text         not null default 'none'
                     check (highest_stage in ('none', '1st_notice', '2nd_notice', 'final_notice')),
  months_behind    int          not null default 0,
  resolved_at      timestamptz,
  cancelled_at     timestamptz,
  created_at       timestamptz  not null default now(),
  updated_at       timestamptz  not null default now()
);

-- Only one active episode per reservation
create unique index if not exists delinquency_accounts_one_active
  on public.delinquency_accounts (reservation_id)
  where status = 'active';

alter table public.delinquency_accounts enable row level security;
create policy "authenticated all delinquency_accounts"
  on public.delinquency_accounts for all to authenticated using (true) with check (true);


-- ── delinquency_notices ───────────────────────────────────────────────────────
-- Permanent audit trail. One row per notice type per episode.
create table if not exists public.delinquency_notices (
  id                      bigserial   primary key,
  delinquency_account_id  bigint      not null references public.delinquency_accounts (id),
  reservation_id          text        not null,
  client_id               text        not null,
  notice_type             text        not null
                            check (notice_type in ('1st_notice', '2nd_notice', 'final_notice')),
  months_behind_at_send   int         not null,
  total_receivable_balance numeric(14,2),
  total_penalty_balance    numeric(14,2),
  email_status            text        not null default 'queued'
                            check (email_status in ('queued', 'sent', 'failed', 'skipped')),
  email_sent_at           timestamptz,
  email_error             text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- One notice per type per episode
create unique index if not exists delinquency_notices_one_per_type
  on public.delinquency_notices (delinquency_account_id, notice_type);

alter table public.delinquency_notices enable row level security;
create policy "authenticated all delinquency_notices"
  on public.delinquency_notices for all to authenticated using (true) with check (true);


-- ── automation_runs ───────────────────────────────────────────────────────────
-- Execution log for every cron/manual run.
create table if not exists public.automation_runs (
  id                  bigserial   primary key,
  triggered_by        text        not null default 'cron'
                        check (triggered_by in ('cron', 'manual')),
  status              text        not null default 'running'
                        check (status in ('running', 'completed', 'failed')),
  accounts_processed  int         not null default 0,
  notices_created     int         not null default 0,
  emails_queued       int         not null default 0,
  emails_sent         int         not null default 0,
  episodes_resolved   int         not null default 0,
  error_count         int         not null default 0,
  error_detail        text,
  duration_ms         int,
  run_at              timestamptz not null default now(),
  completed_at        timestamptz
);

alter table public.automation_runs enable row level security;
create policy "authenticated all automation_runs"
  on public.automation_runs for all to authenticated using (true) with check (true);


-- ── clients: delinquency tracking columns ────────────────────────────────────
alter table public.clients
  add column if not exists delinquency_count        int     not null default 0,
  add column if not exists is_recurring_delinquent  boolean not null default false,
  add column if not exists worst_stage_ever         text    not null default 'none'
    check (worst_stage_ever in ('none', '1st_notice', '2nd_notice', 'final_notice'));


notify pgrst, 'reload schema';
