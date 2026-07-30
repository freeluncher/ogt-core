'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { api, Submission } from '@/lib/api';

const STATUS_LABEL: Record<string, string> = {
  received: 'Diterima',
  pending_review: 'Perlu Direview',
  processed: 'Sudah Digenerate',
  failed: 'Gagal Parse',
};

const STATUS_COLOR: Record<string, string> = {
  received: 'bg-neutral-100 text-neutral-700',
  pending_review: 'bg-amber-100 text-amber-800',
  processed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

export default function SubmissionsPage() {
  const router = useRouter();
  const [scope, setScope] = useState<'mine' | 'unassigned' | 'all'>('mine');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace('/login');
    });
  }, [router]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .listSubmissions(scope)
      .then((res) => setSubmissions(res.submissions))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [scope]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-brand">Submission Itinerary</h1>
        <button onClick={handleLogout} className="text-sm text-neutral-500 hover:underline">
          Logout
        </button>
      </div>

      <div className="mb-4 flex gap-2">
        {(['mine', 'unassigned', 'all'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            className={`rounded px-3 py-1.5 text-sm ${
              scope === s ? 'bg-brand text-white' : 'bg-white text-neutral-600 border border-neutral-300'
            }`}
          >
            {s === 'mine' ? 'Punya Saya' : s === 'unassigned' ? 'Belum Ada Sales' : 'Semua'}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-neutral-500">Memuat...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && submissions.length === 0 && (
        <p className="text-sm text-neutral-500">Belum ada submission.</p>
      )}

      <div className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
        {submissions.map((s) => (
          <Link
            key={s.id}
            href={`/submissions/${s.id}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50"
          >
            <div>
              <p className="font-medium">{s.nama_klien}</p>
              <p className="text-sm text-neutral-500">
                {s.jumlah_pax} · {s.durasi} · {Array.isArray(s.destinasi) ? s.destinasi.join(', ') : ''}
              </p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLOR[s.status] || 'bg-neutral-100 text-neutral-700'}`}>
              {STATUS_LABEL[s.status] || s.status}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
