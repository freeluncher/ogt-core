/**
 * parser.js
 *
 * Parse dan normalisasi payload webhook dari Siagga.
 * Semua field dari Siagga datang sebagai STRING — field JSON-string wajib di-parse.
 * Sesuai §2.1, §6 PRD & AGENTS.md.
 */

const PLACEHOLDER_KOSONG = '(belum diisi)';

/**
 * Coba parse JSON string dengan aman.
 * @returns {{ value: any|null, error: string|null }}
 */
function safeParse(jsonString, fieldName) {
  try {
    if (!jsonString || jsonString.trim() === '') {
      return { value: null, error: null }; // kosong bukan error, hanya null
    }
    return { value: JSON.parse(jsonString), error: null };
  } catch (e) {
    return { value: null, error: `Field '${fieldName}' bukan JSON valid: ${e.message}` };
  }
}

/**
 * Normalisasi itinerary_harian ke format array seragam.
 *
 * Siagga bisa mengirim dalam 2 format berbeda:
 *   Format A (array of object): [{ "hari": "Hari 1", "kegiatan": "..." }, ...]
 *   Format B (object dengan key hari): { "Hari 1": { ... }, "Hari 2": { ... } }
 *
 * Output yang dinormalisasi: [{ day_label: string, activities: string }]
 */
function normalizeItineraryHarian(parsed) {
  if (!parsed) return [];

  // Format A: sudah array
  if (Array.isArray(parsed)) {
    return parsed.map((item, idx) => {
      // Coba ambil field umum yang mungkin dipakai
      const day_label =
        item.hari || item.day || item.day_label || item.Hari || `Hari ${idx + 1}`;
      const activities =
        item.kegiatan ||
        item.activities ||
        item.description ||
        item.aktivitas ||
        JSON.stringify(item);
      return { day_label: String(day_label), activities: String(activities) };
    });
  }

  // Format B: object dengan key "Hari 1", "Hari 2", dst
  if (typeof parsed === 'object') {
    return Object.entries(parsed).map(([key, value]) => {
      const activities =
        typeof value === 'string'
          ? value
          : value.kegiatan || value.activities || value.description || JSON.stringify(value);
      return { day_label: String(key), activities: String(activities) };
    });
  }

  return [];
}

/**
 * Parse payload lengkap dari request body Siagga.
 *
 * @param {object} body - req.body dari Express
 * @returns {{
 *   parsed: object,
 *   parseFailed: boolean,
 *   failedFields: string[],
 *   errors: string[]
 * }}
 */
function parsePayload(body) {
  const failedFields = [];
  const errors = [];

  // ─── Parse field JSON-string ───────────────────────────────────────────────

  const { value: destinasi, error: errDestinasi } = safeParse(body.destinasi, 'destinasi');
  if (errDestinasi) {
    failedFields.push('destinasi');
    errors.push(errDestinasi);
  }

  const { value: itinerary_harian_raw, error: errItinerary } = safeParse(
    body.itinerary_harian,
    'itinerary_harian'
  );
  if (errItinerary) {
    failedFields.push('itinerary_harian');
    errors.push(errItinerary);
  }

  const { value: catatan_operasional, error: errCatatan } = safeParse(
    body.catatan_operasional,
    'catatan_operasional'
  );
  if (errCatatan) {
    failedFields.push('catatan_operasional');
    errors.push(errCatatan);
  }

  // ─── Normalisasi itinerary_harian ─────────────────────────────────────────
  const itinerary_harian = normalizeItineraryHarian(itinerary_harian_raw);

  // ─── Destinasi sebagai teks (untuk template dokumen) ──────────────────────
  const destinasi_text = Array.isArray(destinasi)
    ? destinasi.join(', ')
    : destinasi
    ? String(destinasi)
    : PLACEHOLDER_KOSONG;

  // ─── Field scalar — isi placeholder jika kosong ───────────────────────────
  const parsed = {
    contact_name: body.contact_name || PLACEHOLDER_KOSONG,
    phone: body.phone || PLACEHOLDER_KOSONG,
    nama_klien: body.nama_klien || PLACEHOLDER_KOSONG,
    jumlah_pax: body.jumlah_pax || PLACEHOLDER_KOSONG,
    tipe_tour: body.tipe_tour || PLACEHOLDER_KOSONG,
    durasi: body.durasi || PLACEHOLDER_KOSONG,
    tanggal_mulai: body.tanggal_mulai || PLACEHOLDER_KOSONG,
    tanggal_selesai: body.tanggal_selesai || PLACEHOLDER_KOSONG,
    kendaraan: body.kendaraan || PLACEHOLDER_KOSONG,
    bagasi: body.bagasi || PLACEHOLDER_KOSONG,
    // Field yang sudah di-parse
    destinasi: destinasi || [],
    destinasi_text,
    itinerary_harian,
    catatan_operasional: Array.isArray(catatan_operasional)
      ? catatan_operasional
      : catatan_operasional
      ? [String(catatan_operasional)]
      : [],
  };

  const parseFailed = failedFields.length > 0;

  return { parsed, parseFailed, failedFields, errors };
}

module.exports = { parsePayload, PLACEHOLDER_KOSONG };
