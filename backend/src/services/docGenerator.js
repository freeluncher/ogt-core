/**
 * docGenerator.js
 *
 * Generate dokumen .docx dari template menggunakan docxtemplater.
 * Template: OGT_Itinerary_Quotation_Template_docxtemplater.docx
 *
 * Struktur template AKTUAL (hasil dump-template-xml.js):
 *
 *   Scalar: {nama_klien}, {jumlah_pax}, {tipe_tour}, {durasi}, {destinasi},
 *           {tanggal_mulai}, {tanggal_selesai}, {kendaraan}, {bagasi}
 *           {total_private_car}, {total_tiket_shuttle}, {grand_total}
 *
 *   {#city_groups}
 *     {city} | Hari {day_start} - {day_end} - {subtitle}
 *     {#days}
 *       Hari {day_no} - {title}
 *       {#activities}{.}{/activities}      ← array of plain strings
 *       Catatan: {notes}
 *       Service Included: {service_summary}    ← nama service unik hari ini, bukan hardcode
 *       {#services}{description}{price}{/services}
 *     {/days}
 *   {/city_groups}
 *
 *   {#catatan_operasional}{.}{/catatan_operasional}
 */

const fs   = require('fs');
const path = require('path');
const PizZip        = require('pizzip');
const Docxtemplater = require('docxtemplater');

const TEMPLATE_PATH = path.join(
  __dirname,
  '../../templates/OGT_Itinerary_Quotation_Template_docxtemplater.docx'
);

/** Format angka ke IDR */
function fmt(n) {
  if (!n || n === 0) return 'TBD';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', minimumFractionDigits: 0,
  }).format(n);
}

/**
 * Generate dokumen .docx.
 * @param {object} parsedData   - output parser.parsePayload().parsed
 * @param {object} marginResult - output marginEngine.calculateMargin()
 * @param {string} quotation_id
 * @returns {Buffer}
 */
function generateDoc(parsedData, marginResult, quotation_id) {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(`Template tidak ditemukan: ${TEMPLATE_PATH}`);
  }

  const doc = new Docxtemplater(new PizZip(fs.readFileSync(TEMPLATE_PATH)), {
    paragraphLoop: true,
    linebreaks:    true,
    errorLogging:  false,
    nullGetter:    () => '',
  });

  // ─── Kelompokkan services per kota (+ per hari kalau item punya day_no) ────
  // Line item dari serviceSuggester/quotation builder punya `day_no` (spesifik
  // per hari — mis. Tour Guide cuma di hari yang butuh, bukan di arrival day).
  // Line item lama tanpa `day_no` (marginEngine lama / item manual tanpa hari
  // spesifik) tetap tampil di SEMUA hari kota itu, sama seperti perilaku lama.
  const servicesByKotaDay  = new Map(); // key: `${kota}|${day_no}`
  const servicesByKotaWide = new Map(); // key: kota — item tanpa day_no

  for (const item of (marginResult.line_items || [])) {
    const kota = item.kota || 'Umum';
    const entry = { description: item.item || '', price: item.harga_jual_formatted || 'TBD' };

    if (item.day_no !== undefined && item.day_no !== null && item.day_no !== '') {
      const key = `${kota}|${item.day_no}`;
      if (!servicesByKotaDay.has(key)) servicesByKotaDay.set(key, []);
      servicesByKotaDay.get(key).push(entry);
    } else {
      if (!servicesByKotaWide.has(kota)) servicesByKotaWide.set(kota, []);
      servicesByKotaWide.get(kota).push(entry);
    }
  }

  // ─── Kelompokkan hari per kota ─────────────────────────────────────────────
  // Gunakan field `kota` dari tiap hari (diisi oleh parser dari field "Kota" Siagga).
  // Urutan kota dipertahankan sesuai urutan kemunculan pertama.
  const allDays = parsedData.itinerary_harian || [];

  const kotaOrder  = [];   // kota dalam urutan kemunculan
  const daysByKota = new Map();

  for (const day of allDays) {
    // Kota dari hari ini — bisa "Jiuzhaigou & Zhangjiajie"
    // Ambil kota pertama jika ada pemisah & / ,
    const rawKota  = day.kota || '';
    const kotaKey  = rawKota.split(/[&,]/)[0].trim() || 'Umum';

    if (!daysByKota.has(kotaKey)) {
      daysByKota.set(kotaKey, []);
      kotaOrder.push(kotaKey);
    }
    daysByKota.get(kotaKey).push(day);
  }

  // Jika tidak ada kota dari itinerary, fallback ke destinasi
  const kotaList = kotaOrder.length > 0
    ? kotaOrder
    : (parsedData.destinasi.length > 0 ? parsedData.destinasi : ['Umum']);

  // ─── Bangun city_groups ────────────────────────────────────────────────────
  const city_groups = kotaList.map(kota => {
    const kotaDays   = daysByKota.get(kota) || [];
    const firstDay   = kotaDays[0];
    const lastDay    = kotaDays[kotaDays.length - 1];
    const dayStart   = firstDay ? firstDay.day_no : '';
    const dayEnd     = lastDay  ? lastDay.day_no  : dayStart;

    const days = kotaDays.map(day => {
      const services = [                                    // {#services}{description}{price}
        ...(servicesByKotaWide.get(kota) || []),
        ...(servicesByKotaDay.get(`${kota}|${day.day_no}`) || []),
      ];
      // Header "Service Included: ..." — nama service unik hari ini, bukan hardcode "Private Vehicle"
      const service_summary = [...new Set(services.map(s => s.description).filter(Boolean))].join(', ') || 'TBD';

      return {
        day_no:     day.day_no,                             // {day_no}
        title:      day.judul || kota,                      // {title} = judul hari
        activities: day.activities || [],                   // {#activities}{.}{/activities}
        notes:      '',                                     // {notes}
        services,
        service_summary,                                    // {service_summary}
      };
    });

    return {
      city:      kota,                                     // {city}
      day_start: dayStart,                                 // {day_start}
      day_end:   dayEnd,                                   // {day_end}
      subtitle:  dayStart === dayEnd                       // {subtitle}
        ? `Hari ${dayStart}`
        : `Hari ${dayStart} - ${dayEnd}`,
      days,
      notes:     '',
    };
  });

  // ─── Totals ────────────────────────────────────────────────────────────────
  const totalPrivateCar = (marginResult.line_items || [])
    .filter(i => i.item && /car|van|bus/i.test(i.item))
    .reduce((s, i) => s + (i.harga_jual || 0), 0);

  const totalTiketShuttle = (marginResult.line_items || [])
    .filter(i => i.item && /tiket|shuttle|ticket/i.test(i.item))
    .reduce((s, i) => s + (i.harga_jual || 0), 0);

  // ─── templateData ──────────────────────────────────────────────────────────
  const templateData = {
    nama_klien:      parsedData.nama_klien,
    jumlah_pax:      parsedData.jumlah_pax,
    tipe_tour:       parsedData.tipe_tour,
    durasi:          parsedData.durasi,
    destinasi:       parsedData.destinasi_text,
    tanggal_mulai:   parsedData.tanggal_mulai,
    tanggal_selesai: parsedData.tanggal_selesai,
    kendaraan:       parsedData.kendaraan,
    bagasi:          parsedData.bagasi,

    total_private_car:   fmt(totalPrivateCar),
    total_tiket_shuttle: fmt(totalTiketShuttle),
    grand_total:         marginResult.total_harga_formatted || 'TBD',

    city_groups,
    catatan_operasional: parsedData.catatan_operasional,
  };

  console.log('[DOC] city_groups:', city_groups.map(g => `${g.city}(${g.days.length}d)`).join(', '));

  try {
    doc.render(templateData);
  } catch (renderError) {
    const msg = renderError.properties
      ? `docxtemplater error: ${JSON.stringify(renderError.properties.errors)}`
      : renderError.message;
    throw new Error(msg);
  }

  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { generateDoc };
