create table if not exists public.penalty_credits (
  id                      bigserial    primary key,
  reservation_id          text         not null,
  source_collection_id    uuid         not null references public.collections(id) on delete cascade,
  ar_no                   text,
  amount                  numeric(14,2) not null,
  consumed_amount         numeric(14,2) not null default 0,
  balance                 numeric(14,2) generated always as (amount - consumed_amount) stored,
  consuming_collection_id uuid         references public.collections(id) on delete set null,
  created_at              timestamptz  not null default now(),
  consumed_at             timestamptz
);

alter table public.penalty_credits enable row level security;

create policy "penalty_credits_select" on public.penalty_credits
  for select to authenticated using (true);
create policy "penalty_credits_insert" on public.penalty_credits
  for insert to authenticated with check (true);
create policy "penalty_credits_update" on public.penalty_credits
  for update to authenticated using (true);
create policy "penalty_credits_delete" on public.penalty_credits
  for delete to authenticated using (true);
