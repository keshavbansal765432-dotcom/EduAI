'use client';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/* ---------- Client data cache (instant navigation) ---------- */
// Cached GET responses are served with zero network time. The cache is wiped the
// moment anything changes (a realtime event from Supabase, or any write we make),
// so it can never show stale data for long.
const TTL = 60_000; // safety net if a realtime event is ever missed
const cache = new Map<string, { t: number; p: Promise<any> }>();

export function invalidate() { cache.clear(); }

export function cget<T = any>(url: string): Promise<T> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < TTL) return hit.p;
  const p = fetch(url).then((r) => r.json());
  cache.set(url, { t: Date.now(), p });
  p.catch(() => cache.delete(url));
  return p;
}

// Any write to /api/* clears the cache *before* the caller's follow-up reload runs.
if (typeof window !== 'undefined' && !(window as any).__liveFetchPatched) {
  (window as any).__liveFetchPatched = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await original(input, init);
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
    if (method !== 'GET' && url.includes('/api/')) invalidate();
    return res;
  };
}

/* ---------- Live change notifications ---------- */
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
export function notifyChanged() {
  invalidate();
  if (timer) return;
  timer = setTimeout(() => { timer = null; listeners.forEach((fn) => fn()); }, 80); // coalesce bursts
}

/** Runs `fn` on mount and again every time the database changes in real time. */
export function useLive(fn: () => unknown) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    ref.current();
    const l = () => ref.current();
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
}

/** Like useLive but does not run on mount - only on later database changes. */
export function useLiveChange(fn: () => unknown) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const l = () => ref.current();
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
}

const TABLES = ['classes', 'students', 'subjects', 'attendance', 'assignments', 'notices', 'timetable', 'syllabus_units', 'classroom_lessons', 'profiles'];
const WARM: Record<string, string[]> = {
  admin: ['/api/admin/classes', '/api/admin/teachers', '/api/admin/students', '/api/admin/subjects', '/api/admin/timetable', '/api/admin/notices'],
  teacher: ['/api/teacher/classes', '/api/teacher/assignments'],
};

/** Mounted once in the admin/teacher layouts: realtime subscription + cache warm-up. */
export function LiveBridge({ role }: { role: 'admin' | 'teacher' }) {
  const path = usePathname();
  const skip = path === '/admin/setup';
  useEffect(() => {
    if (skip) return;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let connected = false, first = true, dead = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (dead || !data.session) return;
      supabase.realtime.setAuth(data.session.access_token);
      channel = supabase.channel('live-' + role);
      TABLES.forEach((table) => channel!.on('postgres_changes', { event: '*', schema: 'public', table }, notifyChanged));
      channel.subscribe((status) => {
        connected = status === 'SUBSCRIBED';
        // After a (re)connect, refresh once in case we missed events while offline.
        if (connected && !first) notifyChanged();
        if (connected) first = false;
      });
    })();

    // Fallback so data still updates if realtime is blocked or not enabled yet.
    poll = setInterval(() => { if (!connected && document.visibilityState === 'visible') notifyChanged(); }, 8000);
    const onVis = () => { if (document.visibilityState === 'visible') notifyChanged(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', notifyChanged);

    // Warm the cache so the first visit to each page is instant.
    const warm = setTimeout(() => WARM[role].forEach((u) => cget(u).catch(() => {})), 200);

    return () => {
      dead = true;
      clearTimeout(warm);
      if (poll) clearInterval(poll);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', notifyChanged);
      if (channel) supabase.removeChannel(channel);
    };
  }, [role, skip]);
  return null;
}
