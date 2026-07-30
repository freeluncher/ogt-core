-- ============================================================
-- Migration 002: Sales, Services Catalog, Quotations
-- Oriental Gate Travel — Web App Quotation Builder (MVP2)
-- Sesuai plan "Web App Quotation Builder — Sales UI (MVP2)"
-- ============================================================
-- Jalankan lewat: Supabase Dashboard > SQL Editor > paste & run

-- ─── Tabel sales (3 akun, dipetakan ke Supabase Auth) ───────────────────────
create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  auth_user_id uuid references auth.users(id),
  is_active boolean not null default true,
  created_at timestamptz default now()
);

-- ─── Katalog service — pengganti margin_rules (city+vehicle doang) ─────────
-- margin_rules dibiarkan ada (deprecated), tidak dihapus.
create table if not exists services_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,        -- 'transport' | 'ticket' | 'guide' | 'transfer' | 'hotel' | 'other'
  city text,
  unit_cost numeric not null default 0,
  margin_percent numeric not null default 20,
  unit_type text not null default 'flat',  -- 'flat' | 'per_day' | 'per_pax' | 'per_km'
  currency text not null default 'IDR',
  is_active boolean not null default true,
  notes text,
  created_at timestamptz default now()
);

create index if not exists idx_services_catalog_lookup on services_catalog(category, city, is_active);

-- ─── itinerary_submissions: kolom sales_id ──────────────────────────────────
alter table itinerary_submissions
  add column if not exists sales_id uuid references sales(id);

create index if not exists idx_itinerary_submissions_sales_id on itinerary_submissions(sales_id);

-- ─── Tabel quotations — draft harga per submission, editable sales ─────────
create table if not exists quotations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references itinerary_submissions(id),
  sales_id uuid references sales(id),
  status text not null default 'draft',   -- 'draft' | 'generated' | 'sent'
  line_items jsonb not null default '[]', -- [{service_id,name,city,day_no,qty,unit_cost,margin_percent,harga_jual,source}]
  total_harga numeric not null default 0,
  total_harga_formatted text,
  quotation_docx_url text,
  generated_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_quotations_submission_id on quotations(submission_id);
create index if not exists idx_quotations_sales_id on quotations(sales_id);
create index if not exists idx_quotations_status on quotations(status);

-- ─── Seed 3 sales (isi email asli setelah akun Supabase Auth dibuat) ───────
insert into sales (name, email)
values
  ('Sales 1', 'sales1@orientalgatetravel.com'),
  ('Sales 2', 'sales2@orientalgatetravel.com'),
  ('Sales 3', 'sales3@orientalgatetravel.com')
on conflict (email) do nothing;

-- ─── Seed services_catalog dari data dummy margin_rules + kategori baru ────
insert into services_catalog (name, category, city, unit_cost, margin_percent, unit_type, currency, notes)
values
  ('Private Car', 'transport', 'Chengdu',     3500000, 25, 'per_day', 'IDR', 'Tarif dummy untuk testing'),
  ('Private Car', 'transport', 'Jiuzhaigou',  4000000, 25, 'per_day', 'IDR', 'Tarif dummy untuk testing'),
  ('Private Car', 'transport', 'Zhangjiajie', 3800000, 25, 'per_day', 'IDR', 'Tarif dummy untuk testing'),
  ('Private Car', 'transport', 'Shanghai',    4500000, 25, 'per_day', 'IDR', 'Tarif dummy untuk testing'),
  ('Private Car', 'transport', 'Beijing',     4200000, 25, 'per_day', 'IDR', 'Tarif dummy untuk testing'),
  ('Private Car', 'transport', 'Guangzhou',   4000000, 25, 'per_day', 'IDR', 'Tarif dummy untuk testing'),
  ('Private Car', 'transport', 'Kunming',     3600000, 25, 'per_day', 'IDR', 'Tarif dummy untuk testing'),
  ('Private Car', 'transport', 'Umum',        4000000, 25, 'per_day', 'IDR', 'Fallback jika kota tidak ada di list'),
  ('Tour Guide',  'guide',     'Umum',        2500000, 20, 'per_day', 'IDR', 'Tarif dummy tour guide — skip di arrival/departure-only day & theme park (PRICING_RULES.md §7/§9)'),
  ('Airport/Station Transfer', 'transfer', 'Umum', 800000, 20, 'flat', 'IDR', 'Transfer bandara/stasiun ke hotel atau sebaliknya'),
  ('Ticket Assistance', 'ticket', 'Umum', 0, 0, 'flat', 'IDR', 'Placeholder — isi per destinasi, dipakai di theme park (PRICING_RULES.md §9)')
on conflict do nothing;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table sales enable row level security;
alter table services_catalog enable row level security;
alter table quotations enable row level security;

create policy "Service role full access sales"
  on sales for all to service_role using (true) with check (true);

create policy "Service role full access services_catalog"
  on services_catalog for all to service_role using (true) with check (true);

create policy "Service role full access quotations"
  on quotations for all to service_role using (true) with check (true);
