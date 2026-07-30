/**
 * serviceSuggester.js
 *
 * Saran otomatis (rule-based, BUKAN AI) line item quotation dari itinerary_harian
 * + services_catalog. Sales WAJIB review/edit hasilnya di UI sebelum generate —
 * ini cuma draft awal, bukan keputusan harga final.
 *
 * Aturan mengikuti PRICING_RULES.md:
 *   §7 — tidak perlu tour guide di hari arrival/departure-only
 *        (isi cuma airport pickup/transfer/checkout)
 *   §9 — Disneyland/Legoland/theme park: tidak pakai tour guide,
 *        pakai private transfer + ticket assistance
 */

const ARRIVAL_DEPARTURE_KEYWORDS =
  /airport pickup|penjemputan bandara|transfer ke hotel|transfer.*hotel|hotel.*transfer|check.?out|checkout|drop.?off|free time/i;

const THEME_PARK_KEYWORDS =
  /disneyland|legoland|universal studios|theme ?park|taman hiburan/i;

/** Hari dianggap arrival/departure-only kalau SEMUA aktivitas cocok pola transfer/checkout sederhana */
function isArrivalDepartureOnlyDay(activities) {
  if (!activities || activities.length === 0) return false;
  return activities.every((a) => ARRIVAL_DEPARTURE_KEYWORDS.test(a));
}

function isThemeParkDay(activities) {
  return (activities || []).some((a) => THEME_PARK_KEYWORDS.test(a));
}

/** Cari catalog item aktif by kategori+kota, fallback ke kota 'Umum' */
function findCatalogItem(catalog, category, city) {
  const cityLower = String(city || '').toLowerCase();
  return (
    catalog.find(
      (c) => c.category === category && c.is_active && String(c.city).toLowerCase() === cityLower
    ) || catalog.find((c) => c.category === category && c.is_active && String(c.city).toLowerCase() === 'umum')
  );
}

function formatIDR(amount) {
  if (!amount) return 'TBD';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', minimumFractionDigits: 0,
  }).format(amount);
}

function buildLineItem(catalogItem, { city, day_no, qty = 1 }) {
  const unitCost = Number(catalogItem.unit_cost) || 0;
  const marginPercent = Number(catalogItem.margin_percent) || 0;
  const hargaJual = Math.round(unitCost * qty * (1 + marginPercent / 100));
  return {
    service_id: catalogItem.id,
    name: catalogItem.name,
    city,
    day_no,
    qty,
    unit_cost: unitCost,
    margin_percent: marginPercent,
    harga_jual: hargaJual,
    harga_jual_formatted: formatIDR(hargaJual),
    currency: catalogItem.currency || 'IDR',
    source: 'auto',
  };
}

/**
 * @param {Array} itineraryHarian - parsedData.itinerary_harian (output parser.js)
 * @param {Array} catalog - services_catalog rows aktif dari Supabase
 * @returns {{line_items: Array, total_harga: number, total_harga_formatted: string}}
 */
function suggestServices(itineraryHarian, catalog) {
  const line_items = [];

  for (const day of itineraryHarian || []) {
    const city = day.kota || 'Umum';
    const dayNo = day.day_no;

    // Transport — selalu disarankan per hari
    const transport = findCatalogItem(catalog, 'transport', city);
    if (transport) line_items.push(buildLineItem(transport, { city, day_no: dayNo }));

    if (isArrivalDepartureOnlyDay(day.activities)) {
      // PRICING_RULES.md §7 — hari arrival/departure-only, tidak perlu guide
      continue;
    }

    if (isThemeParkDay(day.activities)) {
      // PRICING_RULES.md §9 — theme park: transfer + ticket assistance, tanpa guide
      const transfer = findCatalogItem(catalog, 'transfer', city);
      if (transfer) line_items.push(buildLineItem(transfer, { city, day_no: dayNo }));
      const ticket = findCatalogItem(catalog, 'ticket', city);
      if (ticket) line_items.push(buildLineItem(ticket, { city, day_no: dayNo }));
      continue;
    }

    // Default — hari city tour / luar kota biasa, sarankan tour guide
    const guide = findCatalogItem(catalog, 'guide', city);
    if (guide) line_items.push(buildLineItem(guide, { city, day_no: dayNo }));
  }

  const total_harga = line_items.reduce((sum, item) => sum + (item.harga_jual || 0), 0);

  return {
    line_items,
    total_harga,
    total_harga_formatted: formatIDR(total_harga),
  };
}

module.exports = { suggestServices, isArrivalDepartureOnlyDay, isThemeParkDay };
