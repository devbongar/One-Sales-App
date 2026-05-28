-- Add position_rank column to Brokers table
-- All existing rows default to 'PS' for now

alter table public."Brokers"
  add column if not exists position_rank text default 'PS';

update public."Brokers"
set position_rank = 'PS'
where position_rank is null;
