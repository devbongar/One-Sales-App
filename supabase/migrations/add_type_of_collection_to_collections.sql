alter table public.collections
  add column if not exists type_of_collection text
    check (type_of_collection in ('Admin Fee', 'Developer''s Incentive', 'Penalties'));
