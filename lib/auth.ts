import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
export type Role = "admin" | "teacher";

/**
 * Per-request memoised. Uses getClaims() which verifies the JWT locally
 * (no round trip to Supabase Auth when asymmetric signing keys are used),
 * and `cache()` so layouts/pages/components in the same request share one lookup.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id,full_name,email,role,avatar_url,active,school_id")
    .eq("id", claims.sub)
    .maybeSingle();
  return { user: { id: claims.sub as string, email: (claims.email as string | undefined) ?? null }, profile };
});

export async function requireRole(role: Role) {
  const current = await getCurrentUser();
  if (!current?.user || !current.profile?.active) redirect("/login");
  if (current.profile.role !== role) redirect(current.profile.role === "admin" ? "/admin" : "/teacher");
  return current;
}
