# Laporan Debugging — Generate Dokumen OGT

## Ringkasan

Tiga iterasi debugging diperlukan untuk memperbaiki generate dokumen `.docx` dari template. Akar masalah utama adalah **asumsi nama field yang salah** — kode ditulis berdasarkan dugaan format payload, sementara format aktual dari Siagga ItineraryExtractor sangat berbeda.

---

## Iterasi 1 — Masalah Awal

### Gejala
```
Destinasi   : undefined
Total Private Car  : undefined
Total Tiket Masuk  : undefined
Tabel itinerary    : kosong
```

### Metodologi Debug
Jalankan `debug-template.js` — script yang membaca XML mentah dari file `.docx` template dan mengekstrak semua placeholder `{tag}` yang ada, lalu membandingkan dengan apa yang dikirim kode.

### Root Cause
Kode mengirim nama key yang **berbeda** dari nama placeholder di template:

| Placeholder di Template | Yang Dikirim Kode | Status |
|---|---|---|
| `{destinasi}` | `{destinasi_text}` | ❌ nama beda |
| `{#days}` ... `{day_no}` | `{#itinerary_harian}` ... `{day_label}` | ❌ nama beda |
| `{#city_groups}` | `{#line_items}` | ❌ nama beda |
| `{grand_total}` | `{total_harga_formatted}` | ❌ nama beda |
| `{total_tiket_shuttle}` | tidak dikirim | ❌ tidak ada |

### Fix
Sesuaikan semua key di `templateData` dengan nama placeholder aktual dari template.

---

## Iterasi 2 — `Umum` dan `[object Object]`

### Gejala
```
Chengdu | Hari 1 - 9 - Hari 1 - 9        ← kota benar
Hari 1 - Umum                             ← kota jadi "Umum" di {title}
{"Hari":"1","Kota":"Chengdu",...}          ← JSON string muncul di activities
```

### Metodologi Debug
Jalankan `inspect-docx.js` — script yang mengekstrak teks plain dari `.docx` hasil generate dan mencari kata "undefined", "umum", dan "[object".

### Root Cause

**Masalah A: Activities tampil sebagai JSON string**

Parser `normalizeItineraryHarian` tidak mengenal field names dari Siagga yang sesungguhnya:

```js
// Kode lama — mencari field yang TIDAK ADA di payload Siagga
const activities =
  item.kegiatan     ||   // ← tidak ada
  item.activities   ||   // ← tidak ada  
  item.description  ||   // ← tidak ada
  item.aktivitas    ||   // ← tidak ada
  JSON.stringify(item);  // ← fallback: seluruh object jadi string!
```

Field aktual dari Siagga ItineraryExtractor adalah:
```json
{
  "Hari": "1",
  "Kota": "Chengdu",
  "Judul": "Kota Panda & Budaya Sichuan",
  "Daftar_aktivitas": ["aktivitas 1", "aktivitas 2"]
}
```

**Masalah B: `{title}` tampil "Umum"**

DocGenerator mengisi `{title}` dari `cityFromAct` — mencari nama kota dalam teks aktivitas. Karena aktivitas adalah JSON string (bukan teks biasa), pencarian selalu gagal dan jatuh ke fallback `String(kota)` yang nilainya "Umum".

**Masalah C: Destinasi "(belum diisi)"**

Field `destinasi` di payload real Siagga kosong (`""`). Kode tidak punya fallback untuk mengekstrak kota dari field `Kota` tiap hari itinerary.

### Fix
Tambahkan support field names Siagga di parser + ekstrak kota dari itinerary jika `destinasi` kosong.

---

## Iterasi 3 — City Grouping Salah (Masalah Terbaru)

### Gejala
```
Umum | Hari 1 - 9 - Hari 1 - 9    ← semua hari masuk 1 kota "Umum"
Hari 1 - Umum {...JSON...}         ← kota masih "Umum", activities masih JSON
```

### Metodologi Debug
Jalankan `debug-payload.js` — simulasi parsing payload real dan print output parser:

```
destinasi_text: (belum diisi)           ← destinasi kosong
hari[0].activities: '{"Hari":"1",...}'  ← JSON string, bukan array
hari[0].kota: ''                        ← kota kosong!
```

### Root Cause

**Masalah A: Parser belum difix di iterasi ini**

Meskipun fix iterasi 2 sudah di-plan, code yang berjalan di Vercel masih versi lama karena bug edit tool. File `parser.js` belum ter-update.

**Masalah B: DocGenerator grouping menggunakan destinasi yang kosong**

```js
// Kode lama — grouping per kota DIBAGI MERATA, bukan berdasarkan field Kota
const hariPerKota = Math.ceil(allDays.length / destinasiList.length);
// → jika destinasiList = ['Umum'], semua 9 hari masuk ke "Umum"
```

Strategi yang benar: kelompokkan hari berdasarkan field `kota` dari tiap hari (diisi parser dari field `Kota` Siagga).

### Fix — Dua File Diubah

#### `parser.js` — Rewrite `normalizeItineraryHarian`
```js
// Sekarang mengenali field names Siagga yang sesungguhnya
const dayNo  = item.Hari  || item.hari  || ...
const kota   = item.Kota  || item.kota  || ...
const judul  = item.Judul || item.judul || ...

// Daftar aktivitas → array of strings
if (Array.isArray(item.Daftar_aktivitas)) {
  activities = item.Daftar_aktivitas.map(String);
}

// Output sekarang:
// { day_no, day_label, kota, judul, activities: string[] }
```

#### `parser.js` — Ekstrak destinasi dari itinerary
```js
// Jika field destinasi kosong, ekstrak kota unik dari tiap hari
const kotaSet = new Set();
for (const day of itinerary_harian) {
  day.kota.split(/[&,]/).map(s => s.trim()).forEach(k => kotaSet.add(k));
}
destinasiArray = [...kotaSet];  // → ['Chengdu', 'Jiuzhaigou', 'Zhangjiajie']
```

#### `docGenerator.js` — Group hari per kota menggunakan field `kota`
```js
// Sebelum: bagi merata (salah)
const hariPerKota = Math.ceil(allDays.length / destinasiList.length);

// Sesudah: group berdasarkan day.kota
for (const day of allDays) {
  const kotaKey = day.kota.split(/[&,]/)[0].trim() || 'Umum';
  daysByKota.get(kotaKey).push(day);
}
```

---

## Hasil Akhir — Verifikasi

Output `inspect-docx.js` pada `test-real-output.docx`:

```
=== "undefined" ===
✅ Tidak ada!

=== "umum" ===
(kosong)

=== "[object" ===
(kosong)

=== TEKS PENUH ===
...Chengdu | Hari 1 - 3 - Hari 1 - 3
Hari 1 - Kota Panda & Budaya Sichuan
  Chengdu Panda Base
  Wenshu Monastery
  Jinli Ancient Street
...
Jiuzhaigou | Hari 4 - 6 - Hari 4 - 6
Hari 4 - Perjalanan ke Jiuzhaigou
  Penerbangan Chengdu -> Jiuzhaigou
  Check-in hotel
...
Zhangjiajie | Hari 7 - 9 - Hari 7 - 9
...
```

Semua field terisi dengan benar.

---

## Lesson Learned

| # | Pelajaran |
|---|---|
| 1 | **Selalu dump XML template dulu** sebelum menulis `templateData` — jangan asumsikan nama placeholder |
| 2 | **Selalu dump payload aktual dari DB** sebelum menulis parser — field names dari AI extractor berbeda-beda |
| 3 | **Test dengan payload real, bukan sample** — `sample_payload.json` yang dibuat manual tidak merepresentasikan output Siagga |
| 4 | **`inspect-docx.js`** sangat berguna untuk diagnosa cepat tanpa perlu buka Word |

## File yang Berubah

| File | Perubahan |
|---|---|
| [`parser.js`](file:///d:/Oriental%20Gate%20Travel/ogt-core/backend/src/services/parser.js) | Rewrite `normalizeItineraryHarian` + ekstrak destinasi dari kota itinerary |
| [`docGenerator.js`](file:///d:/Oriental%20Gate%20Travel/ogt-core/backend/src/services/docGenerator.js) | Rewrite grouping hari per kota berdasarkan `day.kota`, bukan pembagian merata |
