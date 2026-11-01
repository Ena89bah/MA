-- حفظ كل براند أو شركة في سطر مستقل، حتى لا تطغى تعديلات موظف على تعديلات موظف آخر.
-- لا يحذف شيئاً: ينسخ الشركات إلى الجدول الجديد ويحتفظ بنسخة احتياطية من المستند كاملاً.
create table if not exists public.app_state_backup (taken_at timestamptz primary key default now(), data jsonb not null);
insert into public.app_state_backup (data) select data from public.app_state where id = 1;
alter table public.app_state_backup enable row level security;

create table if not exists public.app_entities (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_entities enable row level security;

insert into public.app_entities (id, data)
select e->>'id', e from public.app_state s, jsonb_array_elements(coalesce(s.data->'entities', '[]'::jsonb)) e
where s.id = 1 and e->>'id' is not null
on conflict (id) do nothing;
update public.app_state set data = data - 'entities' where id = 1;

create or replace function public.app_get_state(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb;
begin
  perform public.app_current_user(p_token);
  select data into d from public.app_state where id = 1;
  return coalesce(d, '{}'::jsonb) || jsonb_build_object('entities',
    coalesce((select jsonb_agg(data) from public.app_entities), '[]'::jsonb));
end $$;

-- الشركات لا تُحفظ من هنا أبداً، حتى لو أرسلتها نسخة قديمة من الموقع
create or replace function public.app_save_state(p_token text, p_data jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare u public.app_users;
begin
  u := public.app_current_user(p_token);
  if u.role = 'viewer' then raise exception 'forbidden'; end if;
  insert into public.app_state (id, data, updated_at) values (1, p_data - 'entities', now())
  on conflict (id) do update set data = excluded.data, updated_at = now();
end $$;

create or replace function public.app_save_entities(p_token text, p_upsert jsonb, p_delete text[]) returns void
language plpgsql security definer set search_path = public as $$
declare u public.app_users;
begin
  u := public.app_current_user(p_token);
  if u.role = 'viewer' then raise exception 'forbidden'; end if;
  insert into public.app_entities (id, data, updated_at)
  select e->>'id', e, now() from jsonb_array_elements(coalesce(p_upsert, '[]'::jsonb)) e
  on conflict (id) do update set data = excluded.data, updated_at = now();
  delete from public.app_entities where id = any(coalesce(p_delete, '{}'));
end $$;

revoke all on function public.app_save_entities(text, jsonb, text[]) from public;
grant execute on function public.app_save_entities(text, jsonb, text[]) to anon, authenticated;
