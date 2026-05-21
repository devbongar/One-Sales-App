-- ─────────────────────────────────────────────────────────────
-- One Sales App — Supabase schema
-- Run this in your Supabase SQL editor
-- ─────────────────────────────────────────────────────────────

-- Users table (custom, no Supabase Auth)
create table if not exists public.users (
  id           uuid primary key default gen_random_uuid(),
  email        text unique not null,
  password_hash text not null,
  full_name    text not null,
  role         text not null default 'agent' check (role in ('agent', 'manager', 'admin')),
  created_at   timestamptz not null default now()
);

-- Projects table
create table if not exists public.projects (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  description     text,
  location        text not null,
  property_type   text not null,
  residence_type  text not null,
  floors          integer not null default 1,
  no_of_units     integer not null default 0,
  no_of_parkings  integer not null default 0,
  cover_photo_url text,
  photos          jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);

-- App settings table (key-value store)
create table if not exists public.app_settings (
  key        text primary key,
  value      text not null default ''
);

-- Row Level Security (enable but allow all for now — restrict later)
alter table public.users        enable row level security;
alter table public.projects     enable row level security;
alter table public.app_settings enable row level security;

create policy "Allow all for now" on public.users        for all using (true) with check (true);
create policy "Allow all for now" on public.projects     for all using (true) with check (true);
create policy "Allow all for now" on public.app_settings for all using (true) with check (true);

-- ─────────────────────────────────────────────────────────────
-- Sample admin user (password: Admin@1234)
-- Generate your own hash with: bcrypt.hashSync('yourpassword', 10)
-- ─────────────────────────────────────────────────────────────
-- insert into public.users (email, password_hash, full_name, role)
-- values ('admin@onesales.com', '$2a$10$...your_hash_here...', 'Admin User', 'admin');
