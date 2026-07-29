# OGT Webhook Backend

Backend Node.js/Express untuk menerima webhook dari flow Siagga `ItineraryExtractor`, menyimpan data, menghitung margin, generate dokumen, dan return URL dokumen.

---

## Prerequisites

- Node.js 20+
- Akun [Supabase](https://supabase.com) (free tier cukup)
- (Opsional) Akun [Azure](https://portal.azure.com) dengan akses OneDrive untuk konversi PDF via Graph API
- (Opsional) Akun [CloudConvert](https://cloudconvert.com) sebagai fallback PDF

---

## Setup Lokal

### 1. Clone & Install

```bash
cd backend
npm install
```

### 2. Setup Environment Variables

```bash
cp .env.example .env
# Edit .env dengan nilai asli
```

Isi minimal ini dulu:
```
WEBHOOK_SECRET=buat-random-string-panjang
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
```

### 3. Setup Supabase

**a. Buat project Supabase baru** di [supabase.com](https://supabase.com)

**b. Jalankan migration** lewat Supabase Dashboard > SQL Editor:
```sql
-- Copy isi file migrations/001_initial_schema.sql dan paste di sini
```

**c. Buat bucket Storage:**
- Buka Storage > New Bucket
- Nama: `documents`
- Centang: Public bucket

**d. Catat credentials:**
- Project URL → `SUPABASE_URL`
- Project Settings > API > `service_role` key → `SUPABASE_SERVICE_KEY`

### 4. Upload Template Dokumen

```
Salin file OGT_Itinerary_Quotation_Template_docxtemplater.docx
ke folder: backend/templates/
```

### 5. Jalankan Server

```bash
npm run dev
```

Server berjalan di `http://localhost:3000`

---

## Test Endpoints

### Health Check
```bash
curl http://localhost:3000/api/health
# Expected: {"status":"ok","service":"OGT Webhook Backend","timestamp":"..."}
```

### Test Webhook (tanpa secret → harus 401)
```bash
curl -X POST http://localhost:3000/api/webhooks/itinerary-json \
  -H "Content-Type: application/json" \
  -d '{}'
# Expected: 401 Unauthorized
```

### Test Webhook Lengkap
```bash
curl -X POST http://localhost:3000/api/webhooks/itinerary-json \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: YOUR_WEBHOOK_SECRET" \
  -d @test/sample_payload.json
# Expected: {"status":"ok","quotation_id":"q_xxx","itinerary_pdf_url":"...","quotation_pdf_url":"..."}
```

---

## Setup PDF Conversion (Opsional)

### Opsi A: Microsoft Graph API (Direkomendasikan — Azure for Students)

1. Buka [Azure Portal](https://portal.azure.com) > **App Registrations** > **New registration**
2. Beri nama: `ogt-webhook-backend`
3. Di app yang baru dibuat > **Certificates & secrets** > **New client secret** → catat valuenya
4. **API permissions** > Add > **Microsoft Graph** > **Application permissions** > `Files.ReadWrite.All` > Grant admin consent
5. Catat: Application (client) ID, Directory (tenant) ID, client secret
6. Tambahkan ke `.env`:
   ```
   AZURE_CLIENT_ID=...
   AZURE_CLIENT_SECRET=...
   AZURE_TENANT_ID=...
   AZURE_ONEDRIVE_USER_ID=email@domain.com
   ```

### Opsi B: CloudConvert (Fallback)

1. Daftar di [cloudconvert.com](https://cloudconvert.com) → API Keys → New API Key
2. Tambahkan ke `.env`:
   ```
   CLOUDCONVERT_API_KEY=...
   ```

---

## Deploy ke Render.com

1. Push folder `backend/` ke GitHub repo baru
2. Di [render.com](https://render.com): **New** > **Web Service** > Connect repo
3. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** Node
4. **Environment Variables:** tambahkan semua key dari `.env`
5. Deploy → catat URL (`https://ogt-webhook-xxx.onrender.com`)

### Update Siagga

Di node **External API Request** di flow `ItineraryExtractor`:
- **URL:** `https://ogt-webhook-xxx.onrender.com/api/webhooks/itinerary-json`
- **Method:** POST
- **Headers:**
  - `Content-Type: application/json`
  - `X-Webhook-Secret: [nilai WEBHOOK_SECRET kamu]`

---

## Struktur Folder

```
backend/
├── src/
│   ├── index.js                  # Entry point Express
│   ├── routes/
│   │   ├── health.js             # GET /api/health
│   │   └── webhook.js            # POST /api/webhooks/itinerary-json
│   ├── services/
│   │   ├── parser.js             # Parse & normalisasi payload
│   │   ├── marginEngine.js       # Hitung harga dari margin_rules
│   │   ├── docGenerator.js       # Generate .docx dari template
│   │   ├── pdfConverter.js       # Konversi .docx → .pdf
│   │   └── storageUploader.js    # Upload ke Supabase Storage
│   ├── db/
│   │   └── supabase.js           # Supabase client singleton
│   └── middleware/
│       └── validateSecret.js     # Validasi X-Webhook-Secret
├── templates/
│   └── OGT_Itinerary_Quotation_Template_docxtemplater.docx
├── migrations/
│   └── 001_initial_schema.sql
├── test/
│   └── sample_payload.json
├── .env.example
├── .gitignore
└── README.md
```

---

## Update Margin Rules

Edit langsung lewat **Supabase Table Editor** → tabel `margin_rules`.

Field yang perlu diisi:
- `item_type`: tipe layanan (`private_car`, `private_van`, `tour_guide`, dll.)
- `city`: nama kota (harus sama persis dengan yang ada di field `destinasi`)
- `base_cost`: harga pokok dalam IDR
- `margin_percent`: persentase margin, contoh `25` = 25%
- `is_active`: `true` untuk aktif

---

## Monitoring

Cek semua webhook yang masuk lewat **Supabase Table Editor** → tabel `itinerary_submissions`.

Status:
- `received` → baru masuk, belum selesai diproses
- `processed` → berhasil, URL dokumen tersedia
- `failed` → gagal, cek kolom `error_message` dan `raw_payload`
