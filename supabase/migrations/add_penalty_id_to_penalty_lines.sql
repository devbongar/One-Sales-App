-- Add penalty_id column to penalty_lines with format PEN-xxxxxxx (7-digit zero-padded sequence).

create sequence if not exists public.penalty_id_seq start 1;

alter table public.penalty_lines
  add column if not exists penalty_id text unique;

-- Auto-generate penalty_id on insert if not supplied
create or replace function public.set_penalty_id()
returns trigger
language plpgsql
as $$
begin
  if new.penalty_id is null then
    new.penalty_id := 'PEN-' || lpad(nextval('public.penalty_id_seq')::text, 7, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_penalty_id on public.penalty_lines;
create trigger trg_set_penalty_id
  before insert on public.penalty_lines
  for each row execute function public.set_penalty_id();

-- Backfill existing rows that have no penalty_id
update public.penalty_lines
set penalty_id = 'PEN-' || lpad(nextval('public.penalty_id_seq')::text, 7, '0')
where penalty_id is null;
