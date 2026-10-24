begin;
alter table public.classroom_messages add column if not exists client_request_id uuid;
alter table public.classroom_messages add constraint message_request_dedup unique(classroom_id,sender_id,client_request_id);
alter table public.classroom_notifications add column if not exists message_id uuid references public.classroom_messages(id) on delete cascade;
alter table public.classroom_notifications add constraint notification_message_recipient unique(message_id,recipient_id);
create table public.push_subscriptions(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id) on delete cascade,
 endpoint text not null unique check(length(endpoint)<=2048),p256dh text not null,auth text not null,created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy push_owner on public.push_subscriptions for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update,delete on public.push_subscriptions to authenticated;grant all on public.push_subscriptions to service_role;
create table public.notification_preferences(user_id uuid primary key references public.profiles(id) on delete cascade,push_enabled boolean not null default false);
alter table public.notification_preferences enable row level security;
create policy preferences_owner on public.notification_preferences for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update on public.notification_preferences to authenticated;grant all on public.notification_preferences to service_role;
create table public.push_outbox(
 id uuid primary key default gen_random_uuid(),notification_id uuid not null references public.classroom_notifications(id) on delete cascade,
 subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,attempts integer not null default 0,
 state text not null default 'pending' check(state in ('pending','sending','sent','failed')),next_attempt_at timestamptz not null default now(),locked_at timestamptz,last_error text,
 unique(notification_id,subscription_id)
);
alter table public.push_outbox enable row level security;grant all on public.push_outbox to service_role;
create index push_outbox_pending on public.push_outbox(next_attempt_at) where state in ('pending','sending');
create or replace function public.send_classroom_message(actor uuid,cid uuid,body text,recipient uuid,request_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare owner_id uuid; m public.classroom_messages; n record; sender_label text; teacher boolean; begin
 select teacher_id into owner_id from public.classrooms where id=cid;
 teacher:=(actor=owner_id and public.is_verified_teacher(actor)) or exists(select 1 from public.app_roles where user_id=actor and role='admin');
 if owner_id is null or not (teacher or exists(select 1 from public.classroom_members where classroom_id=cid and user_id=actor and role='student')) then raise exception 'Classroom access denied'; end if;
 if length(trim(body)) not between 1 and 5000 then raise exception 'Message must be 1–5000 characters'; end if;
 if recipient is not null and (not teacher and recipient<>owner_id or not(recipient=owner_id or exists(select 1 from public.classroom_members where classroom_id=cid and user_id=recipient))) then raise exception 'Recipient not permitted'; end if;
 insert into public.classroom_messages(classroom_id,sender_id,recipient_id,content,is_group_message,client_request_id)
 values(cid,actor,recipient,trim(body),recipient is null,request_id)
 on conflict(classroom_id,sender_id,client_request_id) do nothing returning * into m;
 if m.id is null then select * into m from public.classroom_messages where classroom_id=cid and sender_id=actor and client_request_id=request_id;
 else
  select coalesce(nullif(trim(display_name),''),'Class member') into sender_label from public.profiles where id=actor;
  for n in select distinct id from (
   select user_id as id from public.classroom_members where classroom_id=cid and recipient is null
   union select owner_id where recipient is null union select recipient where recipient is not null
  ) recipients where id<>actor and id is not null loop
   insert into public.classroom_notifications(recipient_id,classroom_id,type,title,message,link,message_id)
   values(n.id,cid,'mention',left(coalesce(sender_label,'Class member')||' sent a message',200),'New classroom message',
    '/classroom/'||cid||'/messages'||case when recipient is null then '' else '?recipientId='||actor end,m.id);
  end loop;
  insert into public.push_outbox(notification_id,subscription_id)
  select cn.id,ps.id from public.classroom_notifications cn join public.push_subscriptions ps on ps.user_id=cn.recipient_id
  join public.notification_preferences np on np.user_id=ps.user_id and np.push_enabled
  where cn.message_id=m.id on conflict do nothing;
 end if;
 return to_jsonb(m)||jsonb_build_object('senderName',(select coalesce(nullif(trim(display_name),''),'Class member') from public.profiles where id=actor),'recipientName',(select display_name from public.profiles where id=recipient));
end $$;
revoke all on function public.send_classroom_message(uuid,uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.send_classroom_message(uuid,uuid,text,uuid,uuid) to service_role;
create or replace function public.claim_push_jobs() returns setof public.push_outbox
language plpgsql security definer set search_path=public,pg_temp as $$
 begin
 update public.push_outbox set state='failed',last_error='Retry budget exhausted' where state='sending' and locked_at<now()-interval '2 minutes' and attempts>=5;
 return query update public.push_outbox set state='sending',locked_at=now(),attempts=attempts+1 where id in (
 select id from public.push_outbox where (state='pending' or (state='sending' and locked_at<now()-interval '2 minutes')) and next_attempt_at<=now() and attempts<5
 order by next_attempt_at for update skip locked limit 10) returning *;
end $$;
revoke all on function public.claim_push_jobs() from public,anon,authenticated;grant execute on function public.claim_push_jobs() to service_role;
-- Postgres Changes obeys recipient RLS; clients must also reconcile after reconnect.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='classroom_notifications') then
 alter publication supabase_realtime add table public.classroom_notifications;
 end if;
end $$;
-- Force all new message writes through the atomic service operation.
revoke insert,update,delete on public.classroom_messages from authenticated;

commit;
