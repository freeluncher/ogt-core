-- ============================================================
-- Migration 001: Initial Schema
-- Oriental Gate Travel — Webhook Backend MVP
-- Sesuai §5 PRD (skema tidak boleh diubah tanpa alasan kuat)
-- ============================================================
-- Jalankan lewat: Supabase Dashboard > SQL Editor > paste & run

-- ─── Tabel utama: satu row per webhook masuk ────────────────────────────────
create table if not exists itinerary_submissions (
  id uuid primary key default gen_random_uuid(),
  contact_name text,
  phone text,
  nama_klien text,
  jumlah_pax text,
  tipe_tour text,
  durasi text,
  destinasi jsonb,
  tanggal_mulai text,
  tanggal_selesai text,
  kendaraan text,
  bagasi text,
  itinerary_harian jsonb,
  catatan_operasional jsonb,
  raw_payload jsonb,            -- payload asli dari Siagga, untuk debug
  status text default 'received',  -- received | processed | failed
  error_message text,
  itinerary_pdf_url text,
  quotation_pdf_url text,
  created_at timestamptz default now()
);

-- Index untuk query by status dan phone (monitoring)
create index if not exists idx_itinerary_submissions_status on itinerary_submissions(status);
create index if not exists idx_itinerary_submissions_phone on itinerary_submissions(phone);
create index if not exists idx_itinerary_submissions_created_at on itinerary_submissions(created_at desc);

-- ─── Tabel margin rules ──────────────────────────────────────────────────────
-- Edit manual lewat Supabase Table Editor (tidak ada UI admin di MVP)
create table if not exists margin_rules (
  id uuid primary key default gen_random_uuid(),
  item_type text not null,      -- 'private_car' | 'private_van' | 'private_bus' | 'tour_guide' | dst
  city text not null,           -- nama kota, contoh: 'Chengdu', 'Shanghai', 'Beijing'
  base_cost numeric not null default 0,
  margin_percent numeric not null default 20,
  currency text not null default 'IDR',
  is_active boolean not null default true,
  notes text,                   -- catatan opsional (contoh: "tarif high season")
  updated_at timestamptz default now()
);

create index if not exists idx_margin_rules_lookup on margin_rules(item_type, city, is_active);

-- ─── Seed data dummy untuk testing ──────────────────────────────────────────
-- Hapus atau update sesuai tarif aktual sebelum production
insert into margin_rules (item_type, city, base_cost, margin_percent, currency, notes)
values
  ('private_car', 'Chengdu',      3500000, 25, 'IDR', 'Tarif dummy untuk testing'),
  ('private_car', 'Jiuzhaigou',   4000000, 25, 'IDR', 'Tarif dummy untuk testing'),
  ('private_car', 'Zhangjiajie',  3800000, 25, 'IDR', 'Tarif dummy untuk testing'),
  ('private_car', 'Shanghai',     4500000, 25, 'IDR', 'Tarif dummy untuk testing'),
  ('private_car', 'Beijing',      4200000, 25, 'IDR', 'Tarif dummy untuk testing'),
  ('private_car', 'Guangzhou',    4000000, 25, 'IDR', 'Tarif dummy untuk testing'),
  ('private_car', 'Kunming',      3600000, 25, 'IDR', 'Tarif dummy untuk testing'),
  ('private_car', 'Umum',         4000000, 25, 'IDR', 'Fallback jika kota tidak ada di list'),
  ('tour_guide',  'Umum',         2500000, 20, 'IDR', 'Tarif dummy tour guide')
on conflict do nothing;

-- ─── RLS (Row Level Security) ────────────────────────────────────────────────
-- Backend menggunakan service key, jadi RLS tidak blocking.
-- Tapi aktifkan untuk best practice — service key bypass RLS otomatis.
alter table itinerary_submissions enable row level security;
alter table margin_rules enable row level security;

-- Izinkan service role (dipakai backend) full akses
create policy "Service role full access itinerary_submissions"
  on itinerary_submissions
  for all
  to service_role
  using (true)
  with check (true);

create policy "Service role full access margin_rules"
  on margin_rules
  for all
  to service_role
  using (true)
  with check (true);
