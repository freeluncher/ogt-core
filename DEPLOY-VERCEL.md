# Panduan Deployment Backend ke Vercel

Jika Anda tidak memiliki kartu kredit/debit (Visa/Mastercard) untuk Render, **Vercel** adalah alternatif terbaik. Vercel memberikan free tier (Hobby) selamanya **tanpa syarat kartu kredit** (cukup daftar pakai akun GitHub). 

Selain itu, Vercel bekerja secara *Serverless*, sehingga tidak ada *sleep delay* seperti pada Render!

Kode backend Anda telah disesuaikan agar bisa berjalan dengan lancar di Vercel (file `vercel.json` telah ditambahkan).

---

## Langkah Deployment di Vercel

### 1. Persiapan Repositori (GitHub/GitLab)
1. Lakukan `git add .`, `git commit -m "Siap deploy ke Vercel"`.
2. Push kode ke repository GitHub Anda.
   *(Pastikan file `.env` tidak ikut ter-push karena masuk `.gitignore`)*

### 2. Buat Project Baru di Vercel
1. Buka [Vercel.com](https://vercel.com/) dan daftar/login menggunakan akun GitHub Anda.
2. Di Dashboard utama, klik tombol **Add New...** lalu pilih **Project**.
3. Di bagian *Import Git Repository*, temukan repository proyek Anda dan klik **Import**.

### 3. Konfigurasi Project & Environment Variables
Pada layar konfigurasi, setel hal-hal berikut:
- **Project Name:** Bebas (misalnya `ogt-webhook-backend`).
- **Framework Preset:** Biarkan `Other`.
- **Root Directory:** Jika file `package.json` dan `vercel.json` berada di dalam folder `backend/`, klik *Edit* lalu pilih folder `backend`. Jika di *root* repository, biarkan saja.
- **Environment Variables:** Buka panel Environment Variables, lalu masukkan kunci dari `.env` lokal Anda satu per satu:
  - `WEBHOOK_SECRET` = `whsec_...`
  - `SUPABASE_URL` = `https://...`
  - `SUPABASE_SERVICE_KEY` = `eyJhbG...`
  - `CLOUDCONVERT_API_KEY` = `eyJ0...`

### 4. Proses Deploy
1. Klik tombol **Deploy**.
2. Vercel akan menarik kode Anda, menginstall *dependencies*, dan melakukan deployment. Proses ini biasanya kurang dari 1 menit.
3. Setelah selesai, layar akan menampilkan ucapan selamat (🎉) beserta URL publik aplikasi Anda (misal: `https://ogt-webhook-backend.vercel.app`).

---

## Mengatur Endpoint Webhook di Siagga
Sekarang server Anda sudah online di Vercel. Anda perlu memberi tahu Siagga.
1. Buka dashboard Siagga tempat Anda membuat flow *ItineraryExtractor*.
2. Arahkan *Webhook URL* ke endpoint aplikasi Anda, yaitu:
   👉 `https://[NAMA-APP-VERCEL-ANDA].vercel.app/api/webhooks/itinerary-json`
3. Pastikan Siagga disetel untuk mengirim header rahasia:
   - **Key:** `X-Webhook-Secret`
   - **Value:** `(isi dengan nilai WEBHOOK_SECRET Anda)`

**Selesai!** Berbeda dengan Render, di Vercel Anda tidak perlu repot membuat *cron-job* untuk mencegah server tidur karena arsitektur serverless Vercel selalu siap memproses request kapan pun.
