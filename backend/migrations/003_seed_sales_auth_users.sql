-- ============================================================
-- Migration 003: Seed 3 akun Supabase Auth utk sales + link ke tabel `sales`
-- Oriental Gate Travel — Web App Quotation Builder (MVP2)
-- ============================================================
-- PENTING — baca dulu sebelum run:
--
-- 1. Ini bikin user Auth langsung lewat SQL (insert ke auth.users + auth.identities),
--    bukan lewat Admin API/Dashboard resmi Supabase. Ini workaround yang umum dipakai
--    (hash password pakai pgcrypto crypt()/bcrypt, format sama persis dgn yg dipakai
--    GoTrue/Supabase Auth internal) — TAPI kalau mau cara resmi & lebih aman, bisa juga
--    lewat Dashboard: Authentication > Users > Add User, lalu tinggal jalankan
--    bagian "UPDATE public.sales" di bawah aja buat link auth_user_id-nya.
--
-- 2. GANTI SEMUA value di bawah ini SEBELUM run:
--    - email: pakai email asli tiap sales
--    - password: GANTI dari 'GANTI_PASSWORD_SALES_x' ke password kuat asli
--    Sales bisa ganti password sendiri nanti lewat Dashboard > Authentication > Users >
--    pilih user > "Send password recovery" (kirim link reset ke email mereka).
--
-- 3. File ini JANGAN dicommit ke git kalau sudah diisi password asli — commit versi
--    dengan placeholder saja, atau jalankan langsung dari SQL Editor tanpa disimpan.
--
-- 4. Jalankan lewat: Supabase Dashboard > SQL Editor > paste & run (satu kali saja —
--    kalau run ulang dgn email yang sama akan error "duplicate key", itu tandanya
--    user sudah pernah dibuat, aman untuk skip).

create extension if not exists pgcrypto with schema extensions;

-- ─── Sales 1 ─────────────────────────────────────────────────────────────────
with new_user as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated', 'authenticated',
    'sales1@orientalgatetravel.com',                        -- ganti ke email asli
    crypt('GANTI_PASSWORD_SALES_1', gen_salt('bf')),         -- ganti ke password asli
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(), now(), '', '', '', ''
  )
  returning id, email
),
new_identity as (
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), new_user.id, new_user.id::text,
         jsonb_build_object('sub', new_user.id::text, 'email', new_user.email),
         'email', now(), now(), now()
  from new_user
)
update public.sales
set email = new_user.email, auth_user_id = new_user.id
from new_user
where public.sales.email = 'sales1@orientalgatetravel.com';  -- cocokkan placeholder dari migration 002

-- ─── Sales 2 ─────────────────────────────────────────────────────────────────
with new_user as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated', 'authenticated',
    'sales2@orientalgatetravel.com',
    crypt('GANTI_PASSWORD_SALES_2', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(), now(), '', '', '', ''
  )
  returning id, email
),
new_identity as (
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), new_user.id, new_user.id::text,
         jsonb_build_object('sub', new_user.id::text, 'email', new_user.email),
         'email', now(), now(), now()
  from new_user
)
update public.sales
set email = new_user.email, auth_user_id = new_user.id
from new_user
where public.sales.email = 'sales2@orientalgatetravel.com';

-- ─── Sales 3 ─────────────────────────────────────────────────────────────────
with new_user as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated', 'authenticated',
    'sales3@orientalgatetravel.com',
    crypt('GANTI_PASSWORD_SALES_3', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(), now(), '', '', '', ''
  )
  returning id, email
),
new_identity as (
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), new_user.id, new_user.id::text,
         jsonb_build_object('sub', new_user.id::text, 'email', new_user.email),
         'email', now(), now(), now()
  from new_user
)
update public.sales
set email = new_user.email, auth_user_id = new_user.id
from new_user
where public.sales.email = 'sales3@orientalgatetravel.com';

-- ─── Verifikasi ────────────────────────────────────────────────────────────
select id, name, email, auth_user_id, is_active from public.sales order by name;
