/**
 * webhook.js — Route handler utama
 *
 * POST /api/webhooks/itinerary-json
 *
 * Alur lengkap sesuai §3, §4 PRD:
 *   1. Validasi secret (middleware, sudah dijalankan sebelum handler ini)
 *   2. Parse & normalisasi payload
 *   3. Simpan row ke itinerary_submissions (status='received')
 *   4. Hitung margin
 *   5. Generate dokumen .docx
 *   6. Konversi ke PDF (non-blocking)
 *   7. Upload ke Supabase Storage
 *   8. Update row ke status='processed', simpan URL
 *   9. Return response sukses
 *
 * Error handling:
 *   - Semua request WAJIB tercatat ke DB (sukses maupun gagal)
 *   - Parse gagal → status='failed', tetap simpan raw_payload
 *   - Doc/upload gagal → status='failed', catat error_message
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');

const validateSecret = require('../middleware/validateSecret');
const { parsePayload } = require('../services/parser');
const { calculateMargin } = require('../services/marginEngine');
const { generateDoc } = require('../services/docGenerator');
const { convertToPdf } = require('../services/pdfConverter');
const { uploadToStorage } = require('../services/storageUploader');
const { getSupabaseClient } = require('../db/supabase');

const router = express.Router();

// ─── Helpers DB ───────────────────────────────────────────────────────────────

async function insertSubmission(payload) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('itinerary_submissions')
    .insert(payload)
    .select('id')
    .single();

  if (error) throw new Error(`DB insert gagal: ${error.message}`);
  return data.id;
}

async function updateSubmission(id, updates) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('itinerary_submissions')
    .update(updates)
    .eq('id', id);

  if (error) console.error(`[DB] Update gagal untuk id=${id}:`, error.message);
}

// ─── Route Handler ─────────────────────────────────────────────────────────────

router.post(
  '/itinerary-json',
  validateSecret, // Langkah PERTAMA — cek secret sebelum proses apapun
  async (req, res) => {
    const body = req.body;
    const quotation_id = `q_${uuidv4().split('-')[0]}`;
    let submissionId = null;

    console.log(`[WEBHOOK] Request masuk — quotation_id: ${quotation_id}`, {
      contact_name: body.contact_name,
      phone: body.phone,
      timestamp: new Date().toISOString(),
    });

    // ── Step 1: Parse & normalisasi payload ───────────────────────────────────
    const { parsed, parseFailed, failedFields, errors } = parsePayload(body);

    // ── Step 2: Simpan raw ke DB (audit trail) — WAJIB untuk semua request ───
    try {
      submissionId = await insertSubmission({
        contact_name: parsed.contact_name,
        phone: parsed.phone,
        nama_klien: parsed.nama_klien,
        jumlah_pax: parsed.jumlah_pax,
        tipe_tour: parsed.tipe_tour,
        durasi: parsed.durasi,
        destinasi: parsed.destinasi,
        tanggal_mulai: parsed.tanggal_mulai,
        tanggal_selesai: parsed.tanggal_selesai,
        kendaraan: parsed.kendaraan,
        bagasi: parsed.bagasi,
        itinerary_harian: parsed.itinerary_harian,
        catatan_operasional: parsed.catatan_operasional,
        raw_payload: body, // simpan payload asli untuk debug
        status: parseFailed ? 'failed' : 'received',
        error_message: parseFailed
          ? `Parse gagal pada field: ${failedFields.join(', ')}. Detail: ${errors.join('; ')}`
          : null,
      });

      console.log(`[WEBHOOK] Row disimpan ke DB — id: ${submissionId}, status: ${parseFailed ? 'failed' : 'received'}`);
    } catch (dbErr) {
      // Jika DB insert gagal total, return 500
      console.error('[WEBHOOK] KRITIS: Gagal simpan ke DB:', dbErr.message);
      return res.status(500).json({
        status: 'error',
        message: 'Gagal menyimpan data ke database',
      });
    }

    // ── Step 3: Jika parse kritis gagal → return 422 (tapi data sudah tersimpan) ─
    if (parseFailed && failedFields.includes('itinerary_harian')) {
      return res.status(422).json({
        status: 'error',
        message: `Field kritis tidak valid JSON: ${failedFields.join(', ')}`,
        raw_field: failedFields[0],
      });
    }

    // ── Step 4: Hitung margin ─────────────────────────────────────────────────
    let marginResult;
    try {
      marginResult = await calculateMargin(parsed);
    } catch (marginErr) {
      console.error('[WEBHOOK] Margin calculation error:', marginErr.message);
      // Tidak fatal — lanjut dengan line items kosong
      marginResult = { line_items: [], total_harga: 0, total_harga_formatted: 'TBD' };
    }

    // ── Step 5: Generate dokumen .docx ───────────────────────────────────────
    let docxBuffer;
    try {
      docxBuffer = generateDoc(parsed, marginResult, quotation_id);
      console.log(`[WEBHOOK] Dokumen .docx berhasil digenerate — ${docxBuffer.length} bytes`);
    } catch (docErr) {
      console.error('[WEBHOOK] Gagal generate dokumen:', docErr.message);
      await updateSubmission(submissionId, {
        status: 'failed',
        error_message: `Generate dokumen gagal: ${docErr.message}`,
      });
      return res.status(500).json({
        status: 'error',
        message: `Gagal generate dokumen: ${docErr.message}`,
      });
    }

    // ── Step 6: Konversi ke PDF (non-blocking) ────────────────────────────────
    let pdfBuffer = null;
    try {
      pdfBuffer = await convertToPdf(docxBuffer, `${quotation_id}_itinerary`);
    } catch (pdfErr) {
      console.warn('[WEBHOOK] PDF conversion error (non-fatal):', pdfErr.message);
      // Tidak fatal — lanjut dengan fallback ke .docx
    }

    // ── Step 7: Upload ke Supabase Storage ───────────────────────────────────
    let itinerary_docx_url = null;
    let itinerary_pdf_url = null;
    let quotation_pdf_url = null; // MVP: sama file dengan itinerary untuk sekarang

    try {
      // Upload .docx (selalu)
      itinerary_docx_url = await uploadToStorage(
        docxBuffer,
        `${quotation_id}/${quotation_id}_itinerary.docx`,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );

      // Upload PDF (jika berhasil dikonversi)
      if (pdfBuffer) {
        itinerary_pdf_url = await uploadToStorage(
          pdfBuffer,
          `${quotation_id}/${quotation_id}_itinerary.pdf`,
          'application/pdf'
        );
        quotation_pdf_url = itinerary_pdf_url; // MVP: 1 file untuk itinerary + quotation
      } else {
        // Fallback: pakai .docx URL
        itinerary_pdf_url = itinerary_docx_url;
        quotation_pdf_url = itinerary_docx_url;
      }
    } catch (uploadErr) {
      console.error('[WEBHOOK] Upload gagal:', uploadErr.message);
      await updateSubmission(submissionId, {
        status: 'failed',
        error_message: `Upload storage gagal: ${uploadErr.message}`,
      });
      return res.status(500).json({
        status: 'error',
        message: `Upload file gagal: ${uploadErr.message}`,
      });
    }

    // ── Step 8: Update row ke 'processed' dengan URL dokumen ─────────────────
    await updateSubmission(submissionId, {
      status: 'processed',
      itinerary_pdf_url,
      quotation_pdf_url,
      error_message: null,
    });

    console.log(`[WEBHOOK] Selesai — quotation_id: ${quotation_id}`, {
      itinerary_pdf_url,
      quotation_pdf_url,
    });

    // ── Step 9: Return response sesuai kontrak API §2.2 ──────────────────────
    return res.status(200).json({
      status: 'ok',
      quotation_id,
      itinerary_pdf_url,
      quotation_pdf_url,
    });
  }
);

module.exports = router;
