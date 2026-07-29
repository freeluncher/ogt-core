/**
 * docGenerator.js
 *
 * Generate dokumen .docx dari template menggunakan docxtemplater.
 * Template: OGT_Itinerary_Quotation_Template_docxtemplater.docx
 * Sesuai §4 (step 5) PRD.
 *
 * Placeholder yang dipakai di template (NAMA AKTUAL — hasil debug-template.js):
 *
 *   Simple vars:
 *   {nama_klien}, {jumlah_pax}, {tipe_tour}, {durasi}, {destinasi},
 *   {tanggal_mulai}, {tanggal_selesai}, {kendaraan}, {bagasi},
 *   {total_private_car}, {total_tiket_shuttle}, {grand_total}
 *
 *   Loop itinerary:
 *   {#days}
 *     {day_no}     → label hari, contoh: "Hari 1"
 *     {day_start}  → kota awal hari itu
 *     {day_end}    → kota akhir hari itu (bisa sama)
 *     {#activities}{description}{/activities}  → list kegiatan
 *   {/days}
 *
 *   Loop harga per kota:
 *   {#city_groups}
 *     {city}  → nama kota
 *     {#services}{title}{subtitle}{price}{/services}  → layanan di kota itu
 *     {notes} → catatan kota
 *   {/city_groups}
 *
 *   Loop catatan:
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

/**
 * Generate dokumen .docx dari data parsed + line items.
 *
 * @param {object} parsedData - Output dari parser.parsePayload().parsed
 * @param {object} marginResult - Output dari marginEngine.calculateMargin()
 * @param {string} quotation_id - UUID untuk dokumen ini
 * @returns {Buffer} - Buffer berisi file .docx hasil generate
 */
function generateDoc(parsedData, marginResult, quotation_id) {
  // Cek template ada
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(
      `Template tidak ditemukan: ${TEMPLATE_PATH}\n` +
        'Upload OGT_Itinerary_Quotation_Template_docxtemplater.docx ke folder templates/'
    );
  }

  // Baca template
  const templateBuffer = fs.readFileSync(TEMPLATE_PATH);
  const zip = new PizZip(templateBuffer);

  const doc = new Docxtemplater(zip, {
    // Paragraf/baris yang tidak ada datanya → hapus (bukan error)
    paragraphLoop: true,
    linebreaks: true,
    // Error handler — lempar error agar bisa di-catch di route handler
    errorLogging: false,
  });

  // ─── Data object yang dikirim ke template ─────────────────────────────────
  // Nama field HARUS persis sama dengan placeholder di template .docx
  // (hasil verifikasi: node debug-template.js)

  // ── Bangun struktur days dari itinerary_harian ────────────────────────────
  // Template pakai: {#days}{day_no}{day_start}{day_end}{#activities}{description}{/activities}{/days}
  const days = (parsedData.itinerary_harian || []).map((item) => {
    // Pisah activities: kalau ada '\n' atau '. ', jadikan array terpisah
    const rawActivities = String(item.activities || '');
    const activityList = rawActivities
      .split(/\n|(?<=\.)\s+(?=[A-Z•\-])/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    return {
      day_no: String(item.day_label || ''),
      day_start: String(item.day_label || '').replace(/Hari \d+\s*[|\-]?\s*/i, '').trim() || '',
      day_end: '',
      // {#activities}{description}{/activities}
      activities: activityList.map(desc => ({ description: desc })),
    };
  });

  // ── Bangun struktur city_groups dari line_items ───────────────────────────
  // Template pakai: {#city_groups}{city}{#services}{title}{subtitle}{price}{/services}{notes}{/city_groups}
  // Kelompokkan line_items per kota
  const cityMap = new Map();
  for (const item of (marginResult.line_items || [])) {
    const kota = item.kota || 'Umum';
    if (!cityMap.has(kota)) cityMap.set(kota, []);
    cityMap.get(kota).push({
      title: item.item || '',
      subtitle: item.note || '',
      price: item.harga_jual_formatted || 'TBD',
    });
  }
  const city_groups = Array.from(cityMap.entries()).map(([city, services]) => ({
    city,
    services,
    notes: '',
  }));

  // ── Total per kategori ────────────────────────────────────────────────────
  const totalPrivateCar = marginResult.line_items
    .filter(i => i.item && i.item.toLowerCase().includes('car'))
    .reduce((s, i) => s + (i.harga_jual || 0), 0);

  const totalTiketShuttle = marginResult.line_items
    .filter(i => i.item && (i.item.toLowerCase().includes('tiket') || i.item.toLowerCase().includes('shuttle')))
    .reduce((s, i) => s + (i.harga_jual || 0), 0);

  const templateData = {
    // ── Field scalar ──────────────────────────────────────────────────────
    nama_klien: parsedData.nama_klien,
    jumlah_pax: parsedData.jumlah_pax,
    tipe_tour: parsedData.tipe_tour,
    durasi: parsedData.durasi,
    destinasi: parsedData.destinasi_text,   // template pakai {destinasi} bukan {destinasi_text}
    tanggal_mulai: parsedData.tanggal_mulai,
    tanggal_selesai: parsedData.tanggal_selesai,
    kendaraan: parsedData.kendaraan,
    bagasi: parsedData.bagasi,

    // ── Totals ────────────────────────────────────────────────────────────
    total_private_car: totalPrivateCar > 0
      ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(totalPrivateCar)
      : 'TBD',
    total_tiket_shuttle: totalTiketShuttle > 0
      ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(totalTiketShuttle)
      : 'TBD',
    grand_total: marginResult.total_harga_formatted,

    // ── Loop itinerary harian ─────────────────────────────────────────────
    // Template: {#days}{day_no}{day_start}{day_end}{#activities}{description}{/activities}{/days}
    days,

    // ── Loop harga per kota ───────────────────────────────────────────────
    // Template: {#city_groups}{city}{#services}{title}{subtitle}{price}{/services}{notes}{/city_groups}
    city_groups,

    // ── Loop catatan operasional ──────────────────────────────────────────
    // Template: {#catatan_operasional}{.}{/catatan_operasional}
    catatan_operasional: parsedData.catatan_operasional,
  };

  // Render template
  try {
    doc.render(templateData);
  } catch (renderError) {
    // docxtemplater error bisa berisi detail per-tag
    const errorMsg = renderError.properties
      ? `docxtemplater render error: ${JSON.stringify(renderError.properties.errors)}`
      : renderError.message;
    throw new Error(errorMsg);
  }

  // Return sebagai Buffer
  const outputBuffer = doc.getZip().generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });

  return outputBuffer;
}

module.exports = { generateDoc };
