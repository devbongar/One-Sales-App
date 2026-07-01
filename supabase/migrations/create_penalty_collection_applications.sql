create table if not exists public.penalty_collection_applications (
  id               bigserial    primary key,
  collection_id    uuid         not null references public.collections(id) on delete cascade,
  penalty_line_id  bigint       not null references public.penalty_lines(id) on delete cascade,
  amount_applied   numeric(14,2) not null,
  created_at       timestamptz  not null default now()
);

alter table public.penalty_collection_applications enable row level security;

create policy "pca_select" on public.penalty_collection_applications
  for select to authenticated using (true);
create policy "pca_insert" on public.penalty_collection_applications
  for insert to authenticated with check (true);
create policy "pca_update" on public.penalty_collection_applications
  for update to authenticated using (true);
create policy "pca_delete" on public.penalty_collection_applications
  for delete to authenticated using (true);
