# Panduan Deployment ke Vercel (Backend + Frontend — Satu Project)

Jika Anda tidak memiliki kartu kredit/debit (Visa/Mastercard) untuk Render, **Vercel** adalah alternatif terbaik. Vercel memberikan free tier (Hobby) selamanya **tanpa syarat kartu kredit** (cukup daftar pakai akun GitHub).

Selain itu, Vercel bekerja secara *Serverless*, sehingga tidak ada *sleep delay* seperti pada Render!

**Update MVP2:** repo ini sekarang monorepo — `backend/` (Express, webhook + API sales) dan `frontend/` (Next.js, web app quotation builder) di-deploy sebagai **SATU Vercel project**, bukan dua. Routing diatur lewat `vercel.json` di root repo: request `/api/*` diarahkan ke `backend/src/index.js`, semua request lain diarahkan ke `frontend/`.

---

## Langkah Deployment di Vercel

### 1. Persiapan Repositori (GitHub/GitLab)
1. Lakukan `git add .`, `git commit -m "Siap deploy ke Vercel"`.
2. Push kode ke repository GitHub Anda.
   *(Pastikan file `.env`/`.env.local` tidak ikut ter-push karena masuk `.gitignore`)*

### 2. Buat Project Baru di Vercel
1. Buka [Vercel.com](https://vercel.com/) dan daftar/login menggunakan akun GitHub Anda.
2. Di Dashboard utama, klik tombol **Add New...** lalu pilih **Project**.
3. Di bagian *Import Git Repository*, temukan repository proyek Anda dan klik **Import**.

### 3. Konfigurasi Project & Environment Variables
Pada layar konfigurasi, setel hal-hal berikut:
- **Project Name:** Bebas (misalnya `ogt-quotation-app`).
- **Framework Preset:** Biarkan `Other` — jangan pilih `Next.js` (project pakai `builds`/`routes` custom di `vercel.json` root, bukan auto-detect satu framework).
- **Root Directory:** Biarkan di *root* repository (JANGAN diarahkan ke `backend/` atau `frontend/` — `vercel.json` di root yang menggabungkan keduanya).
- **Environment Variables:** Buka panel Environment Variables, masukkan SEMUA variabel berikut (backend + frontend jadi satu project, satu daftar env var):
  - `WEBHOOK_SECRET` = `whsec_...` (backend)
  - `SUPABASE_URL` = `https://...` (backend, service-role client)
  - `SUPABASE_SERVICE_KEY` = `eyJhbG...` (backend)
  - `NEXT_PUBLIC_SUPABASE_URL` = `https://...` (frontend, sama project Supabase, browser-safe)
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `eyJhbG...` (frontend, anon key — BUKAN service key)

  `CLOUDCONVERT_API_KEY` tidak perlu lagi — konversi PDF sudah dinonaktifkan, backend upload `.docx` langsung.

### 4. Proses Deploy
1. Klik tombol **Deploy**.
2. Vercel akan menarik kode Anda, build dua target (`@vercel/node` untuk `backend/`, `@vercel/next` untuk `frontend/`) sesuai `vercel.json`, lalu deploy.
3. Setelah selesai, layar akan menampilkan URL publik aplikasi Anda (misal: `https://ogt-quotation-app.vercel.app`) — satu domain untuk web app (halaman login/submissions) DAN endpoint API (`/api/...`).

---

## Mengatur Endpoint Webhook di Siagga
Sekarang server Anda sudah online di Vercel. Anda perlu memberi tahu Siagga.
1. Buka dashboard Siagga tempat Anda membuat flow *ItineraryExtractor*.
2. Arahkan *Webhook URL* ke endpoint aplikasi Anda, yaitu:
   👉 `https://[NAMA-APP-VERCEL-ANDA].vercel.app/api/webhooks/itinerary-json`
3. Pastikan Siagga disetel untuk mengirim header rahasia:
   - **Key:** `X-Webhook-Secret`
   - **Value:** `(isi dengan nilai WEBHOOK_SECRET Anda)`

Kalau sebelumnya sudah pernah deploy backend sendirian ke domain Vercel lain, cukup update URL ini ke domain project gabungan yang baru — path `/api/webhooks/itinerary-json` tidak berubah.

---

## Akses Web App (Sales Login)
Buka `https://[NAMA-APP-VERCEL-ANDA].vercel.app/login`, login pakai akun Supabase Auth yang sudah diseed (lihat `backend/migrations/002_sales_quotations_catalog.sql` + PRD.md §11).

**Selesai!** Berbeda dengan Render, di Vercel Anda tidak perlu repot membuat *cron-job* untuk mencegah server tidur karena arsitektur serverless Vercel selalu siap memproses request kapan pun.
