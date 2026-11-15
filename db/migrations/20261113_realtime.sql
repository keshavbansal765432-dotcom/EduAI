-- Enable Supabase Realtime for the tables the app listens to.
-- Run once in the Supabase SQL editor. Safe to re-run.
do $$
declare t text;
begin
  foreach t in array array['classes','students','subjects','attendance','assignments','notices','timetable','syllabus_units','classroom_lessons','profiles'] loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
