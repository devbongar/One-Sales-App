-- History table for commission scheme edits.
-- Each row captures a snapshot of the tranche values BEFORE an edit was saved.
-- The commission_id is stable across versions; this table lets us audit what changed.

create table if not exists public.commission_tranching_history (
  id              bigint generated always as identity primary key,
  commission_id   text        not null,
  project         text,
  position_rank   text,
  product_type    text,
  seller_type     text,
  commission_type text,
  effectivity_start date,
  effectivity_end   date,
  tranches        jsonb       not null default '[]',
  changed_at      timestamptz not null default now(),
  changed_by      text
);

alter table public.commission_tranching_history enable row level security;

create policy "authenticated can manage commission history"
  on public.commission_tranching_history
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert on public.commission_tranching_history to authenticated;
