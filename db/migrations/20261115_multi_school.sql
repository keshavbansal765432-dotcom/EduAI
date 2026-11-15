-- Multi-school support: every school's data is isolated by school_id.
-- Safe to re-run. Existing single-school data is moved into one school called "My School"
-- (rename it in the `schools` table).

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
alter table public.schools enable row level security;

alter table public.profiles          add column if not exists school_id uuid references public.schools(id) on delete cascade;
alter table public.classes           add column if not exists school_id uuid references public.schools(id) on delete cascade;
alter table public.students          add column if not exists school_id uuid references public.schools(id) on delete cascade;
alter table public.subjects          add column if not exists school_id uuid references public.schools(id) on delete cascade;
alter table public.attendance        add column if not exists school_id uuid references public.schools(id) on delete cascade;
alter table public.assignments       add column if not exists school_id uuid references public.schools(id) on delete cascade;
alter table public.notices           add column if not exists school_id uuid references public.schools(id) on delete cascade;
alter table public.timetable         add column if not exists school_id uuid references public.schools(id) on delete cascade;
alter table public.syllabus_units    add column if not exists school_id uuid references public.schools(id) on delete cascade;
alter table public.classroom_lessons add column if not exists school_id uuid references public.schools(id) on delete cascade;

-- Backfill existing data into one default school.
do $$
declare sid uuid;
begin
  if (select count(*) from public.schools)=0
     and (exists(select 1 from public.profiles) or exists(select 1 from public.classes)) then
    insert into public.schools(name) values ('My School') returning id into sid;
  else
    select id into sid from public.schools order by created_at limit 1;
  end if;
  if sid is not null then
    update public.profiles          set school_id=sid where school_id is null;
    update public.classes           set school_id=sid where school_id is null;
    update public.students          set school_id=sid where school_id is null;
    update public.subjects          set school_id=sid where school_id is null;
    update public.attendance        set school_id=sid where school_id is null;
    update public.assignments       set school_id=sid where school_id is null;
    update public.notices           set school_id=sid where school_id is null;
    update public.timetable         set school_id=sid where school_id is null;
    update public.syllabus_units    set school_id=sid where school_id is null;
    update public.classroom_lessons set school_id=sid where school_id is null;
  end if;
end $$;

-- profiles.school_id stays nullable (the auth trigger creates the profile before the school is known).
alter table public.classes           alter column school_id set not null;
alter table public.students          alter column school_id set not null;
alter table public.subjects          alter column school_id set not null;
alter table public.attendance        alter column school_id set not null;
alter table public.assignments       alter column school_id set not null;
alter table public.notices           alter column school_id set not null;
alter table public.timetable         alter column school_id set not null;
alter table public.syllabus_units    alter column school_id set not null;
alter table public.classroom_lessons alter column school_id set not null;

-- Admission numbers only need to be unique inside one school.
alter table public.students drop constraint if exists students_admission_no_key;
do $$ begin
  alter table public.students add constraint students_school_admission_key unique (school_id, admission_no);
exception when duplicate_table or duplicate_object then null; end $$;

create index if not exists profiles_school_idx   on public.profiles(school_id);
create index if not exists classes_school_idx    on public.classes(school_id);
create index if not exists students_school_idx   on public.students(school_id);
create index if not exists subjects_school_idx   on public.subjects(school_id);
create index if not exists notices_school_idx    on public.notices(school_id);
create index if not exists timetable_school_idx  on public.timetable(school_id);

create or replace function public.current_school_id() returns uuid language sql stable security definer set search_path=public as $$
  select school_id from public.profiles where id=auth.uid() and active=true;
$$;
-- True when the caller is an admin of the school that owns the row.
create or replace function public.is_school_admin(sid uuid) returns boolean language sql stable security definer set search_path=public as $$
  select public.is_admin() and sid is not null and sid=public.current_school_id();
$$;

-- Row level security (also what Realtime uses, so one school never receives another school's events).
drop policy if exists schools_read on public.schools;
create policy schools_read on public.schools for select using(id=public.current_school_id());

drop policy if exists profiles_self on public.profiles;
drop policy if exists profiles_admin on public.profiles;
create policy profiles_self on public.profiles for select using(id=auth.uid() or public.is_school_admin(school_id));
create policy profiles_admin on public.profiles for all using(public.is_school_admin(school_id)) with check(public.is_school_admin(school_id));

drop policy if exists classes_read on public.classes;
drop policy if exists classes_admin on public.classes;
create policy classes_read on public.classes for select using(public.is_school_admin(school_id) or (public.is_teacher() and teacher_id=auth.uid()));
create policy classes_admin on public.classes for all using(public.is_school_admin(school_id)) with check(public.is_school_admin(school_id));

drop policy if exists students_read on public.students;
drop policy if exists students_admin on public.students;
create policy students_read on public.students for select using(public.is_school_admin(school_id) or (public.is_teacher() and exists(select 1 from public.classes c where c.id=class_id and c.teacher_id=auth.uid())));
create policy students_admin on public.students for all using(public.is_school_admin(school_id)) with check(public.is_school_admin(school_id));

drop policy if exists subjects_read on public.subjects;
drop policy if exists subjects_admin on public.subjects;
create policy subjects_read on public.subjects for select using(public.is_school_admin(school_id) or (public.is_teacher() and exists(select 1 from public.classes c where c.id=class_id and c.teacher_id=auth.uid())));
create policy subjects_admin on public.subjects for all using(public.is_school_admin(school_id)) with check(public.is_school_admin(school_id));

drop policy if exists attendance_access on public.attendance;
create policy attendance_access on public.attendance for all
  using(public.is_school_admin(school_id) or (public.is_teacher() and exists(select 1 from public.classes c where c.id=class_id and c.teacher_id=auth.uid())))
  with check(public.is_school_admin(school_id) or (public.is_teacher() and exists(select 1 from public.classes c where c.id=class_id and c.teacher_id=auth.uid())));

drop policy if exists assignments_access on public.assignments;
create policy assignments_access on public.assignments for all
  using(public.is_school_admin(school_id) or (public.is_teacher() and (created_by=auth.uid() or exists(select 1 from public.classes c where c.id=class_id and c.teacher_id=auth.uid()))))
  with check(public.is_school_admin(school_id) or (public.is_teacher() and exists(select 1 from public.classes c where c.id=class_id and c.teacher_id=auth.uid())));

drop policy if exists notices_access on public.notices;
drop policy if exists notices_admin on public.notices;
create policy notices_access on public.notices for select using(school_id=public.current_school_id() and (public.is_admin() or public.is_teacher()));
create policy notices_admin on public.notices for all using(public.is_school_admin(school_id)) with check(public.is_school_admin(school_id));

drop policy if exists timetable_access on public.timetable;
drop policy if exists timetable_admin on public.timetable;
create policy timetable_access on public.timetable for select using(public.is_school_admin(school_id) or (public.is_teacher() and exists(select 1 from public.classes c where c.id=class_id and c.teacher_id=auth.uid())));
create policy timetable_admin on public.timetable for all using(public.is_school_admin(school_id)) with check(public.is_school_admin(school_id));

drop policy if exists classroom_lessons_teacher_read on public.classroom_lessons;
drop policy if exists classroom_lessons_admin on public.classroom_lessons;
create policy classroom_lessons_teacher_read on public.classroom_lessons for select using(public.is_school_admin(school_id) or (public.is_teacher() and exists(select 1 from public.classes c where c.id=class_id and c.teacher_id=auth.uid())));
create policy classroom_lessons_admin on public.classroom_lessons for all using(public.is_school_admin(school_id)) with check(public.is_school_admin(school_id));

drop policy if exists syllabus_units_read on public.syllabus_units;
drop policy if exists syllabus_units_admin on public.syllabus_units;
create policy syllabus_units_read on public.syllabus_units for select using(public.is_school_admin(school_id) or (public.is_teacher() and exists(select 1 from public.classes c where c.id=class_id and c.teacher_id=auth.uid())));
create policy syllabus_units_admin on public.syllabus_units for all using(public.is_school_admin(school_id)) with check(public.is_school_admin(school_id));
