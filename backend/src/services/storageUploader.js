/**
 * storageUploader.js
 *
 * Upload file hasil generate ke Supabase Storage bucket 'documents'.
 * Sesuai §4 (step 6), §3 PRD — bucket harus sudah dibuat dan bersifat public.
 *
 * Path file di storage: {quotation_id}/{filename}
 * Return: public URL file yang bisa diakses langsung
 */

const { getSupabaseClient } = require('../db/supabase');

const BUCKET_NAME = 'documents';

/**
 * Upload buffer ke Supabase Storage.
 *
 * @param {Buffer} buffer - Isi file
 * @param {string} filePath - Path di dalam bucket, contoh: "q_abc123/itinerary.pdf"
 * @param {string} mimeType - MIME type file, contoh: "application/pdf"
 * @returns {Promise<string>} - Public URL file
 */
async function uploadToStorage(buffer, filePath, mimeType) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, buffer, {
      contentType: mimeType,
      upsert: true, // overwrite jika file sudah ada (retry friendly)
    });

  if (error) {
    throw new Error(`Supabase Storage upload gagal: ${error.message}`);
  }

  // Dapatkan public URL
  const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);

  if (!urlData || !urlData.publicUrl) {
    throw new Error(`Gagal mendapatkan public URL untuk: ${filePath}`);
  }

  console.log(`[STORAGE] Upload sukses: ${urlData.publicUrl}`);
  return urlData.publicUrl;
}

module.exports = { uploadToStorage };
