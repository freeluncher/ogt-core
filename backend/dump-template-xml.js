/**
 * dump-template-xml.js
 * Dump XML mentah dari template untuk lihat struktur loop yang sebenarnya
 */
const fs = require('fs');
const PizZip = require('pizzip');

const TEMPLATE = 'templates/OGT_Itinerary_Quotation_Template_docxtemplater.docx';
const buf = fs.readFileSync(TEMPLATE);
const zip = new PizZip(buf);
const xml = zip.file('word/document.xml').asText();

// Hapus tag XML, biarkan text + placeholder terlihat
const readable = xml
  .replace(/<w:r[^>]*>/g, '')
  .replace(/<\/w:r>/g, '')
  .replace(/<w:t[^>]*>/g, '')
  .replace(/<\/w:t>/g, '')
  .replace(/<w:p[^>]*>/g, '\n[P] ')
  .replace(/<\/w:p>/g, '')
  .replace(/<w:tc[^>]*>/g, '\n[CELL] ')
  .replace(/<\/w:tc>/g, '')
  .replace(/<w:tr[^>]*>/g, '\n[ROW] ')
  .replace(/<\/w:tr>/g, '')
  .replace(/<[^>]+>/g, '')
  .replace(/\n\s*\n/g, '\n');

// Filter hanya baris yang mengandung placeholder atau teks bermakna
const lines = readable.split('\n').filter(l => {
  const t = l.trim();
  return t.length > 2 && (t.includes('{') || t.includes('}') ||
    ['day', 'hari', 'kota', 'service', 'price', 'city', 'total', 'catatan',
     'activities', 'description', 'undefined', 'ROW', 'CELL'].some(k => t.toLowerCase().includes(k)));
});

fs.writeFileSync('template-structure.txt', lines.join('\n'));
console.log('Output: template-structure.txt');
console.log('Baris relevan:', lines.length);
console.log('\n=== ISI ===\n');
console.log(lines.slice(0, 120).join('\n'));
