/**
 * pdfConverter.js
 *
 * Konversi file .docx ke .pdf menggunakan CloudConvert API.
 * 
 * Sesuai §4 (step 5) PRD dan Implementation Plan.
 * Tidak blocking — error konversi tidak gagalkan seluruh request, 
 * akan me-return null (fallback ke .docx) jika gagal.
 */

const fs = require('fs/promises');
const fsSync = require('fs');
const os = require('os');
const path = require('path');
const CloudConvert = require('cloudconvert');
const { v4: uuidv4 } = require('uuid');

/**
 * Konversi Buffer DOCX menjadi Buffer PDF menggunakan CloudConvert SDK
 * @param {Buffer} docxBuffer 
 * @param {string} filename 
 * @returns {Promise<Buffer|null>}
 */
async function convertToPdf(docxBuffer, filename) {
  const { CLOUDCONVERT_API_KEY } = process.env;

  if (!CLOUDCONVERT_API_KEY) {
    console.warn('[PDF] CLOUDCONVERT_API_KEY tidak ada di env. Melewati konversi PDF.');
    return null;
  }

  const cloudConvert = new CloudConvert(CLOUDCONVERT_API_KEY);
  const fileToUpload = `${filename}.docx`;
  const tempPath = path.join(os.tmpdir(), `ogt_temp_${uuidv4()}_${fileToUpload}`);
  
  console.log(`[PDF] Memulai konversi untuk ${fileToUpload} via CloudConvert...`);

  try {
    // Tulis buffer docx ke file temporary lokal
    await fs.writeFile(tempPath, docxBuffer);

    // 1. Buat Job di CloudConvert
    let job = await cloudConvert.jobs.create({
      tasks: {
        'import-file': { 
          operation: 'import/upload' 
        },
        'convert-file': { 
          operation: 'convert', 
          input: 'import-file', 
          output_format: 'pdf' 
        },
        'export-file': { 
          operation: 'export/url', 
          input: 'convert-file' 
        }
      }
    });

    // 2. Upload file menggunakan SDK
    const uploadTask = job.tasks.find(task => task.name === 'import-file');
    await cloudConvert.tasks.upload(uploadTask, fsSync.createReadStream(tempPath), fileToUpload);

    // 3. Tunggu hingga job selesai (konversi & export URL siap)
    job = await cloudConvert.jobs.wait(job.id);
    const exportTask = job.tasks.find(task => task.name === 'export-file');

    if (exportTask.status === 'error') {
      throw new Error('CloudConvert task failed: ' + exportTask.message);
    }

    const pdfUrl = exportTask.result.files[0].url;

    // 4. Download file PDF hasil konversi
    const { default: fetch } = await import('node-fetch');
    const pdfRes = await fetch(pdfUrl);
    if (!pdfRes.ok) {
        throw new Error(`Gagal mengunduh hasil PDF dari CloudConvert: ${pdfRes.statusText}`);
    }
    const arrayBuffer = await pdfRes.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    console.log(`[PDF] ✅ CloudConvert sukses: ${filename} → ${pdfBuffer.length} bytes`);
    return pdfBuffer;

  } catch (err) {
    console.error(`[PDF] ❌ Konversi CloudConvert gagal:`, err.message);
    return null; // Fallback jika gagal
  } finally {
    // 5. Bersihkan temporary file
    try {
      await fs.unlink(tempPath);
    } catch (cleanupErr) {
      // Abaikan jika file sudah tidak ada
    }
  }
}

module.exports = { convertToPdf };
