# AGENTS.md — Oriental Gate Travel: Itinerary Webhook Backend

## Konteks Proyek
Backend ini menerima webhook JSON dari flow Siagga `ItineraryExtractor` (hasil ekstraksi AI dari dokumen Final Itinerary), menyimpannya, menghitung margin/harga, lalu generate dokumen Itinerary & Quotation (.docx → .pdf) sesuai template yang sudah ada. Spesifikasi lengkap ada di `PRD-Backend-Webhook-ItineraryExtractor.md` — **selalu baca file itu dulu sebelum mengubah kontrak API, data model, atau alur proses.**

## Tech Stack (wajib diikuti, jangan ganti tanpa konfirmasi)
- Runtime: Node.js 20 + Express (atau Python 3.11 + FastAPI — pilih salah satu, jangan campur)
- Database: Supabase Postgres (free tier)
- Storage file hasil generate: Supabase Storage (bucket `documents`, public)
- Convert docx → pdf: LibreOffice headless / Gotenberg
- Hosting: Render.com free Web Service
- Generate docx: `docxtemplater` (Node) atau `python-docx` (Python)

## Kontrak API — JANGAN DIUBAH tanpa update PRD
- Endpoint: `POST /api/webhooks/itinerary-json`
- Header wajib divalidasi: `X-Webhook-Secret` (401 kalau salah/kosong)
- Body: field-field dari Siagga SELALU berupa string, termasuk yang isinya JSON (`destinasi`, `itinerary_harian`, `catatan_operasional`) — WAJIB `JSON.parse()` dengan try/catch, jangan asumsikan sudah berbentuk array/object.
- Response sukses: `{status:"ok", quotation_id, itinerary_pdf_url, quotation_pdf_url}`
- Response gagal: HTTP 422 (payload invalid) atau 500 (error internal), body `{status:"error", message, raw_field?}`

## Aturan Data & Error Handling
- Field bisa datang kosong (`tanggal_mulai`, `bagasi` sering kosong) — JANGAN gagalkan request karena field kosong, isi placeholder `"(belum diisi)"` di dokumen dan tetap lanjut proses.
- Struktur `itinerary_harian` bisa beda-beda antar dokumen (kadang array of object, kadang object dengan key "Hari 1", "Hari 2", dst) — WAJIB normalisasi: cek `Array.isArray()`, kalau bukan array convert `Object.entries()` jadi array seragam sebelum dipakai untuk generate dokumen.
- Kalau parsing field JSON-string gagal: tetap simpan row ke DB dengan `status='failed'` dan `raw_payload` lengkap (jangan buang data mentah), catat `error_message` yang jelas.
- Semua request masuk (sukses maupun gagal) WAJIB tercatat ke tabel `itinerary_submissions` — ini satu-satunya mekanisme logging di fase MVP, jangan skip.

## Keamanan
- JANGAN hardcode secret/API key di kode — semua lewat environment variable (`WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`).
- JANGAN commit file `.env` ke git — pastikan ada di `.gitignore`.
- Endpoint ini publik (dipanggil dari Siagga) — validasi `X-Webhook-Secret` harus jadi baris pertama di handler, sebelum proses apapun.

## Konvensi Kode
- Bahasa komentar & nama variabel: boleh campur Indonesia-Inggris mengikuti istilah bisnis yang sudah ada di PRD (mis. `jumlah_pax`, `nama_klien`, `margin_percent`) — JANGAN terjemahkan nama field yang sudah didefinisikan di kontrak API.
- Tabel & kolom database mengikuti skema persis di §5 PRD (`itinerary_submissions`, `margin_rules`) — kalau perlu kolom baru, tambahkan migration, jangan ubah kolom existing tanpa alasan kuat.
- Selalu sediakan `GET /api/health` yang merespons 200 — dipakai untuk ping supaya Render free tier tidak sleep saat demo.

## Batasan Fase MVP — JANGAN over-engineer
Sesuai §9 PRD, hal-hal ini SENGAJA belum dibangun, jangan ditambahkan kecuali diminta eksplisit:
- Approval workflow / multi-role auth
- UI admin untuk edit `margin_rules` (edit manual lewat Supabase Table Editor)
- Retry otomatis webhook
- Multi-currency (IDR saja)

## Sebelum Selesai Kerja
- Test payload contoh dari PRD §2.1 lewat curl/Postman ke endpoint lokal sebelum deploy.
- Pastikan `GET /api/health` jalan.
- Update `PRD-Backend-Webhook-ItineraryExtractor.md` kalau ada perubahan kontrak API/data model — dokumen itu harus selalu jadi sumber kebenaran yang sinkron dengan kode.