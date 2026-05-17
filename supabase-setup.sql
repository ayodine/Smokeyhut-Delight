-- ============================================================
-- SMOKEYHUT DELIGHT — Supabase Schema Setup
-- Run this in Supabase SQL Editor: https://itpnfalqjjicesqcjzix.supabase.co
-- ============================================================

-- ── 1. CATEGORIES ────────────────────────────────────────────
create table if not exists public.categories (
  id   text primary key,
  label text not null,
  created_at timestamptz default now()
);
alter table public.categories enable row level security;

-- Public can read categories
create policy "Public read categories"
  on public.categories for select using (true);

-- Only authenticated users can write categories
create policy "Auth write categories"
  on public.categories for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Seed some categories (idempotent)
insert into public.categories (id, label) values
  ('whole-bird',   'Whole Bird'),
  ('portions',     'Portions'),
  ('rice-combos',  'Rice Combos'),
  ('drinks',       'Drinks'),
  ('sides',        'Sides')
on conflict (id) do nothing;

-- ── 2. PRODUCTS ──────────────────────────────────────────────
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  short_desc  text,
  price       numeric not null default 0,
  stock       int     not null default 0,
  category_id text references public.categories(id) on delete set null,
  badge       text,
  image       text,
  is_active   boolean default true,
  created_at  timestamptz default now()
);
alter table public.products enable row level security;

-- Public read active products
create policy "Public read products"
  on public.products for select using (true);

-- Auth users full access
create policy "Auth write products"
  on public.products for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ── 3. STORES ────────────────────────────────────────────────
create table if not exists public.stores (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  address   text,
  phone     text,
  zones     text[],
  hours     jsonb default '{"weekday":"8:00am - 6:00pm","sunday":"Closed"}',
  is_active boolean default true,
  revenue   numeric default 0,
  orders    int default 0,
  staff     int default 0,
  created_at timestamptz default now()
);
alter table public.stores enable row level security;

create policy "Public read stores"
  on public.stores for select using (true);

create policy "Auth write stores"
  on public.stores for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ── 4. PROFILES ──────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key default gen_random_uuid(),
  full_name   text,
  email       text,
  phone       text,
  role        text default 'customer',
  last_active timestamptz,
  created_at  timestamptz default now()
);
alter table public.profiles enable row level security;

create policy "Auth read profiles"
  on public.profiles for select
  using (auth.role() = 'authenticated');

create policy "Auth write profiles"
  on public.profiles for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ── 5. ORDERS ────────────────────────────────────────────────
create table if not exists public.orders (
  id               text primary key default 'ORD-' || upper(substring(gen_random_uuid()::text,1,8)),
  customer_name    text,
  customer_email   text,
  customer_phone   text,
  delivery_address text,
  store_id         uuid references public.stores(id) on delete set null,
  payment_method   text,
  total            numeric default 0,
  status           text default 'pending',
  notes            text,
  paid_at          timestamptz,
  payment_channel  text,
  paystack_ref     text,
  created_at       timestamptz default now()
);
alter table public.orders enable row level security;

-- Anon can insert orders (checkout)
create policy "Anon insert orders"
  on public.orders for insert
  with check (true);

-- Auth can read + manage all orders
create policy "Auth manage orders"
  on public.orders for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ── 6. ORDER ITEMS ───────────────────────────────────────────
create table if not exists public.order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   text references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name       text,
  price      numeric,
  qty        int default 1,
  created_at timestamptz default now()
);
alter table public.order_items enable row level security;

create policy "Anon insert order_items"
  on public.order_items for insert
  with check (true);

create policy "Auth manage order_items"
  on public.order_items for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ── 7. PAYMENTS ──────────────────────────────────────────────
create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  order_id      text references public.orders(id) on delete cascade,
  customer_name text,
  amount        numeric default 0,
  method        text,
  paystack_ref  text,
  status        text default 'pending',
  created_at    timestamptz default now()
);
alter table public.payments enable row level security;

create policy "Anon insert payments"
  on public.payments for insert
  with check (true);

create policy "Auth manage payments"
  on public.payments for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ── 8. SHIPMENTS ─────────────────────────────────────────────
create table if not exists public.shipments (
  id               uuid primary key default gen_random_uuid(),
  order_id         text references public.orders(id) on delete cascade,
  customer_name    text,
  delivery_address text,
  status           text default 'in_transit',
  dispatch_at      timestamptz default now(),
  delivered_at     timestamptz,
  created_at       timestamptz default now()
);
alter table public.shipments enable row level security;

create policy "Auth manage shipments"
  on public.shipments for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ── 9. COUPONS ──────────────────────────────────────────────
create table if not exists public.coupons (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  type              text not null default 'percent', -- 'percent' | 'fixed'
  value             numeric not null default 0,
  min_order_amount  numeric,
  max_uses          int,
  uses              int not null default 0,
  expires_at        timestamptz,
  is_active         boolean not null default true,
  created_at        timestamptz default now()
);
alter table public.coupons enable row level security;

-- Public can read active coupons (needed for validation at checkout)
create policy "Public read active coupons"
  on public.coupons for select using (true);

-- Auth users can manage coupons
create policy "Auth manage coupons"
  on public.coupons for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- RPC to safely increment use count (avoids race condition)
create or replace function increment_coupon_uses(coupon_id uuid)
returns void
language sql
security definer
as $$
  update public.coupons set uses = uses + 1 where id = coupon_id;
$$;

-- ── 9b. ORDERS — coupon columns (run if orders table already exists) ──
alter table public.orders
  add column if not exists coupon_code     text,
  add column if not exists coupon_discount numeric default 0;

-- ── 10. APP SETTINGS ─────────────────────────────────────────
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb,
  updated_at timestamptz default now()
);
alter table public.app_settings enable row level security;

-- Anyone can read settings (ticker, delivery options shown on storefront)
create policy "Public read app_settings"
  on public.app_settings for select using (true);

-- Only authenticated users can write settings
create policy "Auth write app_settings"
  on public.app_settings for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ============================================================
-- DONE! Tables created. Now go to:
-- Authentication > Users > Add user
-- and create your admin user in Supabase.
-- ============================================================

-- ── 11. INVENTORY ─────────────────────────────────────────────
ALTER TABLE inventory_items 
ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'consumable'
CHECK (category IN ('consumable', 'production'));
