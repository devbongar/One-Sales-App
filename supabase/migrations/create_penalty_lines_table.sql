-- Migration: create penalty_lines table + generate_penalty_lines RPC
-- Run in Supabase SQL editor

-- ── 1. Table ─────────────────────────────────────────────────────────────────

create table if not exists public.penalty_lines (
  id                   bigserial primary key,
  reservation_id       text          not null,
  receivable_line_id   uuid          not null unique,
  client_name          text,
  inventory_code       text,
  original_due_date    date          not null,
  days_overdue         int           not null,
  daily_rate           numeric(10,6) not null default 0.001,
  principal_basis      numeric(14,2) not null,
  penalty_amount       numeric(14,2) not null,
  payment_status       text          not null default 'Unpaid',
  amount_paid          numeric(14,2) not null default 0,
  collection_id        uuid          references public.collections(id) on delete set null,
  ar_no                text,
  ar_date              date,
  remarks              text,
  generated_at         timestamptz   not null default now(),
  created_at           timestamptz   not null default now()
);

-- ── 2. RLS ───────────────────────────────────────────────────────────────────

alter table public.penalty_lines enable row level security;

create policy "penalty_lines_select" on public.penalty_lines
  for select to authenticated using (true);

create policy "penalty_lines_insert" on public.penalty_lines
  for insert to authenticated with check (true);

create policy "penalty_lines_update" on public.penalty_lines
  for update to authenticated using (true);

create policy "penalty_lines_delete" on public.penalty_lines
  for delete to authenticated using (true);

-- ── 3. Admin setting for daily rate ──────────────────────────────────────────

insert into public.app_settings (key, value)
values ('penalty_daily_rate', '0.001')
on conflict (key) do nothing;

-- ── 4. generate_penalty_lines RPC ────────────────────────────────────────────
-- Scans receivables_database for all Unpaid/Partial lines where due_date < today.
-- UPSERTs one penalty_lines row per overdue line:
--   - INSERT on first generation
--   - UPDATE days_overdue, penalty_amount, daily_rate, generated_at on re-runs
--     Rows already Paid or Waived are never touched.
-- Returns total rows processed.

create or replace function public.generate_penalty_lines()
returns json
language plpgsql
security definer
as $$
declare
  v_rate      numeric(10,6);
  v_today     date := current_date;
  v_total     int  := 0;
  r           record;
  v_days      int;
  v_penalty   numeric(14,2);
begin
  -- Read configured daily rate (falls back to 0.001 if not set)
  select coalesce(nullif(trim(value), '')::numeric, 0.001)
  into   v_rate
  from   public.app_settings
  where  key = 'penalty_daily_rate';

  if v_rate is null then v_rate := 0.001; end if;

  for r in
    select
      rd.id                                              as line_id,
      rd.reservation_id,
      rd.client_name,
      rd.inventory_code,
      rd.due_date,
      coalesce(rd.principal, rd.total_amount_due, 0)    as principal
    from public.receivables_database rd
    where rd.due_date < v_today
      and rd.payment_status in ('Unpaid', 'Partial')
      and lower(rd.type_of_payment) not like '%penalty%'
  loop
    v_days    := (v_today - r.due_date);
    v_penalty := round(r.principal * v_days * v_rate, 2);

    insert into public.penalty_lines (
      reservation_id, receivable_line_id, client_name, inventory_code,
      original_due_date, days_overdue, daily_rate, principal_basis,
      penalty_amount, payment_status, generated_at
    )
    values (
      r.reservation_id, r.line_id, r.client_name, r.inventory_code,
      r.due_date, v_days, v_rate, r.principal,
      v_penalty, 'Unpaid', now()
    )
    on conflict (receivable_line_id) do update
      set
        days_overdue    = excluded.days_overdue,
        daily_rate      = excluded.daily_rate,
        principal_basis = excluded.principal_basis,
        penalty_amount  = excluded.penalty_amount,
        generated_at    = now()
      -- Never overwrite Paid or Waived rows
      where penalty_lines.payment_status in ('Unpaid', 'Partial');

    v_total := v_total + 1;
  end loop;

  return json_build_object('processed', v_total, 'rate', v_rate, 'as_of', v_today);
end;
$$;
