/**
 * webhook.js — Route handler utama
 *
 * POST /api/webhooks/itinerary-json
 *
 * Alur (MVP2 — lihat plan "Web App Quotation Builder — Sales UI"):
 *   1. Validasi secret (middleware, sudah dijalankan sebelum handler ini)
 *   2. Parse & normalisasi payload
 *   3. Simpan row ke itinerary_submissions (status='received')
 *   4. Match assigned_sales → sales_id (kalau tidak match, biarkan null — sales claim manual di UI)
 *   5. Saran otomatis line item (rule-based, serviceSuggester) → simpan sbg quotations draft
 *   6. Update submission ke status='pending_review'
 *   7. Return response (TIDAK generate dokumen di sini — itu dipicu sales dari web app
 *      setelah review harga, lewat POST /api/quotations/:id/generate)
 *
 * Error handling:
 *   - Semua request WAJIB tercatat ke DB (sukses maupun gagal)
 *   - Parse gagal → status='failed', tetap simpan raw_payload
 *   - Suggestion engine gagal → tidak fatal, quotation tetap dibuat dengan line_items kosong
 *     (sales isi manual di UI)
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');

const validateSecret = require('../middleware/validateSecret');
const { parsePayload } = require('../services/parser');
const { suggestServices } = require('../services/serviceSuggester');
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

/** Cocokkan assigned_sales_email (dari payload Siagga, field Assigned_Sales_Email) ke row sales aktif. Null kalau tidak match. */
async function matchSalesId(assignedSalesEmail) {
  if (!assignedSalesEmail) return null;

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('sales')
    .select('id, email')
    .eq('is_active', true);

  if (error || !data) return null;

  const match = data.find(
    (s) => s.email.trim().toLowerCase() === String(assignedSalesEmail).trim().toLowerCase()
  );
  return match ? match.id : null;
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

    // ── Step 2: Match sales pemilik submission (kalau ada field-nya) ─────────
    const sales_id = await matchSalesId(parsed.assigned_sales_email);

    // ── Step 3: Simpan raw ke DB (audit trail) — WAJIB untuk semua request ───
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
        sales_id,
        raw_payload: body, // simpan payload asli untuk debug
        status: parseFailed ? 'failed' : 'received',
        error_message: parseFailed
          ? `Parse gagal pada field: ${failedFields.join(', ')}. Detail: ${errors.join('; ')}`
          : null,
      });

      console.log(`[WEBHOOK] Row disimpan ke DB — id: ${submissionId}, status: ${parseFailed ? 'failed' : 'received'}, sales_id: ${sales_id || '(unassigned)'}`);
    } catch (dbErr) {
      // Jika DB insert gagal total, return 500
      console.error('[WEBHOOK] KRITIS: Gagal simpan ke DB:', dbErr.message);
      return res.status(500).json({
        status: 'error',
        message: 'Gagal menyimpan data ke database',
      });
    }

    // ── Step 4: Jika parse kritis gagal → return 422 (tapi data sudah tersimpan) ─
    if (parseFailed && failedFields.includes('itinerary_harian')) {
      return res.status(422).json({
        status: 'error',
        message: `Field kritis tidak valid JSON: ${failedFields.join(', ')}`,
        raw_field: failedFields[0],
      });
    }

    // ── Step 5: Saran otomatis line item (rule-based, bukan AI) ──────────────
    let suggestion = { line_items: [], total_harga: 0, total_harga_formatted: 'TBD' };
    try {
      const supabase = getSupabaseClient();
      const { data: catalog, error: catalogErr } = await supabase
        .from('services_catalog')
        .select('*')
        .eq('is_active', true);

      if (catalogErr) throw new Error(catalogErr.message);
      suggestion = suggestServices(parsed.itinerary_harian, catalog || []);
    } catch (suggestErr) {
      // Tidak fatal — sales tetap bisa isi line item manual di UI
      console.error('[WEBHOOK] Service suggestion gagal (non-fatal):', suggestErr.message);
    }

    // ── Step 6: Simpan quotation draft + update submission ke pending_review ──
    const supabase = getSupabaseClient();
    const { error: quotationErr } = await supabase.from('quotations').insert({
      submission_id: submissionId,
      sales_id,
      status: 'draft',
      line_items: suggestion.line_items,
      total_harga: suggestion.total_harga,
      total_harga_formatted: suggestion.total_harga_formatted,
    });

    if (quotationErr) {
      console.error('[WEBHOOK] Gagal simpan quotation draft:', quotationErr.message);
      await updateSubmission(submissionId, {
        status: 'failed',
        error_message: `Gagal simpan quotation draft: ${quotationErr.message}`,
      });
      return res.status(500).json({
        status: 'error',
        message: 'Gagal menyiapkan draft quotation',
      });
    }

    await updateSubmission(submissionId, { status: 'pending_review' });

    console.log(`[WEBHOOK] Selesai — quotation_id: ${quotation_id}, submission_id: ${submissionId}, status: pending_review`);

    // ── Step 7: Return response — TIDAK ada URL dokumen, generate dipicu sales dari web app ─
    return res.status(200).json({
      status: 'ok',
      quotation_id,
      submission_id: submissionId,
      review_status: 'pending_review',
    });
  }
);

module.exports = router;
