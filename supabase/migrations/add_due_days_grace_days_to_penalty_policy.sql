-- Add grace_days to penalty_policy.
-- due_days are NOT stored here — they are read live from due_date_assignments.due_date.
-- run_days stays as a cached display value derived from due_date_assignments + grace_days.

alter table public.penalty_policy
  add column if not exists grace_days int not null default 11;

update public.penalty_policy
set grace_days = 11
where id = 1;

notify pgrst, 'reload schema';
