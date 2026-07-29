/**
 * marginEngine.js
 *
 * Hitung harga jual per item layanan berdasarkan margin_rules di Supabase.
 * Sesuai §4 (step 4) dan §5 (tabel margin_rules) PRD.
 *
 * Logika:
 *   harga_jual = base_cost * (1 + margin_percent / 100)
 *
 * Jika tidak ada rule yang cocok → item ditandai TBD (harga 0, perlu diisi manual)
 */

const { getSupabaseClient } = require('../db/supabase');

/**
 * Mapping tipe_tour / kendaraan ke item_type yang ada di margin_rules.
 * Sesuaikan dengan data yang dimasukkan ke tabel margin_rules.
 */
const ITEM_TYPE_MAP = {
  'Private Car': 'private_car',
  'Private Van': 'private_van',
  'Private Bus': 'private_bus',
  // Tambahkan mapping lain sesuai kebutuhan
};

/**
 * Format angka ke rupiah (IDR)
 * @param {number} amount
 * @returns {string}
 */
function formatIDR(amount) {
  if (!amount || amount === 0) return 'TBD';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
}

/**
 * Hitung margin untuk tiap kombinasi destinasi × kendaraan.
 *
 * @param {object} parsedData - Output dari parser.parsePayload().parsed
 * @returns {Promise<{
 *   line_items: Array<{item: string, kota: string, base_cost: number, harga_jual: number, harga_jual_formatted: string, is_tbd: boolean}>,
 *   total_harga: number,
 *   total_harga_formatted: string
 * }>}
 */
async function calculateMargin(parsedData) {
  const supabase = getSupabaseClient();
  const { destinasi, kendaraan, durasi } = parsedData;

  // Ambil semua margin rules yang aktif
  const { data: rules, error } = await supabase
    .from('margin_rules')
    .select('*')
    .eq('is_active', true);

  if (error) {
    console.error('[MARGIN] Gagal fetch margin_rules:', error.message);
    // Jangan throw — return line items kosong dengan flag TBD
    return buildEmptyResult(destinasi, kendaraan);
  }

  const line_items = [];
  const item_type = ITEM_TYPE_MAP[kendaraan] || 'private_car';

  // Buat line item per kota destinasi
  const kota_list = Array.isArray(destinasi) && destinasi.length > 0 ? destinasi : ['Umum'];

  for (const kota of kota_list) {
    // Cari rule yang cocok: item_type + kota (case-insensitive)
    const rule = rules.find(
      (r) =>
        r.item_type === item_type &&
        r.city.toLowerCase() === String(kota).toLowerCase()
    );

    if (rule) {
      const harga_jual = Number(rule.base_cost) * (1 + Number(rule.margin_percent) / 100);
      line_items.push({
        item: `${kendaraan} — ${kota}`,
        kota: String(kota),
        base_cost: Number(rule.base_cost),
        margin_percent: Number(rule.margin_percent),
        harga_jual: Math.round(harga_jual),
        harga_jual_formatted: formatIDR(Math.round(harga_jual)),
        currency: rule.currency || 'IDR',
        is_tbd: false,
      });
    } else {
      // Tidak ada rule → TBD
      console.warn(`[MARGIN] Tidak ada rule untuk: item_type=${item_type}, city=${kota}`);
      line_items.push({
        item: `${kendaraan} — ${kota}`,
        kota: String(kota),
        base_cost: 0,
        margin_percent: 0,
        harga_jual: 0,
        harga_jual_formatted: 'TBD',
        currency: 'IDR',
        is_tbd: true,
      });
    }
  }

  // Tambahkan item Tour Guide (jika bukan arrival/departure only)
  // Sesuai PRICING_RULES.md §7 — tidak perlu tour guide di hari arrival/departure only
  // Di MVP ini kita tambahkan sebagai TBD, Sales bisa sesuaikan manual
  line_items.push({
    item: 'Tour Guide',
    kota: kota_list.join(', '),
    base_cost: 0,
    margin_percent: 0,
    harga_jual: 0,
    harga_jual_formatted: 'TBD',
    currency: 'IDR',
    is_tbd: true,
    note: 'Sesuaikan dengan PRICING_RULES.md §7 — tour guide tidak diperlukan di hari arrival/departure only',
  });

  const total_harga = line_items.reduce((sum, item) => sum + (item.harga_jual || 0), 0);

  return {
    line_items,
    total_harga,
    total_harga_formatted: formatIDR(total_harga) || 'TBD',
  };
}

function buildEmptyResult(destinasi, kendaraan) {
  const kota_list = Array.isArray(destinasi) && destinasi.length > 0 ? destinasi : ['Umum'];
  return {
    line_items: kota_list.map((kota) => ({
      item: `${kendaraan || 'Kendaraan'} — ${kota}`,
      kota: String(kota),
      base_cost: 0,
      margin_percent: 0,
      harga_jual: 0,
      harga_jual_formatted: 'TBD',
      currency: 'IDR',
      is_tbd: true,
    })),
    total_harga: 0,
    total_harga_formatted: 'TBD',
  };
}

module.exports = { calculateMargin };
