'use client';

import { useEffect, useMemo, useState, type ComponentType } from 'react';
import {
  BookOpen, ClipboardList, Lightbulb, Sparkles, FileText, GraduationCap,
  Copy, Printer, RotateCcw, Download, Eye, PencilLine, Check, RefreshCw,
} from 'lucide-react';

type ClassRow = { id: string; name: string; section?: string | null };
type SubjectRow = { id: string; name: string; class_id: string };
type SyllabusUnit = { id: string; unit_title: string; details?: string | null };
type Tool = readonly [string, string, string, ComponentType<{ size?: number }>];

const teacherTools: Tool[] = [
  ['worksheet', 'Worksheet Generator', 'Printable practice sheets and answer keys.', ClipboardList],
  ['lesson', 'Lesson Generator', 'Classroom and smart-board lessons.', BookOpen],
  ['quiz', 'Quiz Generator', 'Quizzes with answer keys.', FileText],
  ['explain', 'Explain for Kids', 'Simple, child-friendly explanations.', Lightbulb],
  ['story', 'Educational Story', 'Learning stories with questions.', BookOpen],
  ['questions', 'Practice Questions', 'Homework and revision practice.', Sparkles],
  ['lesson-plan', 'Teaching Plan', 'A complete classroom session plan.', GraduationCap],
];
const adminTools: Tool[] = [
  ['notice', 'Notice & Circular Writer', 'Draft school announcements.', FileText],
  ['school-report', 'Admin Report Draft', 'Turn supplied facts into a report.', ClipboardList],
  ['assistant', 'AI Assistant', 'Help with school planning and operations.', Sparkles],
];

async function readJson(response: Response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; }
  catch { throw new Error(`The server returned an invalid response (HTTP ${response.status}).`); }
}

export default function AIStudio({ role }: { role: 'teacher' | 'admin' }) {
  const tools = role === 'teacher' ? teacherTools : adminTools;
  const [task, setTask] = useState<string>(tools[0][0]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [syllabusUnits, setSyllabusUnits] = useState<SyllabusUnit[]>([]);
  const [syllabusId, setSyllabusId] = useState('');
  const [difficulty, setDifficulty] = useState('Adaptive');
  const [topic, setTopic] = useState('');
  const [extra, setExtra] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingSchoolData, setLoadingSchoolData] = useState(role === 'teacher');
  const [loadingSyllabus, setLoadingSyllabus] = useState(false);
  const [model, setModel] = useState('');
  const [draftMode, setDraftMode] = useState<'preview' | 'edit'>('preview');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    async function loadSchoolData() {
      if (role !== 'teacher') return;
      setLoadingSchoolData(true);
      setError('');
      try {
        const response = await fetch('/api/teacher/classes', { cache: 'no-store' });
        const data = await readJson(response);
        if (!response.ok) throw new Error(data.error || 'Could not load your classes.');
        if (live) {
          setClasses(Array.isArray(data.classes) ? data.classes : []);
          setSubjects(Array.isArray(data.subjects) ? data.subjects : []);
          setClassId(data.classes?.[0]?.id || '');
        }
      } catch (cause) {
        if (live) setError(cause instanceof Error ? cause.message : 'Could not load school data.');
      } finally {
        if (live) setLoadingSchoolData(false);
      }
    }
    void loadSchoolData();
    return () => { live = false; };
  }, [role]);

  const availableSubjects = useMemo(
    () => subjects.filter((subject) => subject.class_id === classId),
    [subjects, classId],
  );
  useEffect(() => {
    if (!availableSubjects.some((subject) => subject.id === subjectId)) {
      setSubjectId(availableSubjects[0]?.id || '');
    }
  }, [availableSubjects, subjectId]);

  const selectedClass = classes.find((item) => item.id === classId);
  const selectedSubject = availableSubjects.find((item) => item.id === subjectId);
  const selectedSyllabus = syllabusUnits.find((unit) => unit.id === syllabusId);

  useEffect(() => {
    let live = true;
    setSyllabusUnits([]);
    setSyllabusId('');
    if (role !== 'teacher' || !classId || !subjectId) {
      setLoadingSyllabus(false);
      return () => { live = false; };
    }
    async function loadSyllabus() {
      setLoadingSyllabus(true);
      try {
        const response = await fetch(
          `/api/syllabus?class_id=${encodeURIComponent(classId)}&subject_id=${encodeURIComponent(subjectId)}`,
          { cache: 'no-store', headers: { 'x-school-role': 'teacher' } },
        );
        const data = await readJson(response);
        if (!response.ok) throw new Error(data.error || 'Could not load syllabus units.');
        if (live) setSyllabusUnits(Array.isArray(data.items) ? data.items : []);
      } catch (cause) {
        if (live) setError(cause instanceof Error ? cause.message : 'Could not load syllabus.');
      } finally {
        if (live) setLoadingSyllabus(false);
      }
    }
    void loadSyllabus();
    return () => { live = false; };
  }, [role, classId, subjectId]);

  async function generate() {
    if (role === 'teacher' && (!classId || !subjectId)) return;
    if (!topic.trim() && !extra.trim()) {
      setError(role === 'teacher' ? 'Enter a chapter or topic to generate your draft.' : 'Enter the details for your draft.');
      return;
    }
    setBusy(true);
    setError('');
    setResult('');
    setCopied(false);
    try {
      const prompt = [
        selectedClass ? `Class: ${selectedClass.name}${selectedClass.section ? ` - ${selectedClass.section}` : ''}` : '',
        selectedSubject ? `Subject: ${selectedSubject.name}` : '',
        selectedSyllabus ? `Syllabus unit: ${selectedSyllabus.unit_title}${selectedSyllabus.details ? `\nSyllabus details: ${selectedSyllabus.details}` : ''}` : '',
        `Difficulty: ${difficulty}`,
        topic.trim() ? `Topic: ${topic.trim()}` : '',
        extra.trim() ? `Additional instructions: ${extra.trim()}` : '',
      ].filter(Boolean).join('\n\n');
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-school-role': role },
        body: JSON.stringify({ task, prompt, classId, subjectId, syllabusId: syllabusId || null, difficulty }),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || `AI request failed (HTTP ${response.status}).`);
      if (!data.content || typeof data.content !== 'string') throw new Error('The AI returned an empty draft. Please try again.');
      setResult(data.content);
      setModel(typeof data.model === 'string' ? data.model : '');
      setDraftMode('preview');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong while generating your draft.');
    } finally {
      setBusy(false);
    }
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Clipboard access was blocked. Select the draft text and copy it manually.');
    }
  }

  function downloadDraft() {
    const blob = new Blob([result], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${task}-draft.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="content ai-studio">
      <div className="page-head"><div><div className="ai-eyebrow"><Sparkles size={14} /> AI STUDIO</div><h1>{role === 'admin' ? 'School AI Studio' : 'AI Teaching Assistant'}</h1><p className="subtitle">{role === 'teacher' ? 'Choose a tool, set a few options, and generate a classroom-ready draft.' : 'Create administrative drafts using information from your school.'}</p></div></div>

      <section className="card panel ai-tools"><div className="ai-section-head"><div><h2>Choose a tool</h2><p className="subtitle">Select what you want to create.</p></div><span className="ai-count">{tools.length} tools</span></div><div className="ai-tool-grid">{tools.map(([id, name, desc, Icon]) => <button type="button" key={id} onClick={() => { setTask(id); setResult(''); setError(''); }} className={`ai-tool ${task === id ? 'selected' : ''}`}><span className="ai-tool-icon"><Icon size={19} /></span><span className="ai-tool-copy"><strong>{name}</strong><small>{desc}</small></span>{task === id && <span className="ai-selected-dot" />}</button>)}</div></section>

      <section className="card panel ai-config"><div className="ai-section-head"><div><h2>{tools.find((tool) => tool[0] === task)?.[1]}</h2><p className="subtitle">{role === 'teacher' ? "Set the learning details. Class, subject and syllabus options come from this school's records." : 'Add the details for your administrative draft.'}</p></div></div>
        {role === 'teacher' && <div className="ai-fields">
          <label>Class<select value={classId} onChange={(event) => { setClassId(event.target.value); setSubjectId(''); setSyllabusId(''); setError(''); }} disabled={loadingSchoolData}><option value="">{loadingSchoolData ? 'Loading classes…' : 'Select class'}</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}{item.section ? ` - ${item.section}` : ''}</option>)}</select></label>
          <label>Subject<select value={subjectId} onChange={(event) => { setSubjectId(event.target.value); setSyllabusId(''); setError(''); }} disabled={loadingSchoolData || !classId || !availableSubjects.length}><option value="">{loadingSchoolData ? 'Loading subjects…' : availableSubjects.length ? 'Select subject' : 'No subjects for this class'}</option>{availableSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
          <label>Difficulty<select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option value="Adaptive">Adaptive</option><option value="Easy">Easy</option><option value="Medium">Medium</option><option value="Hard">Hard</option></select></label>
          <label>Syllabus unit<select value={syllabusId} onChange={(event) => setSyllabusId(event.target.value)} disabled={loadingSyllabus || !syllabusUnits.length}><option value="">{loadingSyllabus ? 'Loading syllabus…' : syllabusUnits.length ? 'No specific unit (optional)' : 'No syllabus units added'}</option>{syllabusUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.unit_title}</option>)}</select></label>
        </div>}
        <label className="ai-wide-label">{role === 'teacher' ? 'Chapter / Topic' : 'Instructions and details'}<input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder={role === 'teacher' ? 'e.g. Fractions and equivalent fractions' : 'Enter the facts and purpose for this draft'} /></label>
        <label className="ai-wide-label">Additional instructions<textarea value={extra} onChange={(event) => setExtra(event.target.value)} rows={3} placeholder={role === 'teacher' ? 'e.g. Include simple word problems and an answer key.' : 'Add any context or formatting preferences.'} /></label>
        {role === 'teacher' && !loadingSchoolData && !classes.length && <p className="ai-info">No classes are assigned to this teacher yet. Ask an administrator to assign a class and add its subjects.</p>}
        {role === 'teacher' && classId && subjectId && !loadingSyllabus && !syllabusUnits.length && <p className="ai-info">No syllabus units have been added for this class and subject yet. You can still generate a draft without selecting a unit.</p>}
        <div className="ai-actions"><button type="button" className="launch-btn ai-generate" onClick={generate} disabled={busy || loadingSchoolData || (role === 'teacher' && (!classId || !subjectId))}>{busy ? <><span className="ai-spinner" /> Generating…</> : <><Sparkles size={16} /> Generate with AI</>}</button><span className="subtitle ai-note">Your result is an editable draft. Review it before sharing or printing.</span></div>
        {error && <p role="alert" className="ai-error">{error}</p>}
      </section>

      {result && <section className="card panel ai-result">
        <div className="ai-result-head"><div><div className="ai-result-kicker"><Check size={13} /> YOUR DRAFT IS READY</div><h2>Generated draft</h2><p className="subtitle">{model ? `Created with ${model}. ` : ''}Review the content, make edits, then copy, download or print it.</p></div><div className="ai-result-actions"><button type="button" className="secondary-btn" onClick={() => setDraftMode('preview')} aria-pressed={draftMode === 'preview'}><Eye size={15} /> Preview</button><button type="button" className="secondary-btn" onClick={() => setDraftMode('edit')} aria-pressed={draftMode === 'edit'}><PencilLine size={15} /> Edit</button></div></div>
        {draftMode === 'preview' ? <article className="ai-draft-preview"><pre>{result}</pre></article> : <label className="ai-draft-editor-label">Edit your generated content<textarea aria-label="Edit generated content" value={result} onChange={(event) => setResult(event.target.value)} rows={18} /></label>}
        <div className="ai-draft-footer"><span className="ai-draft-status"><Check size={14} /> Draft ready · {result.trim().split(/\s+/).filter(Boolean).length} words</span><div className="ai-draft-actions"><button type="button" className="secondary-btn" onClick={() => void copyDraft()}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copied' : 'Copy text'}</button><button type="button" className="secondary-btn" onClick={downloadDraft}><Download size={15} /> Download .txt</button><button type="button" className="secondary-btn" onClick={() => window.print()}><Printer size={15} /> Print</button><button type="button" className="text-btn" onClick={() => { setResult(''); setModel(''); setDraftMode('preview'); }}><RotateCcw size={14} /> Clear draft</button></div></div>
      </section>}

      <style jsx>{`
        .ai-studio{max-width:1440px}.ai-eyebrow{display:flex;align-items:center;gap:7px;color:#47775b;font-size:10px;font-weight:800;letter-spacing:.12em;margin-bottom:8px}.ai-tools,.ai-config,.ai-result{border:1px solid #e2e9e2;border-radius:18px;padding:22px;margin-top:16px;box-shadow:0 5px 24px #1b38200a}.ai-section-head,.ai-result-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:17px}.ai-section-head h2,.ai-result-head h2{font-size:18px;margin:0 0 5px;color:#1b2b20}.ai-section-head .subtitle,.ai-result-head .subtitle{margin:0;line-height:1.55}.ai-count{font-size:11px;color:#718075;background:#f3f6f3;padding:6px 10px;border-radius:20px;white-space:nowrap}.ai-tool-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(205px,1fr));gap:10px}.ai-tool{display:flex;align-items:flex-start;gap:11px;text-align:left;padding:15px 14px;min-height:92px;border:1px solid #e0e8e0;background:#fff;border-radius:13px;cursor:pointer;transition:border-color .15s,background .15s,transform .15s;position:relative;color:#1b2b20}.ai-tool:hover{border-color:#8aaa96;transform:translateY(-1px)}.ai-tool.selected{border:1.5px solid #47775b;background:#f0f6f1;box-shadow:inset 0 0 0 1px #47775b18}.ai-tool-icon{width:36px;height:36px;flex:none;display:grid;place-items:center;border-radius:10px;background:#e6f0e8;color:#47775b}.ai-tool-copy{display:flex;flex-direction:column;gap:7px;min-width:0}.ai-tool-copy strong{font-size:13px;line-height:1.35}.ai-tool-copy small{font-size:11px;line-height:1.5;color:#718075}.ai-selected-dot{position:absolute;right:11px;top:11px;width:7px;height:7px;background:#47775b;border-radius:50%}.ai-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:13px;margin-bottom:15px}.ai-fields label,.ai-wide-label,.ai-draft-editor-label{display:flex;flex-direction:column;gap:7px;color:#34463a;font-size:12px;font-weight:700}.ai-fields select,.ai-wide-label input,.ai-wide-label textarea,.ai-draft-editor-label textarea{width:100%;border:1px solid #dce5dd;border-radius:10px;background:#fff;color:#1b2b20;padding:11px 12px;font:inherit;font-size:13px;outline:none;min-width:0}.ai-fields select:focus,.ai-wide-label input:focus,.ai-wide-label textarea:focus,.ai-draft-editor-label textarea:focus{border-color:#47775b;box-shadow:0 0 0 3px #47775b18}.ai-wide-label{margin-top:14px}.ai-wide-label textarea,.ai-draft-editor-label textarea{resize:vertical;line-height:1.6}.ai-actions{display:flex;align-items:center;gap:13px;flex-wrap:wrap;margin-top:17px}.ai-generate{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:0;min-height:42px;padding:0 17px;border-radius:10px}.ai-generate:disabled{opacity:.55;cursor:not-allowed}.ai-note{font-size:11px}.ai-info{font-size:12px;color:#765b1c;background:#fff8e6;border:1px solid #f0e2b8;border-radius:10px;padding:11px 13px;margin:14px 0 0}.ai-error{color:#a32929;background:#fff3f2;border:1px solid #f2d3d0;border-radius:10px;padding:10px 12px;font-size:12px;margin-top:14px}.ai-result{margin-bottom:25px}.ai-result-head{align-items:center}.ai-result-kicker{display:flex;align-items:center;gap:5px;color:#3f8054;font-size:10px;font-weight:900;letter-spacing:.1em;margin-bottom:8px}.ai-result-actions,.ai-draft-actions{display:flex;gap:8px;flex-wrap:wrap}.ai-result-actions button,.ai-draft-actions button,.text-btn{display:inline-flex;align-items:center;gap:7px}.ai-result-actions button[aria-pressed=true]{border-color:#8aaa96;background:#eff6f0;color:#315b42}.ai-draft-preview{border:1px solid #e1e8e1;border-radius:12px;background:#fcfdfc;padding:22px;max-height:720px;overflow:auto}.ai-draft-preview pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.8 Arial,Helvetica,sans-serif;color:#27372c}.ai-draft-editor-label{margin-top:6px}.ai-draft-editor-label textarea{font-size:13px;min-height:340px}.ai-draft-footer{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;border-top:1px solid #e9eee9;padding-top:14px;margin-top:14px}.ai-draft-status{display:inline-flex;align-items:center;gap:6px;color:#47775b;font-size:11px;font-weight:700}.ai-draft-actions{align-items:center}.text-btn{border:0;background:transparent;color:#607267;font-size:12px;cursor:pointer;padding:8px}.ai-spinner{width:13px;height:13px;border:2px solid #ffffff77;border-top-color:white;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:760px){.ai-fields{grid-template-columns:1fr}.ai-tools,.ai-config,.ai-result{padding:16px}.ai-tool-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ai-tool{min-height:105px;padding:12px;gap:8px}.ai-tool-icon{width:31px;height:31px}.ai-tool-copy strong{font-size:12px}.ai-tool-copy small{font-size:10px}.ai-result-head{align-items:flex-start;flex-direction:column}.ai-draft-preview{padding:15px}}@media(max-width:420px){.ai-tool-grid{grid-template-columns:1fr}.ai-tool{min-height:auto}.ai-draft-actions{width:100%}.ai-draft-actions button{flex:1;justify-content:center}}
        @media print{body{background:#fff!important}.sidebar,.topbar,.ai-tools,.ai-config,.ai-result-actions,.ai-draft-footer,.ai-eyebrow{display:none!important}.main{margin:0!important;width:100%!important}.content{padding:0!important}.ai-result{border:0!important;box-shadow:none!important;padding:0!important;margin:0!important}.ai-draft-preview{border:0!important;max-height:none!important;overflow:visible!important;padding:0!important}.ai-draft-preview pre{font-size:11pt!important;color:#000!important}}
      `}</style>
    </div>
  );
}
