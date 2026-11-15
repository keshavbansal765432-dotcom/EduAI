import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Shared service-role client (stateless) - no need to rebuild it on every call.
let adminDb: ReturnType<typeof createAdminClient> | null = null;
const getAdminDb = () => (adminDb ??= createAdminClient());

// Tiny in-memory cache of profile role/active flags so back-to-back API calls
// (a page usually fires 2-4 at once) don't each re-query `profiles`.
const PROFILE_TTL_MS = 30_000;
type P = { id: string; full_name: string | null; email: string | null; role: string; active: boolean; school_id: string | null };
const profileCache = new Map<string, { at: number; profile: P | null }>();

async function loadProfile(db: ReturnType<typeof createAdminClient>, id: string): Promise<P | null> {
  const hit = profileCache.get(id);
  if (hit && Date.now() - hit.at < PROFILE_TTL_MS) return hit.profile;
  const { data } = await db.from('profiles').select('id,full_name,email,role,active,school_id').eq('id', id).maybeSingle();
  profileCache.set(id, { at: Date.now(), profile: (data as P) ?? null });
  if (profileCache.size > 500) profileCache.delete(profileCache.keys().next().value as string);
  return (data as P) ?? null;
}

export async function requireApiRole(role: 'admin' | 'teacher') {
  const supabase = await createClient();
  // getClaims() verifies the JWT signature locally instead of calling Supabase Auth each time.
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub as string | undefined;
  if (!sub) return { error: 'Unauthorized', status: 401 as const };
  const db = getAdminDb();
  const profile = await loadProfile(db, sub);
  if (!profile?.active || profile.role !== role) return { error: 'Forbidden', status: 403 as const };
  if (!profile.school_id) return { error: 'Your account is not linked to a school.', status: 403 as const };
  return { sid: profile.school_id, user: { id: sub, email: (data?.claims?.email as string | undefined) ?? null }, profile, db };
}

export async function requireAdminApi() { return requireApiRole('admin'); }
export async function requireTeacherApi() { return requireApiRole('teacher'); }

/* ---- School isolation helpers: stop one school from pointing at another school's records ---- */
type Ctx = { db: ReturnType<typeof createAdminClient>; sid: string };
export async function inSchool(a: Ctx, table: 'classes' | 'subjects', id?: string | null) {
  if (!id) return true; // optional reference left empty
  const { data } = await a.db.from(table).select('id').eq('id', id).eq('school_id', a.sid).maybeSingle();
  return !!data;
}
export async function teacherInSchool(a: Ctx, id?: string | null) {
  if (!id) return true;
  const { data } = await a.db.from('profiles').select('id').eq('id', id).eq('school_id', a.sid).eq('role', 'teacher').maybeSingle();
  return !!data;
}
