'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, sessionEvent } from '../lib/api';

export function useData<T>(path: string, refreshMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const value = await api<T>(path);
      if (request===sequence.current) { setData(value); setError(''); }
    } catch (err) {
      if (request===sequence.current) setError((err as Error).message);
    } finally { if (request===sequence.current) setLoading(false); }
  },[path]);
  useEffect(() => {
    setData(null); setError(''); setLoading(true);
    void load();
    const invalidate = () => { setData(null); setError(''); setLoading(true); void load(); };
    const focus = () => { if (document.visibilityState==='visible') void load(); };
    const interval = refreshMs || (path==='/me' ? 60_000 : 0);
    const timer = interval > 0 ? setInterval(focus,interval) : null;
    window.addEventListener(sessionEvent,invalidate);
    window.addEventListener('focus',focus);
    document.addEventListener('visibilitychange',focus);
    return () => {
      sequence.current++;
      if (timer) clearInterval(timer);
      window.removeEventListener(sessionEvent,invalidate);
      window.removeEventListener('focus',focus);
      document.removeEventListener('visibilitychange',focus);
    };
  }, [path,refreshMs,load]);
  return { data, error, loading, reload: load };
}

export function useSessionReset(reset: () => void) {
  const latest = useRef(reset); latest.current = reset;
  useEffect(() => {
    const changed = () => latest.current();
    window.addEventListener(sessionEvent,changed);
    return () => window.removeEventListener(sessionEvent,changed);
  },[]);
}
