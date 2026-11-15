import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole, inSchool } from '@/lib/api-auth';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const requestedRole = req.headers.get('x-school-role');
  if (requestedRole !== 'admin' && requestedRole !== 'teacher') return NextResponse.json({ error: 'Missing role context.' }, { status: 400 });
  const auth = await requireApiRole(requestedRole);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let query = auth.db.from('syllabus_units').select('id,class_id,subject_id,unit_title,details,created_at,class:classes(id,name,section),subject:subjects(id,name)').eq('school_id', auth.sid).order('created_at', { ascending: false });
  const classId = req.nextUrl.searchParams.get('class_id');
  const subjectId = req.nextUrl.searchParams.get('subject_id');
  if (classId) query = query.eq('class_id', classId);
  if (subjectId) query = query.eq('subject_id', subjectId);
  if (requestedRole === 'teacher') {
    const { data: owned } = await auth.db.from('classes').select('id').eq('teacher_id', auth.user.id).eq('school_id', auth.sid);
    const ids = (owned || []).map((row) => row.id);
    if (!ids.length) return NextResponse.json({ items: [] });
    query = query.in('class_id', ids);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data || [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiRole('admin');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await req.json();
    const class_id = String(body.class_id || '');
    const subject_id = String(body.subject_id || '');
    const unit_title = String(body.unit_title || '').trim();
    const details = String(body.details || '').trim();
    if (!class_id || !subject_id || !unit_title) return NextResponse.json({ error: 'Class, subject and unit title are required.' }, { status: 400 });
    if (!(await inSchool(auth, 'classes', class_id))) return NextResponse.json({ error: 'Class not found in your school.' }, { status: 400 });
    const { data: subject } = await auth.db.from('subjects').select('id').eq('id', subject_id).eq('class_id', class_id).eq('school_id', auth.sid).maybeSingle();
    if (!subject) return NextResponse.json({ error: 'Select a subject that belongs to the selected class.' }, { status: 400 });
    const { data, error } = await auth.db.from('syllabus_units').insert({ school_id: auth.sid, class_id, subject_id, unit_title, details, created_by: auth.user.id }).select('id,class_id,subject_id,unit_title,details,created_at').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ item: data });
  } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireApiRole('admin');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing syllabus unit id.' }, { status: 400 });
  const { error } = await auth.db.from('syllabus_units').delete().eq('id', id).eq('school_id', auth.sid);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
