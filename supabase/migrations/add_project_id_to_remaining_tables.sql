-- Add project_id to remaining tables that store project as a plain text name.
-- focus_project on Salesperson / broker_personnel is a pipe-separated multi-value field
-- and is only used for UI filtering — skipped here, handled separately.

-- ── 1. reservations ───────────────────────────────────────────────────────────

alter table public.reservations
  add column if not exists project_id text;

update public.reservations r
set project_id = p.project_id
from public.projects p
where p.name = r.project
  and r.project_id is null;

-- ── 2. commission_schedule ────────────────────────────────────────────────────

alter table public.commission_schedule
  add column if not exists project_id text;

update public.commission_schedule cs
set project_id = p.project_id
from public.projects p
where p.name = cs.project
  and cs.project_id is null;

-- ── 3. requests_and_inquiries ─────────────────────────────────────────────────

alter table public.requests_and_inquiries
  add column if not exists project_id text;

update public.requests_and_inquiries ri
set project_id = p.project_id
from public.projects p
where p.name = ri.project_name
  and ri.project_id is null;
