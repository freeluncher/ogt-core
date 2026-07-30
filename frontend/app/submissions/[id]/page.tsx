'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { api, Submission, Quotation, LineItem, ServiceCatalogItem } from '@/lib/api';

function previewTotal(items: LineItem[]) {
  return items.reduce((sum, it) => {
    const qty = Number(it.qty) || 0;
    const unitCost = Number(it.unit_cost) || 0;
    const margin = Number(it.margin_percent) || 0;
    return sum + Math.round(unitCost * qty * (1 + margin / 100));
  }, 0);
}

function formatIDR(amount: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
}

/** Baris line item + index aslinya di array `lineItems` (dipakai buat update/hapus tanpa salah target) */
type IndexedItem = { item: LineItem; index: number };

export default function QuotationBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [catalog, setCatalog] = useState<ServiceCatalogItem[]>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [addServiceByGroup, setAddServiceByGroup] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace('/login');
    });
  }, [router]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([api.getSubmission(id), api.listCatalog()])
      .then(([subRes, catRes]) => {
        setSubmission(subRes.submission);
        setQuotation(subRes.quotation);
        setLineItems(subRes.quotation?.line_items || []);
        setCatalog(catRes.services);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  function updateItem(index: number, patch: Partial<LineItem>) {
    setLineItems((items) => items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function removeItem(index: number) {
    setLineItems((items) => items.filter((_, i) => i !== index));
  }

  /** groupKey: day_no asli (string) buat tambah service ke hari tertentu, atau 'general' buat service tanpa hari spesifik */
  function addItem(groupKey: string, dayNo: string | null, city: string) {
    const serviceId = addServiceByGroup[groupKey];
    const service = catalog.find((c) => c.id === serviceId);
    if (!service) return;
    setLineItems((items) => [
      ...items,
      {
        service_id: service.id,
        name: service.name,
        city: service.city || city || '',
        day_no: dayNo,
        qty: 1,
        unit_cost: service.unit_cost,
        margin_percent: service.margin_percent,
        harga_jual: 0,
        harga_jual_formatted: '',
        currency: service.currency,
        source: 'manual',
      },
    ]);
    setAddServiceByGroup((prev) => ({ ...prev, [groupKey]: '' }));
  }

  async function handleSave() {
    if (!quotation) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.updateQuotation(quotation.id, lineItems);
      setQuotation(res.quotation);
      setLineItems(res.quotation.line_items);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerate() {
    if (!quotation) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await api.generateQuotation(quotation.id);
      setQuotation(res.quotation);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <p className="p-6 text-sm text-neutral-500">Memuat...</p>;
  if (error && !submission) return <p className="p-6 text-sm text-red-600">{error}</p>;
  if (!submission) return null;

  const days = submission.itinerary_harian || [];
  const dayNosInItinerary = new Set(days.map((d) => d.day_no));

  // Item tanpa day_no, ATAU day_no yang gak ketemu di itinerary (data lama/edge case) — masuk grup umum
  const generalItems: IndexedItem[] = lineItems
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !item.day_no || !dayNosInItinerary.has(item.day_no));

  function itemsForDay(dayNo: string): IndexedItem[] {
    return lineItems.map((item, index) => ({ item, index })).filter(({ item }) => item.day_no === dayNo);
  }

  function LineItemTable({ rows, groupKey, dayNo, city }: { rows: IndexedItem[]; groupKey: string; dayNo: string | null; city: string }) {
    const cityCatalog = catalog.filter((c) => !c.city || c.city.toLowerCase() === city.toLowerCase() || c.city.toLowerCase() === 'umum');
    const relevantCatalog = cityCatalog.length > 0 ? cityCatalog : catalog;

    return (
      <div className="mt-3">
        {rows.length > 0 && (
          <div className="overflow-x-auto rounded border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-neutral-500">
                <tr>
                  <th className="px-3 py-1.5">Service</th>
                  <th className="px-3 py-1.5">Qty</th>
                  <th className="px-3 py-1.5">Cost</th>
                  <th className="px-3 py-1.5">Margin %</th>
                  <th className="px-3 py-1.5">Harga Jual</th>
                  <th className="px-3 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ item, index }) => (
                  <tr key={index} className="border-t border-neutral-100">
                    <td className="px-3 py-1.5">
                      {item.name}
                      {item.source === 'auto' && (
                        <span className="ml-1 rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600">auto</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="number"
                        min={1}
                        value={item.qty}
                        onChange={(e) => updateItem(index, { qty: Number(e.target.value) })}
                        className="w-16 rounded border border-neutral-300 px-2 py-1"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="number"
                        min={0}
                        value={item.unit_cost}
                        onChange={(e) => updateItem(index, { unit_cost: Number(e.target.value) })}
                        className="w-28 rounded border border-neutral-300 px-2 py-1"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="number"
                        min={0}
                        value={item.margin_percent}
                        onChange={(e) => updateItem(index, { margin_percent: Number(e.target.value) })}
                        className="w-16 rounded border border-neutral-300 px-2 py-1"
                      />
                    </td>
                    <td className="px-3 py-1.5 font-medium">{item.harga_jual_formatted || item.harga_jual || '—'}</td>
                    <td className="px-3 py-1.5">
                      <button onClick={() => removeItem(index)} className="text-red-500 hover:underline">
                        Hapus
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-2 flex items-center gap-2">
          <select
            value={addServiceByGroup[groupKey] || ''}
            onChange={(e) => setAddServiceByGroup((prev) => ({ ...prev, [groupKey]: e.target.value }))}
            className="rounded border border-neutral-300 px-2 py-1 text-xs"
          >
            <option value="">+ Tambah service...</option>
            {relevantCatalog.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.city || 'Umum'} ({c.category})
              </option>
            ))}
          </select>
          <button
            onClick={() => addItem(groupKey, dayNo, city)}
            disabled={!addServiceByGroup[groupKey]}
            className="rounded border border-neutral-300 px-2 py-1 text-xs disabled:opacity-40"
          >
            Tambah
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <button onClick={() => router.push('/submissions')} className="mb-4 text-sm text-neutral-500 hover:underline">
        ← Kembali
      </button>

      <h1 className="text-lg font-semibold text-brand">{submission.nama_klien}</h1>
      <p className="mb-6 text-sm text-neutral-500">
        {submission.jumlah_pax} · {submission.durasi} · {submission.destinasi?.join(', ')}
      </p>

      {/* ── Itinerary + line item per hari ──────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Itinerary & Quotation per Hari
        </h2>
        <div className="space-y-3">
          {days.map((day) => (
            <div key={day.day_no} className="rounded-lg border border-neutral-200 bg-white p-4">
              <p className="font-medium">
                Hari {day.day_no} — {day.judul} <span className="text-neutral-400">({day.kota})</span>
              </p>
              <ul className="mt-1 list-inside list-disc text-sm text-neutral-600">
                {day.activities?.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>

              <LineItemTable rows={itemsForDay(day.day_no)} groupKey={day.day_no} dayNo={day.day_no} city={day.kota} />
            </div>
          ))}
        </div>
      </section>

      {/* ── Service umum — gak terikat hari spesifik ────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Service Umum ({generalItems.length})
        </h2>
        <p className="mb-2 text-xs text-neutral-400">Service yang gak terikat 1 hari spesifik (mis. berlaku sepanjang trip).</p>
        <LineItemTable rows={generalItems} groupKey="general" dayNo={null} city={submission.destinasi?.[0] || 'Umum'} />
      </section>

      <p className="mb-4 text-right text-lg font-semibold">
        Total (preview): {formatIDR(previewTotal(lineItems))}
      </p>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded border border-brand px-4 py-2 text-sm font-medium text-brand disabled:opacity-50"
        >
          {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
        </button>
        <button
          onClick={handleGenerate}
          disabled={generating || lineItems.length === 0}
          className="rounded bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {generating ? 'Generate...' : 'Generate Quotation'}
        </button>

        {quotation?.status === 'generated' && quotation.quotation_docx_url && (
          <a
            href={quotation.quotation_docx_url}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-green-700 hover:underline"
          >
            Download hasil ↗
          </a>
        )}
      </div>
    </div>
  );
}
