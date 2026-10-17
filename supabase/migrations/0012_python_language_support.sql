-- 0012_python_language_support.sql
-- DRAFT: written WITHOUT access to your schema. Review against
-- supabase/migrations/0003_learn_platform.sql and your live dev schema, and
-- run it on a dev/branch database first. Nothing here deletes or rewrites data.
--
-- Safe by construction:
--   * Part 1 inserts Python into learn_languages ONLY if that table exists
--     and has the columns it expects; otherwise it raises a NOTICE and skips.
--   * Part 2 only REPORTS language CHECK constraints that may reject 'python'.
--     It does not alter them, so you decide how to widen each one.
-- Idempotent: safe to run more than once.

-- ---------------------------------------------------------------------------
-- Part 1: register the language (upsert)
-- ---------------------------------------------------------------------------
do $$
declare
  has_table boolean;
  cols text[];
  required text[] := array['id', 'name'];
  col text;
  missing text[] := '{}';
  sql text;
  sets text[] := '{}';
  ins_cols text[] := array['id', 'name'];
  ins_vals text[] := array[quote_literal('python'), quote_literal('Python 3')];
begin
  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'learn_languages'
  ) into has_table;

  if not has_table then
    raise notice 'learn_languages not found: skipping Python registration. Adapt this migration to your schema.';
    return;
  end if;

  select array_agg(column_name::text) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'learn_languages';

  foreach col in array required loop
    if not (col = any (cols)) then missing := missing || col; end if;
  end loop;
  if array_length(missing, 1) is not null then
    raise notice 'learn_languages is missing expected columns (%): skipping.', array_to_string(missing, ', ');
    return;
  end if;

  -- Optional columns: only written when they exist. Values are the proposed
  -- defaults; change icon to one your icon system supports.
  if 'description' = any (cols) then
    ins_cols := ins_cols || 'description';
    ins_vals := ins_vals || quote_literal('Modern, readable, general-purpose programming language.');
    sets := sets || 'description = excluded.description';
  end if;
  if 'icon' = any (cols) then
    ins_cols := ins_cols || 'icon';
    ins_vals := ins_vals || quote_literal('code');  -- ADJUST to a supported icon
    sets := sets || 'icon = coalesce(learn_languages.icon, excluded.icon)';
  end if;
  if 'display_order' = any (cols) then
    ins_cols := ins_cols || 'display_order';
    ins_vals := ins_vals || '(select coalesce(max(display_order), 0) + 1 from public.learn_languages)';
  end if;
  if 'is_published' = any (cols) then
    ins_cols := ins_cols || 'is_published';
    ins_vals := ins_vals || 'true';
  elsif 'published' = any (cols) then
    ins_cols := ins_cols || 'published';
    ins_vals := ins_vals || 'true';
  end if;

  -- Never overwrite the order or publication state of an existing row.
  sets := sets || 'name = excluded.name';
  sql := format(
    'insert into public.learn_languages (%s) values (%s) on conflict (id) do update set %s',
    array_to_string(ins_cols, ', '),
    array_to_string(ins_vals, ', '),
    array_to_string(sets, ', ')
  );
  execute sql;
  raise notice 'Python registered in learn_languages.';
end
$$;

-- ---------------------------------------------------------------------------
-- Part 2: report constraints that may block language = 'python'
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  found boolean := false;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname, pg_get_constraintdef(c.oid) as def
    from pg_constraint c
    join pg_namespace n on n.oid = c.connamespace
    where n.nspname = 'public'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%language%'
      and pg_get_constraintdef(c.oid) ~* '(cpp|asm|assembly)'
      and pg_get_constraintdef(c.oid) !~* 'python'
  loop
    found := true;
    raise notice 'REVIEW: % constraint % may reject python: %', r.tbl, r.conname, r.def;
  end loop;
  if not found then
    raise notice 'No language CHECK constraints needing review were found.';
  end if;
end
$$;

-- If Part 2 lists constraints, widen each one deliberately, for example:
--   alter table public.projects drop constraint projects_language_check;
--   alter table public.projects add constraint projects_language_check
--     check (language in ('cpp', 'asm', 'python')) not valid;
--   alter table public.projects validate constraint projects_language_check;
-- (NOT VALID + VALIDATE avoids a long lock on large tables.)
-- Also check enum types: `select typname, enumlabel from pg_enum ...` and
-- `alter type <enum> add value if not exists 'python';` if language is an enum.
