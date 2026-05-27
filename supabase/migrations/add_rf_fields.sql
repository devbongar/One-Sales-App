-- ─────────────────────────────────────────────────────────────
-- Migration: add reservation fee (RF) fields to reservations
-- Run this in your Supabase SQL editor
-- ─────────────────────────────────────────────────────────────

alter table public.reservations
  add column if not exists acknowledgement_receipt_no text,
  add column if not exists sales_invoice_no           text,
  add column if not exists date_of_reservation_fee    date;
