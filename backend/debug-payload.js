/**
 * debug-payload.js
 * Simulasi parsing payload real dari itinerary_submissions (ambil dari Supabase)
 * Jalankan: node debug-payload.js
 */
require('dotenv').config();
const { parsePayload } = require('./src/services/parser');

// Payload real dari Siagga berdasarkan data di hasil-generate-2.docx
const realPayload = {
  contact_name: "Monica",
  phone: "62812xxxxxxx",
  source: "ItineraryExtractor",
  nama_klien: "Monica",
  jumlah_pax: "2 Pax",
  tipe_tour: "Private Tour",
  durasi: "9 Hari (Hari 1 - Hari 9)",
  destinasi: "",   // ← kosong di payload real!
  tanggal_mulai: "",
  tanggal_selesai: "",
  kendaraan: "Private car",
  bagasi: "",
  // itinerary_harian real dari Siagga — field berbeda dari sample_payload.json!
  itinerary_harian: JSON.stringify([
    {"Hari":"1","Kota":"Chengdu","Judul":"Kota Panda & Budaya Sichuan","Daftar_aktivitas":["Chengdu Panda Base — konservasi panda raksasa","Wenshu Monastery — kuil Buddha bersejarah","Jinli Ancient Street — kawasan kota tua"]},
    {"Hari":"2","Kota":"Chengdu","Judul":"Dujiangyan & Mount Qingcheng","Daftar_aktivitas":["Dujiangyan Irrigation System","Mount Qingcheng"]},
    {"Hari":"3","Kota":"Chengdu","Judul":"Mount Emei atau Alternatif Day Trip","Daftar_aktivitas":["Mount Emei atau alternatif day trip"]},
    {"Hari":"4","Kota":"Jiuzhaigou","Judul":"Perjalanan ke Jiuzhaigou","Daftar_aktivitas":["Penerbangan Chengdu -> Jiuzhaigou","Check-in hotel & istirahat"]},
    {"Hari":"5","Kota":"Jiuzhaigou","Judul":"Jelajahi Jiuzhaigou National Park","Daftar_aktivitas":["Shuzheng Valley, Zechawa Valley, Five Flower Lake"]},
    {"Hari":"6","Kota":"Jiuzhaigou & Zhangjiajie","Judul":"Tambahan Spot + Lanjut Zhangjiajie","Daftar_aktivitas":["Huanglong atau spot tambahan","Penerbangan ke Zhangjiajie"]},
    {"Hari":"7","Kota":"Zhangjiajie","Judul":"Wulingyuan Scenic Area","Daftar_aktivitas":["Wulingyuan Scenic Area — Yuanjiajie, Bailong Elevator"]},
    {"Hari":"8","Kota":"Zhangjiajie","Judul":"Tianmen Mountain atau Glass Bridge","Daftar_aktivitas":["Tianmen Mountain atau Glass Bridge"]},
    {"Hari":"9","Kota":"Zhangjiajie","Judul":"Eksplor Tambahan & Penerbangan Pulang","Daftar_aktivitas":["Opsional: eksplor area tambahan","Penerbangan pulang"]}
  ]),
  catatan_operasional: JSON.stringify(["Visa China diurus mandiri","Tiket pesawat tidak termasuk"])
};

const { parsed } = parsePayload(realPayload);

console.log('\n=== HASIL PARSE ===');
console.log('destinasi_text:', parsed.destinasi_text);
console.log('destinasi (array):', parsed.destinasi);
console.log('itinerary_harian[0]:', JSON.stringify(parsed.itinerary_harian[0], null, 2));
console.log('itinerary_harian count:', parsed.itinerary_harian.length);
