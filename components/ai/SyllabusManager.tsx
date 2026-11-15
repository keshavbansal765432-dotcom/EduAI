'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLiveChange } from '@/lib/live';
import {
  BookOpen, CheckCircle2, ChevronDown, ClipboardList, Plus, Search,
  Trash2, BookMarked, Layers3, GraduationCap, RefreshCw,
} from 'lucide-react';

type ClassRow = { id: string; name: string; section?: string | null };
type SubjectRow = { id: string; name: string; class_id: string };
type Unit = {
  id: string;
  class_id: string;
  subject_id: string;
  unit_title: string;
  details: string | null;
  created_at?: string;
};

async function readJson(response: Response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; }
  catch { throw new Error(`The server returned an invalid response (HTTP ${response.status}).`); }
}

export default function SyllabusManager() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [items, setItems] = useState<Unit[]>([]);
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [deletingId, setDeletingId] = useState('');

  const availableSubjects = useMemo(
    () => subjects.filter((subject) => subject.class_id === classId),
    [subjects, classId],
  );
  const classLabel = useCallback((id: string) => {
    const item = classes.find((row) => row.id === id);
    return item ? `${item.name}${item.section ? ` · ${item.section}` : ''}` : 'Unknown class';
  }, [classes]);
  const subjectLabel = useCallback((id: string) => subjects.find((row) => row.id === id)?.name || 'Unknown subject', [subjects]);

  const loadUnits = useCallback(async (quiet = false) => {
    if (!quiet) setLoadingUnits(true);
    try {
      const response = await fetch('/api/syllabus', {
        cache: 'no-store',
        headers: { 'x-school-role': 'admin' },
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || 'Could not load syllabus units.');
      setItems(Array.isArray(data.items) ? data.items : []);
    } finally {
      if (!quiet) setLoadingUnits(false);
    }
  }, []);

  useLiveChange(() => { void loadUnits(true).catch(() => {}); });

  useEffect(() => {
    let active = true;
    async function loadSchoolData() {
      setLoading(true);
      setError('');
      try {
        const [classResponse, subjectResponse] = await Promise.all([
          fetch('/api/admin/classes', { cache: 'no-store' }),
          fetch('/api/admin/subjects', { cache: 'no-store' }),
        ]);
        const [classData, subjectData] = await Promise.all([readJson(classResponse), readJson(subjectResponse)]);
        if (!classResponse.ok) throw new Error(classData.error || 'Could not load school classes.');
        if (!subjectResponse.ok) throw new Error(subjectData.error || 'Could not load school subjects.');
        if (!active) return;
        const nextClasses: ClassRow[] = Array.isArray(classData.data) ? classData.data : [];
        const nextSubjects: SubjectRow[] = Array.isArray(subjectData.data) ? subjectData.data : [];
        setClasses(nextClasses);
        setSubjects(nextSubjects);
        setClassId(nextClasses[0]?.id || '');
        await loadUnits();
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load syllabus data.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadSchoolData();
    return () => { active = false; };
  }, [loadUnits]);

  useEffect(() => {
    if (!availableSubjects.some((subject) => subject.id === subjectId)) {
      setSubjectId(availableSubjects[0]?.id || '');
    }
  }, [availableSubjects, subjectId]);

  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((unit) =>
      `${unit.unit_title} ${unit.details || ''} ${classLabel(unit.class_id)} ${subjectLabel(unit.subject_id)}`
        .toLowerCase().includes(term),
    );
  }, [items, search, classLabel, subjectLabel]);

  async function addUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/syllabus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-school-role': 'admin' },
        body: JSON.stringify({ class_id: classId, subject_id: subjectId, unit_title: title.trim(), details: details.trim() }),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || 'Could not save syllabus unit.');
      setTitle('');
      setDetails('');
      await loadUnits();
      setSuccess('Syllabus unit added. Teachers can now select it in AI Studio.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save syllabus unit.');
    } finally {
      setBusy(false);
    }
  }

  async function removeUnit(id: string) {
    if (!window.confirm('Delete this syllabus unit? Teachers will no longer be able to select it.')) return;
    setDeletingId(id);
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`/api/syllabus?id=${encodeURIComponent(id)}`, {
        method: 'DELETE', headers: { 'x-school-role': 'admin' },
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || 'Could not delete syllabus unit.');
      setItems((current) => current.filter((unit) => unit.id !== id));
      setSuccess('Syllabus unit deleted.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete syllabus unit.');
    } finally {
      setDeletingId('');
    }
  }

  return (
    <div className="content syllabus-page">
      <div className="syllabus-hero">
        <div className="syllabus-hero-copy">
          <span className="syllabus-eyebrow"><BookMarked size={14} /> CURRICULUM MANAGEMENT</span>
          <h1>School syllabus</h1>
          <p>Organise chapters and learning outcomes by the classes and subjects already created in your school.</p>
        </div>
        <div className="syllabus-hero-art"><BookOpen size={34} /><span>Plan · Teach · Learn</span></div>
      </div>

      <div className="syllabus-stats">
        <div className="syllabus-stat"><span className="syllabus-stat-icon"><GraduationCap size={18} /></span><div><strong>{classes.length}</strong><small>School classes</small></div></div>
        <div className="syllabus-stat"><span className="syllabus-stat-icon"><Layers3 size={18} /></span><div><strong>{subjects.length}</strong><small>Class subjects</small></div></div>
        <div className="syllabus-stat"><span className="syllabus-stat-icon"><ClipboardList size={18} /></span><div><strong>{items.length}</strong><small>Syllabus units</small></div></div>
      </div>

      {error && <div className="syllabus-alert error" role="alert">{error}</div>}
      {success && <div className="syllabus-alert success" role="status"><CheckCircle2 size={16} />{success}</div>}

      <div className="syllabus-layout">
        <section className="card syllabus-form-card">
          <div className="syllabus-card-heading"><span className="syllabus-heading-icon"><Plus size={18} /></span><div><h2>Add syllabus unit</h2><p>Add a chapter, topic or learning outcome for a class subject.</p></div></div>
          {loading ? <div className="syllabus-loading">Loading your school classes and subjects…</div> : !classes.length ? (
            <div className="syllabus-empty-inline"><GraduationCap size={24} /><strong>No classes found</strong><span>Create a class first, then add subjects before building the syllabus.</span></div>
          ) : (
            <form onSubmit={addUnit} className="syllabus-form">
              <label>Class <span>*</span><div className="syllabus-select-wrap"><select value={classId} onChange={(event) => setClassId(event.target.value)} required><option value="">Select class</option>{classes.map((item) => <option key={item.id} value={item.id}>{classLabel(item.id)}</option>)}</select><ChevronDown size={16} /></div></label>
              <label>Subject <span>*</span><div className="syllabus-select-wrap"><select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} disabled={!availableSubjects.length} required><option value="">{availableSubjects.length ? 'Select subject' : 'No subjects for this class'}</option>{availableSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select><ChevronDown size={16} /></div></label>
              {!availableSubjects.length && <p className="syllabus-field-hint">There are no subjects assigned to this class yet. Add a subject in the Subjects section first.</p>}
              <label>Chapter / Unit title <span>*</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="e.g. Fractions and Decimals" required /></label>
              <label>Topics & learning outcomes <small>Optional</small><textarea value={details} onChange={(event) => setDetails(event.target.value)} rows={5} maxLength={5000} placeholder={'Add the topics covered in this unit, key concepts and what students should learn…'} /></label>
              <div className="syllabus-form-footer"><span>{details.length}/5000 characters</span><button className="btn syllabus-add-btn" type="submit" disabled={busy || !classId || !subjectId || !title.trim()}>{busy ? <><RefreshCw size={15} className="syllabus-spin" /> Saving…</> : <><Plus size={16} /> Add syllabus unit</>}</button></div>
            </form>
          )}
          <div className="syllabus-tip"><BookOpen size={16} /><p><strong>Teacher access</strong><br />Units added here appear automatically in the matching teacher's AI Studio after they select the same class and subject.</p></div>
        </section>

        <section className="card syllabus-list-card">
          <div className="syllabus-list-heading"><div><h2>Added syllabus units</h2><p>{items.length} {items.length === 1 ? 'unit' : 'units'} across your school</p></div><button className="syllabus-refresh" type="button" onClick={() => { setError(''); void loadUnits().catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not refresh syllabus.')); }} aria-label="Refresh syllabus"><RefreshCw size={16} /></button></div>
          <div className="syllabus-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search chapters, classes or subjects…" /></div>
          {loadingUnits ? <div className="syllabus-loading">Loading syllabus units…</div> : !items.length ? (
            <div className="syllabus-empty"><span><BookMarked size={27} /></span><strong>Your syllabus starts here</strong><p>Add your first syllabus unit using the form. It will be available to teachers for AI-generated classroom materials.</p></div>
          ) : !visibleItems.length ? (
            <div className="syllabus-empty"><span><Search size={25} /></span><strong>No matching units</strong><p>Try another chapter, class or subject name.</p></div>
          ) : (
            <div className="syllabus-unit-list">{visibleItems.map((unit) => (
              <article className="syllabus-unit" key={unit.id}>
                <div className="syllabus-unit-mark"><BookOpen size={18} /></div>
                <div className="syllabus-unit-body"><h3>{unit.unit_title}</h3><div className="syllabus-unit-meta"><span>{classLabel(unit.class_id)}</span><i /> <span>{subjectLabel(unit.subject_id)}</span></div>{unit.details && <p>{unit.details}</p>}</div>
                <button className="syllabus-delete" type="button" onClick={() => void removeUnit(unit.id)} disabled={deletingId === unit.id} aria-label={`Delete ${unit.unit_title}`} title="Delete unit">{deletingId === unit.id ? <RefreshCw size={16} className="syllabus-spin" /> : <Trash2 size={16} />}</button>
              </article>
            ))}</div>
          )}
        </section>
      </div>

      <style jsx>{`
        .syllabus-page{max-width:1500px;padding-top:28px}.syllabus-hero{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:27px 30px;border:1px solid #dce9de;border-radius:18px;background:linear-gradient(115deg,#f0f7f1 0%,#fbfdfb 65%,#e7f1e8 100%);margin-bottom:16px}.syllabus-eyebrow{display:flex;align-items:center;gap:7px;color:#47775b;font-size:10px;font-weight:900;letter-spacing:.13em}.syllabus-hero h1{font-size:29px;margin:9px 0 7px;color:#183322}.syllabus-hero p{font-size:13px;line-height:1.6;color:#66756a;margin:0;max-width:650px}.syllabus-hero-art{width:145px;height:105px;border-radius:16px;background:#e0eee2;color:#47775b;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;flex:none}.syllabus-hero-art span{font-size:10px;font-weight:800;letter-spacing:.04em}.syllabus-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:17px}.syllabus-stat{background:#fff;border:1px solid #e2e9e2;border-radius:13px;padding:14px 16px;display:flex;align-items:center;gap:12px}.syllabus-stat-icon,.syllabus-heading-icon,.syllabus-unit-mark{width:39px;height:39px;border-radius:11px;background:#edf4ee;color:#47775b;display:grid;place-items:center;flex:none}.syllabus-stat strong{display:block;font-size:21px;color:#1b3021}.syllabus-stat small{display:block;color:#78847b;font-size:11px;margin-top:2px}.syllabus-alert{display:flex;align-items:center;gap:8px;padding:11px 13px;border-radius:10px;font-size:12px;margin:0 0 14px}.syllabus-alert.error{background:#fff3f2;border:1px solid #f2d3d0;color:#a32929}.syllabus-alert.success{background:#eff8f0;border:1px solid #d7ead9;color:#326344}.syllabus-layout{display:grid;grid-template-columns:minmax(310px,.82fr) minmax(0,1.35fr);gap:16px;align-items:start}.syllabus-form-card,.syllabus-list-card{padding:21px;border-radius:16px;min-width:0}.syllabus-card-heading{display:flex;align-items:center;gap:11px;margin-bottom:20px}.syllabus-card-heading h2,.syllabus-list-heading h2{font-size:16px;color:#1b3021;margin:0 0 4px}.syllabus-card-heading p,.syllabus-list-heading p{font-size:11px;color:#77847a;margin:0;line-height:1.5}.syllabus-form{display:grid;gap:14px}.syllabus-form label{display:grid;gap:7px;font-size:11px;font-weight:800;color:#405347}.syllabus-form label>span{display:inline;color:#b24d43}.syllabus-form label small{font-weight:500;color:#89948c}.syllabus-form input,.syllabus-form textarea,.syllabus-select-wrap select{width:100%;border:1px solid #dce5dd;border-radius:9px;background:#fff;color:#213328;padding:11px 12px;font-size:12px;outline:none;min-width:0}.syllabus-form textarea{resize:vertical;line-height:1.6}.syllabus-form input:focus,.syllabus-form textarea:focus,.syllabus-select-wrap select:focus{border-color:#6d9878;box-shadow:0 0 0 3px #47775b18}.syllabus-select-wrap{position:relative}.syllabus-select-wrap select{appearance:none;padding-right:34px}.syllabus-select-wrap>svg{position:absolute;right:11px;top:50%;transform:translateY(-50%);color:#77847a;pointer-events:none}.syllabus-select-wrap select:disabled{background:#f4f6f4;color:#98a199}.syllabus-field-hint{font-size:11px;color:#856a2a;background:#fff8e8;border:1px solid #f1e6c8;border-radius:8px;padding:9px 10px;margin:-7px 0 0;line-height:1.5}.syllabus-form-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:3px}.syllabus-form-footer>span{font-size:10px;color:#8a958d}.syllabus-add-btn{min-height:39px;white-space:nowrap}.syllabus-add-btn:disabled{opacity:.5;cursor:not-allowed}.syllabus-tip{display:flex;gap:10px;padding:12px;background:#f1f6f1;border:1px solid #e2ece3;border-radius:10px;margin-top:18px;color:#47775b}.syllabus-tip p{font-size:10px;line-height:1.55;color:#65746a;margin:0}.syllabus-tip strong{color:#345d40;font-size:11px}.syllabus-list-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.syllabus-refresh{width:34px;height:34px;display:grid;place-items:center;border:1px solid #e0e8e1;border-radius:9px;background:#fff;color:#587361;cursor:pointer}.syllabus-refresh:hover{background:#f0f6f1}.syllabus-search{display:flex;align-items:center;gap:9px;border:1px solid #e0e8e1;border-radius:10px;padding:0 11px;height:40px;margin:17px 0 12px;color:#829087}.syllabus-search input{border:0;outline:0;min-width:0;flex:1;font-size:11px;color:#26372b;background:transparent}.syllabus-unit-list{display:grid;gap:9px}.syllabus-unit{display:flex;align-items:flex-start;gap:11px;padding:13px;border:1px solid #e5ebe5;border-radius:12px;background:#fff;min-width:0}.syllabus-unit-mark{width:34px;height:34px;border-radius:9px}.syllabus-unit-body{flex:1;min-width:0}.syllabus-unit-body h3{font-size:13px;color:#203327;margin:1px 0 6px;overflow-wrap:anywhere}.syllabus-unit-meta{display:flex;align-items:center;gap:7px;flex-wrap:wrap;color:#718075;font-size:10px}.syllabus-unit-meta i{width:3px;height:3px;border-radius:50%;background:#9ca99f}.syllabus-unit-body p{font-size:11px;line-height:1.6;color:#68756c;margin:9px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}.syllabus-delete{width:32px;height:32px;border:1px solid #f0e0df;background:#fff8f7;color:#a65a54;border-radius:8px;display:grid;place-items:center;cursor:pointer;flex:none}.syllabus-delete:hover{background:#fff0ef}.syllabus-delete:disabled{opacity:.5}.syllabus-empty,.syllabus-empty-inline{display:flex;flex-direction:column;align-items:center;text-align:center;padding:35px 18px;color:#748177}.syllabus-empty>span{width:52px;height:52px;border-radius:16px;background:#eff5ef;color:#5c8065;display:grid;place-items:center;margin-bottom:12px}.syllabus-empty strong,.syllabus-empty-inline strong{font-size:13px;color:#314537}.syllabus-empty p,.syllabus-empty-inline span{font-size:11px;line-height:1.6;max-width:330px;margin:7px 0 0}.syllabus-empty-inline{padding:24px 10px}.syllabus-empty-inline>svg{color:#72917a;margin-bottom:10px}.syllabus-loading{padding:26px 10px;text-align:center;color:#78857b;font-size:12px}.syllabus-spin{animation:syllabus-spin .8s linear infinite}@keyframes syllabus-spin{to{transform:rotate(360deg)}}@media(max-width:1000px){.syllabus-layout{grid-template-columns:1fr}.syllabus-form-card,.syllabus-list-card{padding:18px}}@media(max-width:650px){.syllabus-page{padding:18px 14px}.syllabus-hero{padding:20px;align-items:flex-start}.syllabus-hero-art{width:75px;height:75px}.syllabus-hero-art span{display:none}.syllabus-hero h1{font-size:24px}.syllabus-stats{gap:7px}.syllabus-stat{padding:10px 9px;gap:7px}.syllabus-stat-icon{width:31px;height:31px}.syllabus-stat strong{font-size:17px}.syllabus-stat small{font-size:9px}.syllabus-form-card,.syllabus-list-card{padding:15px}.syllabus-form-footer{align-items:flex-start;flex-direction:column}.syllabus-add-btn{width:100%;justify-content:center}}
      `}</style>
    </div>
  );
}
