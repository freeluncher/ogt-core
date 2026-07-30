/**
 * quotations.js — Endpoint web app quotation builder (MVP2)
 *
 * Semua endpoint di file ini butuh requireAuth (Supabase JWT sales).
 * Ini BUKAN endpoint webhook Siagga — itu tetap di webhook.js/validateSecret.
 *
 *   GET  /api/submissions              — list submission (scope: mine|unassigned|all)
 *   GET  /api/submissions/:id          — detail submission + quotation draft-nya
 *   PUT  /api/quotations/:id           — simpan edit line items (backend hitung ulang total)
 *   POST /api/quotations/:id/generate  — generate dokumen final dari line items yang di-approve
 *   GET  /api/services-catalog         — list katalog service aktif (buat picker UI)
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');

const requireAuth = require('../middleware/requireAuth');
const { getSupabaseClient } = require('../db/supabase');
const { generateDoc } = require('../services/docGenerator');
const { uploadToStorage } = require('../services/storageUploader');

const router = express.Router();

function formatIDR(amount) {
  if (!amount) return 'TBD';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', minimumFractionDigits: 0,
  }).format(amount);
}

/** Bentuk ulang row itinerary_submissions jadi shape yang dipakai docGenerator (sama seperti parser.js output) */
function toParsedData(sub) {
  const destinasiArray = Array.isArray(sub.destinasi) ? sub.destinasi : [];
  return {
    nama_klien: sub.nama_klien,
    jumlah_pax: sub.jumlah_pax,
    tipe_tour: sub.tipe_tour,
    durasi: sub.durasi,
    destinasi_text: destinasiArray.length > 0 ? destinasiArray.join(', ') : '(belum diisi)',
    tanggal_mulai: sub.tanggal_mulai,
    tanggal_selesai: sub.tanggal_selesai,
    kendaraan: sub.kendaraan,
    bagasi: sub.bagasi,
    itinerary_harian: sub.itinerary_harian || [],
    catatan_operasional: sub.catatan_operasional || [],
  };
}

/** Bentuk ulang quotation.line_items (service catalog shape) jadi marginResult shape yang dipakai docGenerator */
function toMarginResult(quotation) {
  const line_items = (quotation.line_items || []).map((li) => ({
    item: li.name,
    kota: li.city,
    harga_jual: li.harga_jual,
    harga_jual_formatted: li.harga_jual_formatted,
  }));
  return {
    line_items,
    total_harga: quotation.total_harga,
    total_harga_formatted: quotation.total_harga_formatted,
  };
}

/** Hitung ulang harga_jual per line item dari server — jangan percaya angka dari client */
function recomputeLineItems(rawLineItems) {
  return (rawLineItems || []).map((li) => {
    const qty = Number(li.qty) || 1;
    const unitCost = Number(li.unit_cost) || 0;
    const marginPercent = Number(li.margin_percent) || 0;
    const hargaJual = Math.round(unitCost * qty * (1 + marginPercent / 100));
    return {
      service_id: li.service_id || null,
      name: li.name || '(tanpa nama)',
      city: li.city || '',
      day_no: li.day_no || null,
      qty,
      unit_cost: unitCost,
      margin_percent: marginPercent,
      harga_jual: hargaJual,
      harga_jual_formatted: formatIDR(hargaJual),
      currency: li.currency || 'IDR',
      source: li.source === 'auto' ? 'auto' : 'manual',
    };
  });
}

/** Pastikan sales yang login berhak akses quotation ini (pemilik atau belum ada pemilik) */
async function assertOwnership(supabase, submission, salesId) {
  if (submission.sales_id && submission.sales_id !== salesId) {
    return false;
  }
  // Unassigned — claim otomatis begitu sales pertama kali sentuh (PUT/generate)
  if (!submission.sales_id) {
    await supabase.from('itinerary_submissions').update({ sales_id: salesId }).eq('id', submission.id);
    await supabase.from('quotations').update({ sales_id: salesId }).eq('submission_id', submission.id);
  }
  return true;
}

// ─── GET /api/submissions ────────────────────────────────────────────────────
router.get('/submissions', requireAuth, async (req, res) => {
  const supabase = getSupabaseClient();
  const scope = req.query.scope || 'mine'; // 'mine' | 'unassigned' | 'all'
  const status = req.query.status;

  let query = supabase
    .from('itinerary_submissions')
    .select('id, contact_name, nama_klien, jumlah_pax, durasi, destinasi, sales_id, status, created_at')
    .order('created_at', { ascending: false });

  if (scope === 'mine') query = query.eq('sales_id', req.sales.id);
  else if (scope === 'unassigned') query = query.is('sales_id', null);
  // scope === 'all' — tidak difilter (sales bisa lihat semua antrian)

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return res.status(500).json({ status: 'error', message: error.message });

  return res.json({ status: 'ok', submissions: data });
});

// ─── GET /api/submissions/:id ─────────────────────────────────────────────────
router.get('/submissions/:id', requireAuth, async (req, res) => {
  const supabase = getSupabaseClient();

  const { data: submission, error: subErr } = await supabase
    .from('itinerary_submissions')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (subErr || !submission) {
    return res.status(404).json({ status: 'error', message: 'Submission tidak ditemukan' });
  }
  if (submission.sales_id && submission.sales_id !== req.sales.id) {
    return res.status(403).json({ status: 'error', message: 'Submission ini milik sales lain' });
  }

  const { data: quotation, error: quoErr } = await supabase
    .from('quotations')
    .select('*')
    .eq('submission_id', submission.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (quoErr) return res.status(500).json({ status: 'error', message: quoErr.message });

  return res.json({ status: 'ok', submission, quotation });
});

// ─── PUT /api/quotations/:id ──────────────────────────────────────────────────
router.put('/quotations/:id', requireAuth, async (req, res) => {
  const supabase = getSupabaseClient();

  const { data: quotation, error: quoErr } = await supabase
    .from('quotations')
    .select('*, itinerary_submissions!inner(id, sales_id)')
    .eq('id', req.params.id)
    .single();

  if (quoErr || !quotation) {
    return res.status(404).json({ status: 'error', message: 'Quotation tidak ditemukan' });
  }

  const submission = quotation.itinerary_submissions;
  const allowed = await assertOwnership(supabase, submission, req.sales.id);
  if (!allowed) {
    return res.status(403).json({ status: 'error', message: 'Quotation ini milik sales lain' });
  }

  const line_items = recomputeLineItems(req.body.line_items);
  const total_harga = line_items.reduce((sum, li) => sum + (li.harga_jual || 0), 0);
  const total_harga_formatted = formatIDR(total_harga);

  const { data: updated, error: updateErr } = await supabase
    .from('quotations')
    .update({ line_items, total_harga, total_harga_formatted, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single();

  if (updateErr) return res.status(500).json({ status: 'error', message: updateErr.message });

  return res.json({ status: 'ok', quotation: updated });
});

// ─── POST /api/quotations/:id/generate ────────────────────────────────────────
router.post('/quotations/:id/generate', requireAuth, async (req, res) => {
  const supabase = getSupabaseClient();

  const { data: quotation, error: quoErr } = await supabase
    .from('quotations')
    .select('*, itinerary_submissions!inner(*)')
    .eq('id', req.params.id)
    .single();

  if (quoErr || !quotation) {
    return res.status(404).json({ status: 'error', message: 'Quotation tidak ditemukan' });
  }

  const submission = quotation.itinerary_submissions;
  const allowed = await assertOwnership(supabase, submission, req.sales.id);
  if (!allowed) {
    return res.status(403).json({ status: 'error', message: 'Quotation ini milik sales lain' });
  }

  if (!quotation.line_items || quotation.line_items.length === 0) {
    return res.status(422).json({ status: 'error', message: 'Tidak ada line item — isi/edit dulu sebelum generate' });
  }

  const generate_id = `q_${uuidv4().split('-')[0]}`;
  const parsedData = toParsedData(submission);
  const marginResult = toMarginResult(quotation);

  let docxBuffer;
  try {
    docxBuffer = generateDoc(parsedData, marginResult, generate_id);
  } catch (docErr) {
    console.error('[QUOTATIONS] Gagal generate dokumen:', docErr.message);
    return res.status(500).json({ status: 'error', message: `Gagal generate dokumen: ${docErr.message}` });
  }

  let quotation_docx_url;
  try {
    quotation_docx_url = await uploadToStorage(
      docxBuffer,
      `${generate_id}/${generate_id}_quotation.docx`,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  } catch (uploadErr) {
    console.error('[QUOTATIONS] Gagal upload dokumen:', uploadErr.message);
    return res.status(500).json({ status: 'error', message: `Gagal upload dokumen: ${uploadErr.message}` });
  }

  const generated_at = new Date().toISOString();

  const { data: updatedQuotation, error: updateErr } = await supabase
    .from('quotations')
    .update({ status: 'generated', quotation_docx_url, generated_at, updated_at: generated_at })
    .eq('id', req.params.id)
    .select()
    .single();

  if (updateErr) return res.status(500).json({ status: 'error', message: updateErr.message });

  await supabase
    .from('itinerary_submissions')
    .update({ status: 'processed', quotation_pdf_url: quotation_docx_url })
    .eq('id', submission.id);

  return res.json({ status: 'ok', quotation: updatedQuotation });
});

// ─── GET /api/services-catalog ────────────────────────────────────────────────
router.get('/services-catalog', requireAuth, async (req, res) => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('services_catalog')
    .select('*')
    .eq('is_active', true)
    .order('category', { ascending: true });

  if (error) return res.status(500).json({ status: 'error', message: error.message });

  return res.json({ status: 'ok', services: data });
});

module.exports = router;
