-- ─────────────────────────────────────────────────────────────
-- Migration: add position_rank column to Salesperson table
-- Maps full position names → abbreviations used in Commission_Tranching
-- Run this in your Supabase SQL editor
-- ─────────────────────────────────────────────────────────────

-- Add the column
alter table public."Salesperson"
  add column if not exists position_rank text;

-- Auto-populate from existing POSITION CODE values
update public."Salesperson"
set position_rank = case "POSITION CODE"
  when 'Property Specialist' then 'PS'
  when 'Sales Manager'       then 'SM'
  when 'Sales Director'      then 'SD'
  when 'Sales Division Head' then 'SDH'
  when 'Sales Head'          then 'SH'
  else null
end;
