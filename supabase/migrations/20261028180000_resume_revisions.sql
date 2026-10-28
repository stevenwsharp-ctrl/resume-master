-- Federal (USAJOBS) resumes follow OPM's two-page format; everything else is "standard".
alter table public.resumes
  add column format text not null default 'standard' check (format in ('standard', 'federal'));

-- Earlier versions of each resume, newest last, so a regenerate or edit can be undone.
-- Each entry: { content, saved_at, reason }.
alter table public.resumes
  add column history jsonb not null default '[]'::jsonb;
