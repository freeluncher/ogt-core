# Cara Kerja Flow `ItineraryExtractor` — Referensi untuk Backend

**Tujuan dokumen:** menjelaskan persis dari mana dan bagaimana data JSON yang diterima backend (§2 `PRD-Backend-Webhook-ItineraryExtractor.md`) itu dihasilkan, supaya tim backend tahu apa yang bisa/tidak bisa diasumsikan dari payload yang datang.

---

## 1. Pemicu (Trigger)

Rule `Trigger_Itinerary_Extractor` (Tools > Triggers and Actions):
- **Kondisi:** Custom field `Itinerary_file` **berubah nilainya** (apapun isinya).
- **Aksi:** Start Another Flow → `ItineraryExtractor`.

**Cara `Itinerary_file` terisi (proses manual oleh Sales):**
1. Sales attach file Final Itinerary (idealnya PDF — lihat catatan format di §5) ke chat WhatsApp customer di Inbox Siagga, lalu kirim. Ini otomatis mengirim file ke customer.
2. Sales copy URL attachment yang baru terkirim itu (atau link Dropbox/Drive yang sudah disiapkan sebelumnya).
3. Sales paste URL itu ke field `Itinerary_file` pada Contact record customer tersebut.
4. Begitu field ter-save, rule di atas otomatis jalan → flow `ItineraryExtractor` mulai.

**Implikasi untuk backend:** tidak ada jaminan satu kontak hanya kirim webhook sekali. Kalau Sales revisi itinerary dan paste ulang URL baru, trigger jalan lagi dengan data baru. Backend sebaiknya perlakukan tiap POST sebagai **versi baru**, bukan asumsi one-time submission (simpan dengan timestamp, jangan overwrite tanpa histori).

---

## 2. Struktur Flow di Siagga

```
Start → Actions #1 (OpenAI: Extract data from text/image/files)
      → Actions #2 (External API Request: POST ke backend)
```

### Actions #1 — Ekstraksi AI
- Input Type: **File**, sumber: nilai `Itinerary_file` (URL).
- Model membaca file itu langsung dan mengisi **11 custom field terpisah**, masing-masing lewat satu baris ekstraksi dengan label pendek (lihat §3). Setiap label = satu panggilan OpenAI structured-output dalam satu request yang sama.
- **Batasan penting:** label ekstraksi WAJIB pendek dan tanpa tanda baca aneh (`:{}[]()"`/`), karena Siagga mengubah teks label itu langsung jadi nama property JSON schema untuk OpenAI. Kalau backend/tim ingin menambah field ekstraksi baru di masa depan, ini batasan yang harus diikuti — bukan bug, tapi cara kerja node-nya.

### Actions #2 — Kirim ke Backend
- POST JSON ke URL backend, header `Content-Type: application/json` (+ `X-Webhook-Secret` kalau sudah diaktifkan sesuai PRD §2.4).
- Body cuma **merge field pass-through** dari 11 custom field di atas — tidak ada logic tambahan di sisi Siagga.

---

## 3. Daftar 11 Field & Bentuk Datanya

| Custom Field | Key JSON dikirim | Tipe aktual saat sampai di backend |
|---|---|---|
| `FI_Nama_Klien` | `nama_klien` | string biasa |
| `FI_Jumlah_Pax` | `jumlah_pax` | string biasa (mis. `"2 Pax"`, bukan angka murni) |
| `FI_Tipe_Tour` | `tipe_tour` | string biasa |
| `FI_Durasi` | `durasi` | string biasa (mis. `"9 Hari (Hari 1 - Hari 9)"`) |
| `FI_Destinasi` | `destinasi` | **string berisi JSON array** — wajib `JSON.parse()` |
| `FI_Tanggal_Mulai` | `tanggal_mulai` | string, **sering kosong** |
| `FI_Tanggal_Selesai` | `tanggal_selesai` | string, **sering kosong** |
| `FI_Kendaraan` | `kendaraan` | string biasa |
| `FI_Bagasi` | `bagasi` | string, **sering kosong** |
| `FI_Itinerary_Harian` | `itinerary_harian` | **string berisi JSON — struktur TIDAK konsisten**, lihat §4 |
| `FI_Catatan_Operasional` | `catatan_operasional` | **string berisi JSON array** — wajib `JSON.parse()` |

**Kenapa sering kosong:** model AI cuma menyalin apa yang ada di dokumen sumber. Kalau baris Tanggal/Bagasi di template masih placeholder `____` (belum diisi Sales), hasil ekstraksi ya kosong/underscore — bukan kegagalan ekstraksi.

---

## 4. Ketidakkonsistenan Struktur `itinerary_harian` — Backend WAJIB Normalisasi

Karena tidak ada schema JSON yang dipaksakan (dibatasi oleh keterbatasan label di §2), hasil `itinerary_harian` bisa keluar dalam **dua bentuk berbeda** tergantung dokumen sumber & interpretasi model:

**Bentuk A — array of object** (paling sering, cocok langsung dipakai):
```json
[
  {"day_no":1,"city":"Beijing","title":"KEDATANGAN BEIJING","activities":["..."],"notes":"..."}
]
```

**Bentuk B — object dengan key per hari:**
```json
{
  "Hari 1":["aktivitas 1","aktivitas 2"],
  "Hari 2":["aktivitas 1"]
}
```

Backend **wajib** cek `Array.isArray()` dulu; kalau bukan array, convert `Object.entries()` jadi bentuk array yang seragam sebelum diproses lebih lanjut. Ini bukan hal opsional — kedua bentuk ini sudah terbukti muncul di pengetesan nyata.

**Catatan tambahan:** `itinerary_harian` hasil ekstraksi ini **flat per hari**, belum dikelompokkan per kota. Kalau backend mau generate dokumen Quotation pakai template `OGT_Itinerary_Quotation_Template_docxtemplater.docx`, ada **satu langkah transformasi tambahan** yang wajib dilakukan backend: kelompokkan hari-hari berurutan berdasarkan `city` yang sama menjadi struktur `city_groups` (lihat dokumen template untuk bentuk persisnya) — Siagga tidak melakukan pengelompokan ini.

---

## 5. Yang TIDAK Ada di Payload Ini

- **Tidak ada harga/pricing sama sekali.** `itinerary_harian` cuma berisi deskripsi aktivitas, bukan biaya. Semua `description`/`price` per service, serta `total_private_car`/`total_tiket_shuttle`/`grand_total` di template Quotation, **dihitung backend sendiri** dari `margin_rules` (§5 PRD backend) — bukan hasil ekstraksi.
- **Tidak ada URL dokumen final** dikirim balik ke Siagga secara otomatis. Response dari backend saat ini tidak dipetakan ke custom field manapun di Siagga (Response Mapping belum dikonfigurasi). Kalau nanti mau Sales bisa lihat link dokumen hasil generate langsung di Siagga, perlu tambahan setup Response Mapping (JSONPath `$.quotation_pdf_url` → custom field baru) — di luar cakupan saat ini.

## 6. Catatan Format File (di luar payload JSON, tapi relevan)

Kalau Sales pakai .docx (bukan PDF) dan sumber URL-nya tidak menyertakan nama file+ekstensi di teks URL (mis. link Google Drive `uc?export=download&id=...`), pengiriman file ke customer via Siagga bisa salah label jadi `.bin`. Ini tidak memengaruhi ekstraksi JSON (Actions #1 tetap bisa baca isi file), tapi memengaruhi kualitas file yang diterima customer — pastikan proses upload Sales ikut SOP di §"format file" yang sudah didiskusikan (convert ke PDF atau pakai link yang menyertakan nama file, mis. Dropbox).