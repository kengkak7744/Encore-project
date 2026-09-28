'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export function useData<T>(path: string, refreshMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let current = true;
    setLoading(true);
    const load = () => api<T>(path).then((value) => { if (current) { setData(value); setError(''); } }).catch((err) => { if (current) setError(err.message); }).finally(() => { if (current) setLoading(false); });
    void load();
    const timer = refreshMs > 0 ? setInterval(() => { if (document.visibilityState === 'visible') void load(); }, refreshMs) : null;
    return () => { current = false; if (timer) clearInterval(timer); };
  }, [path, refreshMs]);
  return { data, error, loading, reload: () => api<T>(path).then(setData) };
}
