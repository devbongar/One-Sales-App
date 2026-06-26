-- Ensure RLS is enabled and authenticated users have full access to
-- receivables_database. Without an UPDATE policy, supersedeReceivableLines()
-- silently updates 0 rows, allowing a second payment schedule to be inserted
-- on top of the existing one — producing mixed schedules in collection-posting.

alter table if exists public.receivables_database enable row level security;

-- Drop any stale partial policies before recreating
drop policy if exists "Allow all for now"       on public.receivables_database;
drop policy if exists "Allow authenticated all" on public.receivables_database;

create policy "Allow authenticated all"
  on public.receivables_database
  for all
  to authenticated
  using (true)
  with check (true);
