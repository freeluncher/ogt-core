# PRD — Backend Webhook Handler untuk ItineraryExtractor
**Untuk:** Oriental Gate Travel
**Status:** Draft MVP — testing dengan layanan gratis, migrasi ke production menyusul
**Terhubung dengan:** `PRD-Sistem-Tour-Travel-China.md` (§4 Modul Quotation Management, §5 ERD `Quotation`), flow Siagga `ItineraryExtractor`

---

## 1. Latar Belakang & Tujuan

Flow `ItineraryExtractor` di Siagga sudah mengekstrak data dari dokumen Final Itinerary (PDF/DOCX) menjadi 11 custom field, lalu mengirimkannya sebagai JSON lewat webhook (Actions #2 — External API Request) ke sebuah endpoint eksternal. Endpoint itu **belum ada** — dokumen ini adalah PRD untuk membangunnya.

**Tujuan backend ini:**
1. Menerima payload webhook dari Siagga tiap kali Sales mengisi `Itinerary_file` pada kontak.
2. Menyimpan data mentah (audit trail).
3. Menghitung harga (margin rule) untuk tiap item layanan → jadi draft Quotation.
4. Generate dokumen Quotation (dan Itinerary final) sebagai file (.docx/.pdf) mengikuti template yang sudah ada (`OGT_Itinerary_Quotation_Monica_Red.docx`).
5. Mengembalikan URL dokumen hasil generate (lewat response, supaya bisa dipetakan balik ke Custom Field Siagga via Response Mapping — opsional, fase 2).

**Cakupan fase ini (MVP/testing):** cukup terima webhook → simpan → hitung dummy/placeholder margin → generate dokumen → return URL. Tidak perlu auth kompleks, tidak perlu UI admin dulu.

---

## 2. Kontrak API (Webhook Endpoint)

### 2.1 Request

```
POST /api/webhooks/itinerary-json
Content-Type: application/json
```

Body (persis seperti yang dikirim Siagga):

```json
{
  "contact_name": "Monica",
  "phone": "62812xxxxxxx",
  "source": "ItineraryExtractor",
  "nama_klien": "Monica",
  "jumlah_pax": "2 Pax",
  "tipe_tour": "Private Tour",
  "durasi": "9 Hari (Hari 1 - Hari 9)",
  "destinasi": "[\"Chengdu\",\"Jiuzhaigou\",\"Zhangjiajie\"]",
  "tanggal_mulai": "",
  "tanggal_selesai": "",
  "kendaraan": "Private Car",
  "bagasi": "",
  "itinerary_harian": "[{...array json per hari...}]",
  "catatan_operasional": "[\"...\",\"...\"]"
}
```

**Catatan penting:** semua value dari Siagga adalah **string**, termasuk yang isinya array/JSON (`destinasi`, `itinerary_harian`, `catatan_operasional`). Backend wajib `JSON.parse()` field-field ini dengan try/catch, karena strukturnya bisa tidak konsisten antar dokumen (lihat §6 Error Handling).

### 2.2 Response (sukses)

**Update MVP2 (lihat plan "Web App Quotation Builder — Sales UI"):** webhook TIDAK lagi generate dokumen secara langsung. Ia cuma parse+simpan submission, jalankan saran harga otomatis (rule-based, `serviceSuggester.js`), simpan sebagai draft `quotations`, lalu berhenti — tidak ada URL dokumen di response ini lagi. Generate dokumen dipindah ke `POST /api/quotations/:id/generate`, dipicu sales dari web app setelah review/edit harga (lihat §11).

```json
{
  "status": "ok",
  "quotation_id": "q_abc123",
  "submission_id": "uuid-itinerary-submissions",
  "review_status": "pending_review"
}
```

### 2.3 Response (gagal)

```json
{
  "status": "error",
  "message": "itinerary_harian tidak valid JSON",
  "raw_field": "itinerary_harian"
}
```
HTTP 422 untuk payload tidak valid, HTTP 500 untuk error internal. Siagga tidak retry otomatis — pastikan error tercatat di log (§7) supaya bisa ditindaklanjuti manual.

### 2.4 Keamanan

MVP testing: tambahkan **shared secret** sederhana lewat header, dicek di awal handler:

```
X-Webhook-Secret: <random-string-disimpan-di-env>
```

Header ini ditambahkan di node External API Request → tab **Headers** di Siagga (selain `Content-Type`). Tanpa ini, endpoint publik siapa saja bisa POST data palsu.

---

## 3. Arsitektur (MVP)

```
Siagga (ItineraryExtractor flow)
   │  POST JSON + X-Webhook-Secret
   ▼
Backend (Node.js/Express atau Python/FastAPI, hosted di Render free tier)
   │
   ├── 1. Validasi secret + payload
   ├── 2. Parse & normalisasi field (string → array/object)
   ├── 3. Simpan raw payload ke DB (audit trail)
   ├── 4. Hitung margin per item (rule engine sederhana, config JSON)
   ├── 5. Generate dokumen (docx → pdf) dari template
   ├── 6. Upload hasil ke storage (Supabase Storage free tier)
   └── 7. Return JSON response (url dokumen)

Database: Supabase Postgres (free tier)
Storage: Supabase Storage (free tier) — bucket public untuk PDF hasil generate
Hosting: Render.com free Web Service (auto-sleep saat idle, cukup untuk testing)
```

**Kenapa kombinasi ini:** satu akun Supabase sudah mencakup Postgres + Storage + Auth sekaligus (tidak perlu provisioning terpisah), dan Render free tier gampang deploy langsung dari GitHub repo tanpa kartu kredit. Kalau nanti pindah production, tinggal upgrade tier yang sama (tidak perlu migrasi platform).

---

## 4. Tech Stack

| Layer | Pilihan | Alasan |
|---|---|---|
| Runtime | Node.js 20 + Express (atau Python 3.11 + FastAPI) | Ringan, banyak contoh, mudah deploy free tier |
| Database | Supabase Postgres (free tier, 500MB) | Cukup untuk ratusan record testing, sudah termasuk REST API otomatis |
| Storage file hasil | Supabase Storage (free tier, 1GB) | Terintegrasi dengan DB yang sama, dapat public URL langsung |
| Generate docx | `docxtemplater` (Node) atau `python-docx` + Jinja-style placeholder (Python) | Isi ulang template `.docx` yang sudah ada tanpa desain ulang |
| Convert docx → pdf | LibreOffice headless (`soffice --headless --convert-to pdf`) di server, atau Gotenberg (Docker, ada free self-host) | Supaya customer terima PDF, bukan .docx |
| Hosting backend | Render.com Web Service (free tier) | Auto-deploy dari GitHub, gratis, cukup untuk testing (sleep setelah 15 menit idle — cukup untuk skenario Sales isi field lalu tunggu beberapa detik) |
| Environment/secrets | Render Environment Variables | Simpan `WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_KEY` |

**Alternatif kalau tim lebih familiar stack lain:** Railway.app (free trial credit) atau Fly.io (free allowance) sebagai pengganti Render — kontrak API & logic di atas tetap sama, hanya beda platform deploy.

---

## 5. Data Model (MVP)

```sql
-- tabel utama, satu row per webhook masuk
create table itinerary_submissions (
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
  raw_payload jsonb,           -- simpan payload asli, buat debug
  status text default 'received', -- received | processed | failed
  error_message text,
  itinerary_pdf_url text,
  quotation_pdf_url text,
  created_at timestamptz default now()
);

-- tabel margin rule sederhana, bisa diedit manual dulu tanpa UI (lewat Supabase Table Editor)
create table margin_rules (
  id uuid primary key default gen_random_uuid(),
  item_type text,        -- 'private_car' | 'tiket_masuk' | 'tour_guide' | dst
  city text,
  base_cost numeric,
  margin_percent numeric,
  currency text default 'IDR',
  is_active boolean default true
);
```

Field `destinasi`, `itinerary_harian`, `catatan_operasional` disimpan sebagai `jsonb` setelah di-parse dari string — kalau parsing gagal, simpan `null` dan catat di `error_message`, tapi tetap simpan `raw_payload` supaya tidak ada data hilang.

---

## 6. Error Handling

| Skenario | Penanganan |
|---|---|
| `X-Webhook-Secret` salah/kosong | Return 401, jangan proses apa pun |
| Field JSON-string gagal di-parse (mis. `itinerary_harian` bukan array valid) | Tetap simpan row dengan `status='failed'`, `raw_payload` lengkap, `error_message` jelas — supaya bisa diperbaiki manual dari data mentah |
| Field kosong (`tanggal_mulai`, `bagasi` sering kosong dari extraction) | Jangan gagalkan proses — isi placeholder `"(belum diisi)"` di dokumen, generate tetap jalan |
| Struktur `itinerary_harian` beda-beda (kadang array of object, kadang object dengan key "Hari 1") | Normalisasi di kode: cek `Array.isArray()`, kalau bukan array, convert `Object.entries()` jadi array `{day_label, activities}` |
| Convert docx→pdf gagal (LibreOffice/Gotenberg error) | Tetap return docx URL sebagai fallback, log error, jangan blocking response |

---

## 7. Logging & Monitoring (MVP)

- Log setiap request masuk (timestamp, phone, status) ke tabel `itinerary_submissions` — tidak perlu tool logging terpisah dulu.
- Tambahkan endpoint `GET /api/health` untuk cek server hidup (dipakai untuk ping supaya Render free tier tidak keburu sleep saat demo).
- Kalau butuh notifikasi real-time saat webhook gagal, fase berikutnya bisa tambah integrasi Slack/Telegram webhook sederhana — di luar cakupan MVP ini.

---

## 8. Rencana Deploy (Free Tier, Step by Step)

1. **Supabase**: buat project baru (free tier) → catat `Project URL` & `anon/service_role key` → jalankan SQL di §5 lewat SQL Editor → buat bucket Storage `documents` (public).
2. **Repo GitHub**: push kode backend (Express/FastAPI) ke repo baru.
3. **Render.com**: New → Web Service → connect repo GitHub → set Build/Start command sesuai stack → isi Environment Variables (`WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`).
4. **Test lokal dulu** sebelum sambung ke Siagga: pakai `curl`/Postman kirim payload contoh (§2.1) ke URL Render → pastikan response sesuai §2.2, dan file muncul di Supabase Storage.
5. **Update node External API Request di Siagga**: ganti `Request URL` dengan URL Render (`https://<app-name>.onrender.com/api/webhooks/itinerary-json`), tambah header `X-Webhook-Secret`.
6. **Test end-to-end**: isi `Itinerary_file` pada kontak test di Siagga → cek row baru masuk ke tabel `itinerary_submissions` → cek dokumen ter-generate di Storage.
7. **Publish flow** di Siagga setelah end-to-end sukses beberapa kali.

---

## 9. Batasan Fase MVP (Out of Scope Dulu)

> **Update MVP2:** dua poin pertama di bawah ini SUDAH dibangun di MVP2 (lihat §11) — approval sekarang berupa review harga oleh sales sebelum generate, dan `services_catalog` menggantikan edit manual `margin_rules` lewat UI web app. Sisanya masih berlaku.

- ~~Tidak ada approval Founder / workflow revisi~~ — MVP2: sales review & edit harga di web app sebelum generate (human-in-the-loop, lihat §11).
- ~~Tidak ada UI admin untuk edit `margin_rules`~~ — MVP2: sales pilih dari `services_catalog` lewat UI quotation builder (edit katalog itu sendiri masih manual lewat Supabase Table Editor).
- Tidak ada retry otomatis kalau webhook gagal — Sales perlu re-trigger manual (ubah lalu ubah balik value `Itinerary_file`, atau sediakan tombol "Retry" sederhana di fase 2).
- Tidak menangani multi-currency (IDR saja dulu, sesuai PRD utama §7).
- LibreOffice/Gotenberg convert-to-PDF bisa lambat di free tier (cold start) — untuk testing ini diterima, dioptimasi saat production. (Catatan: konversi PDF via CloudConvert sudah dinonaktifkan sementara — backend upload `.docx` langsung.)

---

## 11. MVP2 — Web App Quotation Builder (Sales UI)

**Kenapa:** 3 sales pegang customer masing-masing dari Siagga CRM. Setelah itinerary final disetujui customer, sales perlu generate quotation — tapi harga TIDAK boleh auto-generate tanpa dicek manusia (kerugian bisnis kalau salah). Lihat detail keputusan arsitektur (kenapa bukan AI/RAG di sisi Siagga) di plan implementasi.

**Perubahan alur dari §3-4 di atas:**
1. Webhook (§2) tetap terima & parse payload Siagga, TIDAK berubah caranya.
2. Webhook berhenti setelah simpan submission + jalankan saran harga otomatis rule-based (`serviceSuggester.js`, berdasarkan `services_catalog` + heuristik `PRICING_RULES.md`) → simpan sebagai `quotations` row `status='draft'`. TIDAK generate dokumen di titik ini lagi (§2.2 di atas).
3. Sales login ke web app (Supabase Auth), buka submission miliknya, review/edit line item harga.
4. Sales klik "Generate" → `POST /api/quotations/:id/generate` → backend hitung ulang total (tidak percaya angka dari client), panggil `docGenerator.js` (tidak berubah) + upload ke Storage (tidak berubah).
5. Submission `status` jadi `processed`, quotation `status` jadi `generated`, URL dokumen tersimpan di `quotations.quotation_docx_url`.

**Tabel baru:** `sales`, `services_catalog` (pengganti `margin_rules` utk pricing operasional — `margin_rules` dibiarkan ada tapi deprecated), `quotations`. Lihat `backend/migrations/002_sales_quotations_catalog.sql`.

**Endpoint baru (butuh Supabase JWT sales, beda dari `X-Webhook-Secret`):**
- `GET /api/submissions?scope=mine|unassigned|all&status=`
- `GET /api/submissions/:id`
- `PUT /api/quotations/:id` — simpan edit line items
- `POST /api/quotations/:id/generate`
- `GET /api/services-catalog`

**Deploy:** frontend (`frontend/`, Next.js) & backend (`backend/`, Express — tidak berubah struktur) digabung jadi **satu Vercel project** lewat root `vercel.json` monorepo config, bukan dua deployment terpisah. Lihat `DEPLOY-VERCEL.md`.

---

## 10. Kriteria Selesai (Definition of Done — MVP)

- [ ] Endpoint live di Render, merespons `GET /api/health` dengan 200.
- [ ] Payload contoh (§2.1) berhasil diproses end-to-end dari Postman.
- [ ] Row tersimpan benar di Supabase dengan field ter-parse (bukan `raw_payload` doang).
- [ ] Dokumen Itinerary & Quotation ter-generate mengikuti template yang sudah ada, minimal placeholder harga TBD terisi otomatis dari `margin_rules` (walau datanya masih dummy).
- [ ] Flow Siagga `ItineraryExtractor` terhubung ke endpoint Render dan diuji dengan 1 kontak nyata end-to-end (isi `Itinerary_file` → dokumen keluar).