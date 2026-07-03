-- Replace pipe-separated focus_project text with proper junction tables keyed by project_id.
-- This ensures focus_project assignments survive project renames.

-- ── 1. salesperson_focus_projects ─────────────────────────────────────────────

create table if not exists public.salesperson_focus_projects (
  id         bigint generated always as identity primary key,
  seller_id  text not null,
  project_id text not null,
  unique (seller_id, project_id)
);

alter table public.salesperson_focus_projects enable row level security;

create policy "authenticated can manage salesperson focus projects"
  on public.salesperson_focus_projects for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on public.salesperson_focus_projects to authenticated;

-- ── 2. broker_focus_projects ──────────────────────────────────────────────────

create table if not exists public.broker_focus_projects (
  id           bigint generated always as identity primary key,
  personnel_id text not null,
  project_id   text not null,
  unique (personnel_id, project_id)
);

alter table public.broker_focus_projects enable row level security;

create policy "authenticated can manage broker focus projects"
  on public.broker_focus_projects for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on public.broker_focus_projects to authenticated;

-- ── 3. Backfill salesperson_focus_projects from Salesperson."Focus Project" ───

insert into public.salesperson_focus_projects (seller_id, project_id)
select
  sp."Seller Id",
  p.project_id
from public."Salesperson" sp
cross join lateral unnest(string_to_array(sp."Focus Project", ' | ')) as t(fp_name)
join public.projects p on p.name = trim(t.fp_name)
where sp."Seller Id" is not null
  and sp."Focus Project" is not null
  and trim(t.fp_name) <> ''
on conflict (seller_id, project_id) do nothing;

-- ── 4. Backfill broker_focus_projects from broker_personnel.focus_project ─────

insert into public.broker_focus_projects (personnel_id, project_id)
select
  bp.personnel_id,
  p.project_id
from public.broker_personnel bp
cross join lateral unnest(string_to_array(bp.focus_project, ' | ')) as t(fp_name)
join public.projects p on p.name = trim(t.fp_name)
where bp.personnel_id is not null
  and bp.focus_project is not null
  and trim(t.fp_name) <> ''
on conflict (personnel_id, project_id) do nothing;

-- ── 5. Update get_all_salespersons RPC to include focus_project_ids ───────────
-- focus_project_ids: pipe-separated project IDs from the junction table.
-- focus_project (name text) is kept as-is for display in existing UI.

drop function if exists public.get_all_salespersons();

create function public.get_all_salespersons()
returns table (
  seller_name            text,
  seller_id              text,
  position_code          text,
  position_rank          text,
  seller_group           text,
  focus_project          text,
  focus_project_ids      text,
  sales_manager          text,
  sales_manager_id       text,
  sales_director         text,
  sales_director_id      text,
  sales_division_head    text,
  sales_division_head_id text,
  sales_head             text,
  sales_head_id          text,
  sales_team             text
)
language sql security definer as $$
  select
    sp."Seller Name"            as seller_name,
    sp."Seller Id"              as seller_id,
    sp."POSITION CODE"          as position_code,
    sp.position_rank,
    sp."Sales Team"             as seller_group,
    sp."Focus Project"          as focus_project,
    (
      select string_agg(sfp.project_id, ' | ' order by sfp.project_id)
      from public.salesperson_focus_projects sfp
      where sfp.seller_id = sp."Seller Id"
    )                           as focus_project_ids,
    sp."Sales Manager"          as sales_manager,
    sp."Sales Manager ID"       as sales_manager_id,
    sp."Sales Director"         as sales_director,
    sp."Sales Director ID"      as sales_director_id,
    sp."Sales Division Head"    as sales_division_head,
    sp."Sales Division Head ID" as sales_division_head_id,
    sp."Sales Head"             as sales_head,
    sp."Sales Head ID"          as sales_head_id,
    sp."Sales Team"             as sales_team
  from public."Salesperson" sp
  where sp."Seller Status" = 'Active'
  order by sp."Seller Name";
$$;

grant execute on function public.get_all_salespersons() to authenticated, anon;

notify pgrst, 'reload schema';
