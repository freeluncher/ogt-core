/**
 * patch-template-service-header.js
 *
 * Template docx punya teks statis "Service Included: Private Vehicle" di header
 * tabel service tiap hari — padahal service per hari sekarang bisa macam-macam
 * (Tour Guide, Transfer, Ticket Assistance, bukan cuma Private Vehicle).
 * Ganti jadi placeholder {service_summary} biar dynamic, diisi docGenerator.js
 * dari daftar service aktual hari itu.
 *
 * Jalankan sekali: node patch-template-service-header.js
 */
const fs = require('fs');
const PizZip = require('pizzip');

const TEMPLATE_PATH = 'templates/OGT_Itinerary_Quotation_Template_docxtemplater.docx';
const OLD_TEXT = 'Service Included: Private Vehicle';
const NEW_TEXT = 'Service Included: {service_summary}';

const zip = new PizZip(fs.readFileSync(TEMPLATE_PATH));
const xml = zip.file('word/document.xml').asText();

if (!xml.includes(OLD_TEXT)) {
  if (xml.includes('{service_summary}')) {
    console.log('Template sudah dipatch sebelumnya — skip.');
    process.exit(0);
  }
  console.error(`Teks "${OLD_TEXT}" tidak ditemukan di template — cek manual, mungkin sudah berubah.`);
  process.exit(1);
}

const patchedXml = xml.replace(OLD_TEXT, NEW_TEXT);
zip.file('word/document.xml', patchedXml);
fs.writeFileSync(TEMPLATE_PATH, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));

console.log(`Patched: "${OLD_TEXT}" -> "${NEW_TEXT}"`);
