-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add sales_invoice_number column to receivables_database
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.receivables_database
  add column if not exists sales_invoice_number text;
