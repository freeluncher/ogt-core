/**
 * docGenerator.js
 *
 * Generate dokumen .docx dari template menggunakan docxtemplater.
 * Template: OGT_Itinerary_Quotation_Template_docxtemplater.docx
 * Sesuai §4 (step 5) PRD.
 *
 * Placeholder yang dipakai di template (format docxtemplater):
 *   {nama_klien}, {jumlah_pax}, {durasi}, {destinasi_text},
 *   {tanggal_mulai}, {tanggal_selesai}, {kendaraan}, {bagasi},
 *   {tipe_tour}, {quotation_id}
 *
 *   Loop tabel itinerary:
 *   {#itinerary_harian}{day_label} | {activities}{/itinerary_harian}
 *
 *   Loop line items harga:
 *   {#line_items}{item} | {harga_jual_formatted}{/line_items}
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
  const templateData = {
    // Field scalar
    quotation_id,
    nama_klien: parsedData.nama_klien,
    jumlah_pax: parsedData.jumlah_pax,
    tipe_tour: parsedData.tipe_tour,
    durasi: parsedData.durasi,
    destinasi_text: parsedData.destinasi_text,
    tanggal_mulai: parsedData.tanggal_mulai,
    tanggal_selesai: parsedData.tanggal_selesai,
    kendaraan: parsedData.kendaraan,
    bagasi: parsedData.bagasi,
    phone: parsedData.phone,
    tanggal_generate: new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),

    // Loop: tabel itinerary harian
    // Template: {#itinerary_harian}{day_label}{activities}{/itinerary_harian}
    itinerary_harian: parsedData.itinerary_harian,

    // Loop: list catatan operasional
    // Template: {#catatan_operasional}{.}{/catatan_operasional}
    catatan_operasional: parsedData.catatan_operasional,

    // Loop: tabel harga / line items
    // Template: {#line_items}{item}{harga_jual_formatted}{/line_items}
    line_items: marginResult.line_items,
    total_harga_formatted: marginResult.total_harga_formatted,
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
