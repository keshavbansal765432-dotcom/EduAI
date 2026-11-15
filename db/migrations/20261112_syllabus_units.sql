-- Run this migration in Supabase SQL Editor if the base schema was already installed.
create table if not exists public.syllabus_units (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  unit_title text not null,
  details text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(class_id, subject_id, unit_title)
);
create index if not exists syllabus_units_class_subject_idx on public.syllabus_units(class_id, subject_id);
alter table public.syllabus_units enable row level security;
drop policy if exists syllabus_units_read on public.syllabus_units;
drop policy if exists syllabus_units_admin on public.syllabus_units;
create policy syllabus_units_read on public.syllabus_units for select using (
  public.is_admin() or (public.is_teacher() and exists(select 1 from public.classes c where c.id=class_id and c.teacher_id=auth.uid()))
);
create policy syllabus_units_admin on public.syllabus_units for all using(public.is_admin()) with check(public.is_admin());
