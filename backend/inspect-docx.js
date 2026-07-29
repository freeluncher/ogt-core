/**
 * inspect-docx.js — ekstrak teks dari .docx, cari "undefined", "umum", dan tampilkan struktur
 */
const fs = require('fs');
const PizZip = require('pizzip');

const filePath = process.argv[2] || 'debug-output.docx';
if (!fs.existsSync(filePath)) { console.error('File tidak ditemukan:', filePath); process.exit(1); }

const zip = new PizZip(fs.readFileSync(filePath));
const xml = zip.file('word/document.xml').asText();

const plain = xml
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

const words = plain.split(' ');

function findKeyword(kw) {
  const hits = [];
  for (let i = 0; i < words.length; i++) {
    if (words[i].toLowerCase().includes(kw.toLowerCase())) {
      hits.push(`[pos ${i}] ...${words.slice(Math.max(0,i-6), i+10).join(' ')}...`);
    }
  }
  return hits;
}

console.log('\n=== "undefined" ===');
const u = findKeyword('undefined');
u.length ? u.forEach(x => console.log(x)) : console.log('✅ Tidak ada!');

console.log('\n=== "umum" ===');
findKeyword('umum').forEach(x => console.log(x));

console.log('\n=== "[object" ===');
findKeyword('[object').forEach(x => console.log(x));

console.log('\n=== TEKS PENUH (1500 karakter pertama) ===');
console.log(plain.slice(0, 1500));
