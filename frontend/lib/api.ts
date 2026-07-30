import { supabase } from './supabase';

async function apiFetch(path: string, options: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const body = await res.json();
  if (!res.ok) throw new Error(body.message || `Request gagal: ${res.status}`);
  return body;
}

export type ItineraryDay = {
  day_no: string;
  day_label: string;
  kota: string;
  judul: string;
  activities: string[];
};

export type Submission = {
  id: string;
  contact_name: string;
  nama_klien: string;
  jumlah_pax: string;
  tipe_tour: string;
  durasi: string;
  destinasi: string[];
  tanggal_mulai: string;
  tanggal_selesai: string;
  kendaraan: string;
  bagasi: string;
  itinerary_harian: ItineraryDay[];
  catatan_operasional: string[];
  sales_id: string | null;
  status: string;
  created_at: string;
};

export type LineItem = {
  service_id: string | null;
  name: string;
  city: string;
  day_no: string | null;
  qty: number;
  unit_cost: number;
  margin_percent: number;
  harga_jual: number;
  harga_jual_formatted: string;
  currency: string;
  source: 'auto' | 'manual';
};

export type Quotation = {
  id: string;
  submission_id: string;
  sales_id: string | null;
  status: string;
  line_items: LineItem[];
  total_harga: number;
  total_harga_formatted: string;
  quotation_docx_url: string | null;
};

export type ServiceCatalogItem = {
  id: string;
  name: string;
  category: string;
  city: string | null;
  unit_cost: number;
  margin_percent: number;
  unit_type: string;
  currency: string;
};

export const api = {
  listSubmissions: (scope: 'mine' | 'unassigned' | 'all' = 'mine') =>
    apiFetch(`/api/submissions?scope=${scope}`) as Promise<{ submissions: Submission[] }>,
  getSubmission: (id: string) =>
    apiFetch(`/api/submissions/${id}`) as Promise<{ submission: Submission; quotation: Quotation | null }>,
  updateQuotation: (id: string, line_items: LineItem[]) =>
    apiFetch(`/api/quotations/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ line_items }),
    }) as Promise<{ quotation: Quotation }>,
  generateQuotation: (id: string) =>
    apiFetch(`/api/quotations/${id}/generate`, { method: 'POST' }) as Promise<{ quotation: Quotation }>,
  listCatalog: () => apiFetch('/api/services-catalog') as Promise<{ services: ServiceCatalogItem[] }>,
};
