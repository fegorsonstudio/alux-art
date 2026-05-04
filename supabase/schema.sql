-- Alux Art production Supabase schema.
-- Run this once in the Supabase SQL editor for the production project.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  currency text not null default 'NGN' check (currency in ('NGN', 'USD')),
  region text not null default 'NG',
  banned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.identity_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null,
  size bigint not null default 0,
  storage_bucket text not null default 'identity-images',
  storage_path text not null,
  fingerprint text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  unique (user_id, fingerprint)
);

create table if not exists public.shoots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  owner_email text not null,
  mode text not null check (mode in ('fast', 'advanced')),
  aspect_ratio text not null default '3:4',
  currency text not null default 'NGN' check (currency in ('NGN', 'USD')),
  status text not null default 'DRAFT',
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  pipeline_stage text not null default 'Draft',
  quote jsonb not null default '{}'::jsonb,
  identity_profile jsonb not null default '{}'::jsonb,
  shoot_brief jsonb not null default '{}'::jsonb,
  zip_status text not null default 'LOCKED',
  zip_storage_bucket text,
  zip_storage_path text,
  zip_file_size bigint,
  zip_ready_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shoot_references (
  id uuid primary key default gen_random_uuid(),
  shoot_id uuid not null references public.shoots(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('identity', 'inspiration', 'custom')),
  tag text,
  custom_name text,
  note text,
  name text not null,
  type text not null,
  size bigint not null default 0,
  storage_bucket text not null,
  storage_path text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.shoot_images (
  id uuid primary key default gen_random_uuid(),
  shoot_id uuid not null references public.shoots(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  slot integer not null check (slot between 1 and 10),
  kind text not null,
  status text not null default 'PENDING',
  stage text not null default 'Waiting',
  provider text,
  provider_error text,
  configured_model text,
  api_model text,
  fallback_model text,
  preview_storage_bucket text,
  preview_storage_path text,
  download_storage_bucket text,
  download_storage_path text,
  instagram_storage_bucket text,
  instagram_storage_path text,
  original_dimensions jsonb,
  final_dimensions jsonb,
  target_dimensions jsonb,
  upscaled boolean not null default false,
  file_size bigint not null default 0,
  preview_file_size bigint not null default 0,
  instagram_file_size bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shoot_id, slot)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  shoot_id uuid not null references public.shoots(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'PENDING',
  currency text not null,
  amount numeric(12, 2) not null,
  provider text not null default 'paystack',
  provider_reference text unique,
  metadata jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.download_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shoot_id uuid not null references public.shoots(id) on delete cascade,
  image_id uuid references public.shoot_images(id) on delete set null,
  type text not null,
  bytes bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.pricing_configs (
  id boolean primary key default true,
  ngn numeric(12, 2) not null default 25000,
  usd numeric(12, 2) not null default 29,
  updated_at timestamptz not null default now(),
  constraint pricing_configs_singleton check (id)
);

create table if not exists public.model_slots (
  slot integer primary key check (slot between 1 and 10),
  model text not null,
  fallback text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.generation_events (
  id uuid primary key default gen_random_uuid(),
  shoot_id uuid not null references public.shoots(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text not null,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.pricing_configs (id, ngn, usd)
values (true, 25000, 29)
on conflict (id) do nothing;

insert into public.model_slots (slot, model, fallback, enabled)
select slot, 'openai/gpt-5.4-image-2', 'google/gemini-3.1-flash-image-preview', true
from generate_series(1, 10) as slot
on conflict (slot) do nothing;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'fegorsonphotography@gmail.com';
$$;

alter table public.profiles enable row level security;
alter table public.identity_images enable row level security;
alter table public.shoots enable row level security;
alter table public.shoot_references enable row level security;
alter table public.shoot_images enable row level security;
alter table public.payments enable row level security;
alter table public.download_logs enable row level security;
alter table public.pricing_configs enable row level security;
alter table public.model_slots enable row level security;
alter table public.generation_events enable row level security;
alter table public.admin_audit_logs enable row level security;

drop policy if exists "profiles own select" on public.profiles;
drop policy if exists "profiles own insert" on public.profiles;
drop policy if exists "profiles own update" on public.profiles;
drop policy if exists "identity owner access" on public.identity_images;
drop policy if exists "shoot owner access" on public.shoots;
drop policy if exists "reference owner access" on public.shoot_references;
drop policy if exists "image owner access" on public.shoot_images;
drop policy if exists "payment owner read" on public.payments;
drop policy if exists "payment owner insert" on public.payments;
drop policy if exists "payment admin update" on public.payments;
drop policy if exists "download owner access" on public.download_logs;
drop policy if exists "generation event owner read" on public.generation_events;
drop policy if exists "generation event service insert" on public.generation_events;
drop policy if exists "audit admin read" on public.admin_audit_logs;
drop policy if exists "audit admin insert" on public.admin_audit_logs;
drop policy if exists "pricing read" on public.pricing_configs;
drop policy if exists "pricing admin write" on public.pricing_configs;
drop policy if exists "model slots read" on public.model_slots;
drop policy if exists "model slots admin write" on public.model_slots;

create policy "profiles own select" on public.profiles for select using (auth.uid() = id or public.is_admin());
create policy "profiles own insert" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles own update" on public.profiles for update using (auth.uid() = id or public.is_admin()) with check (auth.uid() = id or public.is_admin());

create policy "identity owner access" on public.identity_images for all using (auth.uid() = user_id or public.is_admin()) with check (auth.uid() = user_id or public.is_admin());
create policy "shoot owner access" on public.shoots for all using (auth.uid() = user_id or public.is_admin()) with check (auth.uid() = user_id or public.is_admin());
create policy "reference owner access" on public.shoot_references for all using (auth.uid() = user_id or public.is_admin()) with check (auth.uid() = user_id or public.is_admin());
create policy "image owner access" on public.shoot_images for all using (auth.uid() = user_id or public.is_admin()) with check (auth.uid() = user_id or public.is_admin());
create policy "payment owner read" on public.payments for select using (auth.uid() = user_id or public.is_admin());
create policy "payment owner insert" on public.payments for insert with check (auth.uid() = user_id or public.is_admin());
create policy "payment admin update" on public.payments for update using (public.is_admin()) with check (public.is_admin());
create policy "download owner access" on public.download_logs for all using (auth.uid() = user_id or public.is_admin()) with check (auth.uid() = user_id or public.is_admin());
create policy "generation event owner read" on public.generation_events for select using (auth.uid() = user_id or public.is_admin());
create policy "generation event service insert" on public.generation_events for insert with check (auth.uid() = user_id or public.is_admin());
create policy "audit admin read" on public.admin_audit_logs for select using (public.is_admin());
create policy "audit admin insert" on public.admin_audit_logs for insert with check (public.is_admin());
create policy "pricing read" on public.pricing_configs for select using (auth.role() = 'authenticated');
create policy "pricing admin write" on public.pricing_configs for all using (public.is_admin()) with check (public.is_admin());
create policy "model slots read" on public.model_slots for select using (auth.role() = 'authenticated');
create policy "model slots admin write" on public.model_slots for all using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public)
values
  ('identity-images', 'identity-images', false),
  ('inspiration-images', 'inspiration-images', false),
  ('custom-references', 'custom-references', false),
  ('generated-previews', 'generated-previews', false),
  ('generated-4k', 'generated-4k', false),
  ('shoot-zips', 'shoot-zips', false),
  ('quote-instagram', 'quote-instagram', false)
on conflict (id) do update set public = false;

drop policy if exists "users upload own source files" on storage.objects;
drop policy if exists "users read own private files" on storage.objects;
drop policy if exists "users update own source files" on storage.objects;
drop policy if exists "users delete own source files" on storage.objects;

create policy "users upload own source files"
on storage.objects for insert
with check (
  bucket_id in ('identity-images', 'inspiration-images', 'custom-references')
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "users read own private files"
on storage.objects for select
using (
  (
    bucket_id in ('identity-images', 'inspiration-images', 'custom-references', 'generated-previews', 'generated-4k', 'shoot-zips', 'quote-instagram')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  or public.is_admin()
);

create policy "users update own source files"
on storage.objects for update
using (
  bucket_id in ('identity-images', 'inspiration-images', 'custom-references')
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id in ('identity-images', 'inspiration-images', 'custom-references')
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "users delete own source files"
on storage.objects for delete
using (
  bucket_id in ('identity-images', 'inspiration-images', 'custom-references')
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
