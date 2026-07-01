-- receivables_database.id is bigint, not uuid.
-- Drop the wrong column and re-add it with the correct type.
-- Safe to run even if penalty_lines is empty.

alter table public.penalty_lines
  drop column if exists receivable_line_id;

alter table public.penalty_lines
  add column receivable_line_id bigint unique;
