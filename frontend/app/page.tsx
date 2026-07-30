'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      router.replace(data.session ? '/submissions' : '/login');
    });
  }, [router]);

  return <div className="p-6 text-sm text-neutral-500">Memuat...</div>;
}
