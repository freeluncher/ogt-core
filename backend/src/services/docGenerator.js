/**
 * docGenerator.js
 *
 * Generate dokumen .docx dari template menggunakan docxtemplater.
 * Template: OGT_Itinerary_Quotation_Template_docxtemplater.docx
 * Sesuai §4 (step 5) PRD.
 *
 * Struktur template AKTUAL (hasil dump-template-xml.js):
 *
 *   Scalar: {nama_klien}, {jumlah_pax}, {tipe_tour}, {durasi}, {destinasi},
 *           {tanggal_mulai}, {tanggal_selesai}, {kendaraan}, {bagasi}
 *           {total_private_car}, {total_tiket_shuttle}, {grand_total}
 *
 *   {#city_groups}
 *     {city} | Hari {day_start} - {day_end} - {subtitle}   ← header per kota
 *     {#days}
 *       Hari {day_no} - {title}                             ← per hari
 *       {#activities}{.}{/activities}                       ← array of strings!
 *       Catatan: {notes}
 *       {#services}{description}{price}{/services}          ← layanan per hari
 *     {/days}
 *   {/city_groups}
 *
 *   {#catatan_operasional}{.}{/catatan_operasional}
 */

const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

const TEMPLATE_PATH = path.join(
  __dirname,
  '../../templates/OGT_Itinerary_Quotation_Template_docxtemplater.docx'
);

/** Format angka ke IDR string */
function fmt(n) {
  if (!n || n === 0) return 'TBD';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(n);
}

/**
 * Generate dokumen .docx dari data parsed + line items.
 *
 * @param {object} parsedData   - Output dari parser.parsePayload().parsed
 * @param {object} marginResult - Output dari marginEngine.calculateMargin()
 * @param {string} quotation_id - UUID untuk dokumen ini
 * @returns {Buffer}            - Buffer berisi file .docx hasil generate
 */
function generateDoc(parsedData, marginResult, quotation_id) {
  // Cek template ada
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(
      `Template tidak ditemukan: ${TEMPLATE_PATH}\n` +
        'Salin OGT_Itinerary_Quotation_Template_docxtemplater.docx ke folder templates/'
    );
  }

  const templateBuffer = fs.readFileSync(TEMPLATE_PATH);
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    errorLogging: false,
    // Tag tanpa data → string kosong (bukan error)
    nullGetter: () => '',
  });

  // ─── Build templateData ────────────────────────────────────────────────────
  //
  // PENTING: nama key HARUS persis sama dengan placeholder di template.
  // Struktur city_groups/days/activities/services ditentukan dari XML template.

  const destinasiList = Array.isArray(parsedData.destinasi) && parsedData.destinasi.length > 0
    ? parsedData.destinasi
    : ['Umum'];

  const allDays = parsedData.itinerary_harian || [];

  // Kelompokkan services per kota dari line_items
  const servicesByKota = new Map();
  for (const lineItem of (marginResult.line_items || [])) {
    const kota = lineItem.kota || 'Umum';
    if (!servicesByKota.has(kota)) servicesByKota.set(kota, []);
    servicesByKota.get(kota).push({
      description: lineItem.item || '',
      price: lineItem.harga_jual_formatted || 'TBD',
    });
  }

  // Bagi hari merata ke tiap kota
  const hariPerKota = Math.ceil(allDays.length / destinasiList.length);

  // Bangun city_groups — days nested di dalamnya
  const city_groups = destinasiList.map((kota, kotaIdx) => {
    const startIdx = kotaIdx * hariPerKota;
    const endIdx = Math.min(startIdx + hariPerKota, allDays.length);
    const kotaDays = allDays.slice(startIdx, endIdx);

    const firstDayNo = kotaDays[0]
      ? String(kotaDays[0].day_label || '').replace(/[^0-9]/g, '') || String(startIdx + 1)
      : String(startIdx + 1);
    const lastDayNo = kotaDays[kotaDays.length - 1]
      ? String(kotaDays[kotaDays.length - 1].day_label || '').replace(/[^0-9]/g, '') || String(endIdx)
      : String(endIdx);

    const days = kotaDays.map((item, dayIdx) => {
      const rawAct = String(item.activities || '');

      // {#activities}{.}{/activities} — array of plain strings
      const activities = rawAct
        .split(/\n|(?<=[.!?])\s+(?=[A-Z\u2022\-])/)
        .map(s => s.trim())
        .filter(s => s.length > 2);

      // Jika split tidak menghasilkan apa-apa, gunakan seluruh teks
      const activityFinal = activities.length > 0 ? activities : [rawAct].filter(s => s);

      const dayNo = String(item.day_label || '').replace(/[^0-9]/g, '') || String(startIdx + dayIdx + 1);

      // Cari nama kota dari teks aktivitas
      const cityFromAct = destinasiList.find(d =>
        rawAct.toLowerCase().includes(d.toLowerCase())
      ) || String(kota);

      return {
        day_no:     dayNo,                         // "Hari {day_no} - {title}"
        title:      cityFromAct,                   // nama kota / label hari ini
        activities: activityFinal,                 // {#activities}{.}{/activities}
        notes:      '',                            // Catatan: {notes}
        services:   servicesByKota.get(String(kota)) || [],  // {#services}{description}{price}
      };
    });

    return {
      city:      String(kota),
      day_start: firstDayNo,
      day_end:   lastDayNo,
      subtitle:  firstDayNo === lastDayNo
        ? `Hari ${firstDayNo}`
        : `Hari ${firstDayNo} - ${lastDayNo}`,
      days,
      notes:     '',
    };
  });

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalPrivateCar = (marginResult.line_items || [])
    .filter(i => i.item && i.item.toLowerCase().includes('car'))
    .reduce((s, i) => s + (i.harga_jual || 0), 0);

  const totalTiketShuttle = (marginResult.line_items || [])
    .filter(i => i.item && (
      i.item.toLowerCase().includes('tiket') ||
      i.item.toLowerCase().includes('shuttle')
    ))
    .reduce((s, i) => s + (i.harga_jual || 0), 0);

  // ── templateData ──────────────────────────────────────────────────────────
  const templateData = {
    // Scalar
    nama_klien:      parsedData.nama_klien,
    jumlah_pax:      parsedData.jumlah_pax,
    tipe_tour:       parsedData.tipe_tour,
    durasi:          parsedData.durasi,
    destinasi:       parsedData.destinasi_text,     // {destinasi} = string
    tanggal_mulai:   parsedData.tanggal_mulai,
    tanggal_selesai: parsedData.tanggal_selesai,
    kendaraan:       parsedData.kendaraan,
    bagasi:          parsedData.bagasi,

    // Summary totals
    total_private_car:   fmt(totalPrivateCar),
    total_tiket_shuttle: fmt(totalTiketShuttle),
    grand_total:         marginResult.total_harga_formatted || 'TBD',

    // Loop utama (days nested di dalam city_groups)
    city_groups,

    // Loop catatan: {#catatan_operasional}{.}{/catatan_operasional}
    catatan_operasional: parsedData.catatan_operasional,
  };

  console.log('[DOC] templateData city_groups count:', city_groups.length);
  console.log('[DOC] days per group:', city_groups.map(g => g.days.length));

  // Render
  try {
    doc.render(templateData);
  } catch (renderError) {
    const errorMsg = renderError.properties
      ? `docxtemplater render error: ${JSON.stringify(renderError.properties.errors)}`
      : renderError.message;
    throw new Error(errorMsg);
  }

  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { generateDoc };
