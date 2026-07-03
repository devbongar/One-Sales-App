-- Add commission_id and project_id columns to Commission_Tranching
-- commission_id: CMR-000001 — groups all tranche rows of one scheme
-- project_id:    PRJ-000001 — stable project reference (from projects table)

-- ── 1. Add project_id to projects table ──────────────────────────────────────
alter table public.projects add column if not exists project_id text unique;

with ranked as (
  select id, row_number() over (order by created_at, id) as rn
  from public.projects
  where project_id is null
)
update public.projects p
set project_id = 'PRJ-' || lpad(r.rn::text, 6, '0')
from ranked r
where p.id = r.id;

-- ── 2. Add columns to Commission_Tranching ────────────────────────────────────
alter table public."Commission_Tranching"
  add column if not exists commission_id text,
  add column if not exists project_id    text;

-- ── 3. Backfill commission_id: one CMR-XXXXXX per unique scheme group ─────────
with scheme_groups as (
  select
    "Project",
    "Position Rank",
    "Product Type",
    "Seller Type",
    commission_type,
    effectivity_start,
    effectivity_end,
    row_number() over (
      order by
        "Project",
        "Position Rank",
        "Product Type",
        "Seller Type",
        commission_type,
        effectivity_start nulls first,
        effectivity_end   nulls first
    ) as rn
  from (
    select distinct
      "Project", "Position Rank", "Product Type", "Seller Type",
      commission_type, effectivity_start, effectivity_end
    from public."Commission_Tranching"
    where commission_id is null
  ) sub
)
update public."Commission_Tranching" ct
set commission_id = 'CMR-' || lpad(g.rn::text, 6, '0')
from scheme_groups g
where ct."Project"       = g."Project"
  and ct."Position Rank" = g."Position Rank"
  and ct."Product Type"  = g."Product Type"
  and ct."Seller Type"   = g."Seller Type"
  and ct.commission_type = g.commission_type
  and (ct.effectivity_start = g.effectivity_start or (ct.effectivity_start is null and g.effectivity_start is null))
  and (ct.effectivity_end   = g.effectivity_end   or (ct.effectivity_end   is null and g.effectivity_end   is null))
  and ct.commission_id is null;

-- ── 4. Backfill project_id on Commission_Tranching from projects table ────────
update public."Commission_Tranching" ct
set project_id = p.project_id
from public.projects p
where p.name = ct."Project"
  and ct.project_id is null
  and p.project_id is not null;
