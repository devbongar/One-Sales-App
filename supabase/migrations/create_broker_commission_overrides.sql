-- Per-broker flat commission rate override.
-- When a broker has an active override for a (project + product_type + position_rank) slot,
-- their commission rate is substituted on every tranche instead of the standard rate.
-- The tranche structure (Coll%, Release%) is always taken from Commission_Tranching.

create table if not exists public.broker_commission_overrides (
  id              bigint generated always as identity primary key,
  broker_id       text        not null,
  broker_name     text,
  project         text        not null,
  product_type    text        not null,
  position_rank   text        not null,
  commission_rate numeric     not null,
  status          text        not null default 'Active',
  created_at      timestamptz not null default now(),
  created_by      text,

  unique (broker_id, project, product_type, position_rank)
);

alter table public.broker_commission_overrides enable row level security;

create policy "authenticated can manage broker commission overrides"
  on public.broker_commission_overrides
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update on public.broker_commission_overrides to authenticated;
