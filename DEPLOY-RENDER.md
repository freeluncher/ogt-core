# Panduan Deployment Backend ke Render.com

Panduan langkah demi langkah untuk melakukan deploy aplikasi Node.js (OGT Webhook Backend) ke **Render.com** menggunakan free tier.

## Persiapan Repositori (GitHub/GitLab)
Render melakukan *pull* kode langsung dari repositori Git Anda.
1. Pastikan Anda sudah melakukan `git commit` untuk semua perubahan terbaru.
   - *Catatan: Pastikan file `.env` **TIDAK** ikut ter-commit (sudah masuk di `.gitignore`).*
2. Push kode Anda ke repository GitHub, GitLab, atau Bitbucket.

---

## Langkah Deployment di Render

### 1. Buat Web Service Baru
1. Login ke dashboard [Render.com](https://render.com/).
2. Klik tombol **New +** di sudut kanan atas, lalu pilih **Web Service**.
3. Pilih opsi **"Build and deploy from a Git repository"** lalu klik **Next**.
4. Hubungkan akun GitHub/GitLab Anda, lalu pilih repository proyek ini (misal: `ogt-core` atau `ogt-webhook-backend`).

### 2. Konfigurasi Service
Isi pengaturan server sebagai berikut:
- **Name:** Bebas (misal: `ogt-webhook-backend`)
- **Region:** Pilih yang terdekat (misal: `Singapore` atau `Frankfurt`)
- **Branch:** `main` (atau branch utama Anda)
- **Root Directory:** Jika kode backend ada di dalam folder `backend/`, ketik `backend`. Jika di root, biarkan kosong.
- **Runtime:** `Node`
- **Build Command:** `npm install`
- **Start Command:** `npm start` *(atau `node src/index.js`)*
- **Instance Type:** Pilih **Free** ($0/month).

### 3. Memasukkan Environment Variables (.env)
Karena kita tidak mengunggah file `.env` ke GitHub, kita harus memasukkan isinya secara manual ke server Render.
1. Scroll ke bawah dan klik tombol **Advanced**.
2. Cari bagian **Environment Variables**, klik **Add Environment Variable**.
3. Masukkan semua variable rahasia dari `.env` lokal Anda satu per satu:
   - `WEBHOOK_SECRET` = `whsec_...`
   - `SUPABASE_URL` = `https://...`
   - `SUPABASE_SERVICE_KEY` = `eyJhbG...`
   - `CLOUDCONVERT_API_KEY` = `eyJ0...`
   
   *(Catatan: Anda tidak perlu memasukkan variable `PORT`, karena Render akan mengatur port-nya sendiri secara otomatis).*

### 4. Proses Deploy
1. Klik tombol **Create Web Service** di paling bawah.
2. Render akan mulai menarik kode Anda, menjalankan `npm install`, dan menjalankan server.
3. Tunggu hingga status di pojok kiri atas berubah dari *In Progress* menjadi **Live** (warna hijau).
4. Di pojok kiri atas, Anda akan melihat URL publik backend Anda (misal: `https://ogt-webhook-backend.onrender.com`).

---

## Mengatur Endpoint Webhook di Siagga
Sekarang server Anda sudah online. Anda perlu memberi tahu Siagga ke mana harus mengirim data.
1. Buka dashboard Siagga tempat Anda membuat *ItineraryExtractor*.
2. Arahkan *Webhook URL* ke endpoint aplikasi Anda, yaitu:
   👉 `https://[NAMA-APP-RENDER-ANDA].onrender.com/api/webhooks/itinerary-json`
3. Pastikan Siagga disetel untuk mengirim header rahasia:
   - **Key:** `X-Webhook-Secret`
   - **Value:** `(isi dengan nilai WEBHOOK_SECRET yang sama persis)`

---

## Tips Mencegah "Sleep" (Penting untuk Free Tier)
Render versi gratis akan menidurkan (*sleep*) server jika tidak ada request selama 15 menit. Saat tertidur, request pertama yang masuk (dari Siagga) bisa mengalami *delay* hingga 30 detik (bahkan timeout).

Untuk mencegahnya:
1. Buat akun gratis di [cron-job.org](https://cron-job.org/).
2. Buat *cron job* baru yang menge-ping URL health check Anda setiap 10 menit:
   - **URL:** `https://[NAMA-APP-RENDER-ANDA].onrender.com/api/health`
   - **Schedule:** Setiap 10 menit.
3. Ini akan membuat backend Anda terus terbangun dan siap menerima data dari Siagga kapan saja tanpa delay!
