-- Existing assignment contents are preserved as C++. Classes inherit from their subject.
alter table public.classrooms add column if not exists language text not null default 'cpp';
alter table public.classroom_assignments add column if not exists language text not null default 'cpp';
update public.classrooms set language = case
  when subject ~* '(nasm|assembly|8086)' then 'asm8086'
  when subject ~* 'python' then 'python' else 'cpp' end;
alter table public.classrooms add constraint classrooms_language_check check (language in ('cpp', 'python', 'asm8086'));
alter table public.classroom_assignments add constraint assignments_language_check check (language in ('cpp', 'python', 'asm8086'));
