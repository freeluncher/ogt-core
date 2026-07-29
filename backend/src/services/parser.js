/**
 * parser.js
 *
 * Parse dan normalisasi payload webhook dari Siagga.
 * Semua field dari Siagga datang sebagai STRING — field JSON-string wajib di-parse.
 * Sesuai §2.1, §6 PRD & AGENTS.md.
 *
 * Format itinerary_harian AKTUAL dari Siagga ItineraryExtractor:
 *   [{ "Hari": "1", "Kota": "Chengdu", "Judul": "Kota Panda",
 *      "Daftar_aktivitas": ["aktivitas 1", "aktivitas 2"] }, ...]
 */

const PLACEHOLDER_KOSONG = '(belum diisi)';

/**
 * Coba parse JSON string dengan aman.
 */
function safeParse(jsonString, fieldName) {
  try {
    if (!jsonString || jsonString.trim() === '') {
      return { value: null, error: null };
    }
    return { value: JSON.parse(jsonString), error: null };
  } catch (e) {
    return { value: null, error: `Field '${fieldName}' bukan JSON valid: ${e.message}` };
  }
}

/**
 * Normalisasi itinerary_harian ke format seragam.
 *
 * Format aktual Siagga ItineraryExtractor:
 *   [{ "Hari": "1", "Kota": "Chengdu", "Judul": "...", "Daftar_aktivitas": [...] }]
 *
 * Format generik (fallback):
 *   [{ "hari": "Hari 1", "kegiatan": "..." }]
 *   { "Hari 1": { ... }, "Hari 2": { ... } }
 *
 * Output: [{ day_no, day_label, kota, judul, activities: string[] }]
 */
function normalizeItineraryHarian(parsed) {
  if (!parsed) return [];

  if (Array.isArray(parsed)) {
    return parsed.map((item, idx) => {
      // ─ Nomor hari ─────────────────────────────────────────────────────────
      const rawHari = item.Hari || item.hari || item.day || item.day_no || String(idx + 1);
      const dayNo   = String(rawHari).replace(/[^0-9]/g, '') || String(idx + 1);
      const dayLabel = `Hari ${dayNo}`;

      // ─ Kota ───────────────────────────────────────────────────────────────
      const kota = item.Kota || item.kota || item.city || item.location || '';

      // ─ Judul hari ─────────────────────────────────────────────────────────
      const judul = item.Judul || item.judul || item.title || item.subtitle || '';

      // ─ Daftar aktivitas → array of string ─────────────────────────────────
      let activities = [];

      if (Array.isArray(item.Daftar_aktivitas) && item.Daftar_aktivitas.length) {
        // Format aktual Siagga
        activities = item.Daftar_aktivitas.map(String).filter(s => s.trim());
      } else if (Array.isArray(item.daftar_aktivitas) && item.daftar_aktivitas.length) {
        activities = item.daftar_aktivitas.map(String).filter(s => s.trim());
      } else if (Array.isArray(item.activities) && item.activities.length) {
        activities = item.activities.map(String).filter(s => s.trim());
      } else {
        // Fallback: ambil dari field string
        const raw = item.kegiatan || item.activities || item.description || item.aktivitas || '';
        if (raw) {
          activities = String(raw).split(/\n|(?<=[.!?])\s+(?=[A-Z•\-])/)
            .map(s => s.trim()).filter(s => s.length > 2);
          if (!activities.length) activities = [String(raw)];
        }
      }

      return { day_no: dayNo, day_label: dayLabel, kota, judul, activities };
    });
  }

  // Format object dengan key "Hari 1", "Hari 2", dst
  if (typeof parsed === 'object') {
    return Object.entries(parsed).map(([key, value], idx) => {
      const raw = typeof value === 'string' ? value
        : value.kegiatan || value.activities || value.description || JSON.stringify(value);
      return {
        day_no:     String(idx + 1),
        day_label:  String(key),
        kota:       '',
        judul:      String(key),
        activities: [raw].filter(Boolean),
      };
    });
  }

  return [];
}

/**
 * Parse payload lengkap dari request body Siagga.
 */
function parsePayload(body) {
  const failedFields = [];
  const errors = [];

  // ── Parse field JSON-string ────────────────────────────────────────────────
  const { value: destinasi,             error: errDestinasi   } = safeParse(body.destinasi,             'destinasi');
  const { value: itinerary_harian_raw,  error: errItinerary   } = safeParse(body.itinerary_harian,     'itinerary_harian');
  const { value: catatan_operasional,   error: errCatatan     } = safeParse(body.catatan_operasional,  'catatan_operasional');

  if (errDestinasi)  { failedFields.push('destinasi');          errors.push(errDestinasi); }
  if (errItinerary)  { failedFields.push('itinerary_harian');   errors.push(errItinerary); }
  if (errCatatan)    { failedFields.push('catatan_operasional'); errors.push(errCatatan);  }

  // ── Normalisasi itinerary_harian ───────────────────────────────────────────
  const itinerary_harian = normalizeItineraryHarian(itinerary_harian_raw);

  // ── Destinasi ──────────────────────────────────────────────────────────────
  // Prioritas: field destinasi dari payload → ekstrak unik dari kota di itinerary → fallback 'Umum'
  let destinasiArray = [];
  if (Array.isArray(destinasi) && destinasi.length > 0) {
    destinasiArray = destinasi;
  } else if (typeof destinasi === 'string' && destinasi.trim()) {
    // Bisa berupa string JSON atau string biasa "Chengdu, Beijing"
    destinasiArray = destinasi.split(',').map(s => s.trim()).filter(Boolean);
  } else {
    // Ekstrak kota unik dari itinerary_harian (Kota field)
    const kotaSet = new Set();
    for (const day of itinerary_harian) {
      if (day.kota && day.kota.trim()) {
        // Kota bisa "Jiuzhaigou & Zhangjiajie" — pisah jika ada &
        day.kota.split(/[&,]/).map(s => s.trim()).filter(Boolean).forEach(k => kotaSet.add(k));
      }
    }
    destinasiArray = kotaSet.size > 0 ? [...kotaSet] : [];
  }

  const destinasi_text = destinasiArray.length > 0
    ? destinasiArray.join(', ')
    : PLACEHOLDER_KOSONG;

  // ── Field scalar ───────────────────────────────────────────────────────────
  const parsed = {
    contact_name:    body.contact_name    || PLACEHOLDER_KOSONG,
    phone:           body.phone           || PLACEHOLDER_KOSONG,
    nama_klien:      body.nama_klien      || PLACEHOLDER_KOSONG,
    jumlah_pax:      body.jumlah_pax      || PLACEHOLDER_KOSONG,
    tipe_tour:       body.tipe_tour       || PLACEHOLDER_KOSONG,
    durasi:          body.durasi          || PLACEHOLDER_KOSONG,
    tanggal_mulai:   body.tanggal_mulai   || PLACEHOLDER_KOSONG,
    tanggal_selesai: body.tanggal_selesai || PLACEHOLDER_KOSONG,
    kendaraan:       body.kendaraan       || PLACEHOLDER_KOSONG,
    bagasi:          body.bagasi          || PLACEHOLDER_KOSONG,
    destinasi:       destinasiArray,
    destinasi_text,
    itinerary_harian,
    catatan_operasional: Array.isArray(catatan_operasional)
      ? catatan_operasional
      : catatan_operasional
      ? [String(catatan_operasional)]
      : [],
  };

  return { parsed, parseFailed: failedFields.length > 0, failedFields, errors };
}

module.exports = { parsePayload, PLACEHOLDER_KOSONG };
