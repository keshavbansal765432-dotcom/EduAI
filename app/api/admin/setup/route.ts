import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Open registration: any new school can create itself plus its first admin.
// Each school's data is isolated by school_id, so schools never see each other.

// Light abuse protection: max 5 registrations per IP per hour (per server instance).
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now(), win = 60 * 60 * 1000;
  const list = (hits.get(ip) || []).filter((t) => now - t < win);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 2000) hits.delete(hits.keys().next().value as string);
  return list.length > 5;
}

export async function GET() {
  return NextResponse.json({ setupOpen: true });
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (limited(ip)) return NextResponse.json({ error: "Too many registrations from this network. Please try again later." }, { status: 429 });

  let userId: string | null = null;
  let schoolId: string | null = null;
  const db = (() => { try { return createAdminClient(); } catch { return null; } })();
  try {
    if (!db) throw new Error("env");
    const body = await request.json();
    const schoolName = String(body.schoolName || "").trim();
    const fullName = String(body.fullName || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!schoolName || !fullName || !email || !password) {
      return NextResponse.json({ error: "School name, your name, email and password are required." }, { status: 400 });
    }
    if (schoolName.length > 120 || fullName.length > 120) {
      return NextResponse.json({ error: "Name is too long." }, { status: 400 });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must contain at least 8 characters." }, { status: 400 });
    }

    const { data: school, error: schoolError } = await db.from("schools").insert({ name: schoolName }).select("id").single();
    if (schoolError || !school) {
      console.error(schoolError);
      return NextResponse.json({ error: "Could not create the school. Run db/schema.sql (multi-school section) in Supabase first." }, { status: 500 });
    }
    schoolId = school.id;

    const { data, error } = await db.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: fullName },
    });
    if (error || !data.user) {
      await db.from("schools").delete().eq("id", schoolId);
      const taken = /already|registered|exists/i.test(error?.message || "");
      return NextResponse.json({ error: taken ? "That email is already registered. Use a different email or log in." : error?.message || "Admin account could not be created." }, { status: taken ? 409 : 400 });
    }
    userId = data.user.id;

    const { error: profileError } = await db.from("profiles").upsert({
      id: userId, full_name: fullName, email, role: "admin", active: true, school_id: schoolId,
    });
    if (profileError) throw profileError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    if (db) {
      if (userId) await db.auth.admin.deleteUser(userId).catch(() => {});
      if (schoolId) await db.from("schools").delete().eq("id", schoolId);
    }
    return NextResponse.json({ error: "Registration failed. Check your Supabase values in .env.local and that the database migration has been run." }, { status: 500 });
  }
}
