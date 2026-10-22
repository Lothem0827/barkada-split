-- Barkada Split schema (fixed for Supabase). Run AFTER the drop-schema reset.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.lakads (
  id text primary key,
  join_code text unique not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id)
);

create table if not exists public.seat_locks (
  trip_id text not null references public.lakads (id) on delete cascade,
  member_id text not null,
  claimed_by_uid uuid references auth.users (id),
  pin_hash text,
  pin_attempts int not null default 0,
  pin_locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (trip_id, member_id)
);

create or replace function public.normalize_join_code(p_code text)
returns text
language sql
immutable
as $$
  select case
    when length(regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g')) >= 6
      then substring(regexp_replace(upper(p_code), '[^A-Z0-9]', '', 'g') from 1 for 4)
        || '-' ||
        substring(regexp_replace(upper(p_code), '[^A-Z0-9]', '', 'g') from 5 for 2)
    else regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g')
  end;
$$;

-- FIX: index on the normalized code so join-code lookups don't scan the table
create index if not exists lakads_join_code_norm_idx on public.lakads (public.normalize_join_code(join_code));
create index if not exists seat_locks_uid_idx on public.seat_locks (claimed_by_uid);

alter table public.lakads enable row level security;
alter table public.seat_locks enable row level security;

-- FIX: security definer so the policy check doesn't recurse lakads -> seat_locks -> lakads
create or replace function public.is_trip_member(trip public.lakads)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select trip.created_by = auth.uid()
    or exists (
      select 1
      from jsonb_array_elements(trip.payload->'members') as m
      where m->>'claimedByUid' = auth.uid()::text
    )
    or exists (
      select 1 from public.seat_locks sl
      where sl.trip_id = trip.id and sl.claimed_by_uid = auth.uid()
    );
$$;

drop policy if exists lakads_select on public.lakads;
create policy lakads_select on public.lakads
  for select to authenticated
  using (public.is_trip_member(lakads));

drop policy if exists lakads_insert on public.lakads;
create policy lakads_insert on public.lakads
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists lakads_update on public.lakads;
create policy lakads_update on public.lakads
  for update to authenticated
  using (public.is_trip_member(lakads))
  with check (public.is_trip_member(lakads));

drop policy if exists lakads_delete on public.lakads;
create policy lakads_delete on public.lakads
  for delete to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1
      from jsonb_array_elements(payload->'members') as m
      where m->>'id' = payload->>'treasurer'
        and m->>'claimedByUid' = auth.uid()::text
    )
  );

drop policy if exists seat_locks_select on public.seat_locks;
create policy seat_locks_select on public.seat_locks
  for select to authenticated
  using (exists (
    select 1 from public.lakads t
    where t.id = seat_locks.trip_id and public.is_trip_member(t)
  ));

-- FIX: no direct writes to seat_locks from the client. All changes go through
-- claim_seat / verify_seat_pin / reset_seat_lock (security definer), so a member
-- can't overwrite someone else's claim or PIN hash or reset attempt counters.
drop policy if exists seat_locks_upsert on public.seat_locks;

create or replace function public.get_lakad_by_join_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.lakads;
begin
  select * into v_trip
  from public.lakads
  where public.normalize_join_code(join_code) = public.normalize_join_code(p_code);
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'id', v_trip.id,
    'joinCode', v_trip.join_code,
    'name', v_trip.payload->>'name',
    'treasurer', v_trip.payload->>'treasurer',
    'open', coalesce((v_trip.payload->>'open')::boolean, false),
    'gcash', coalesce(v_trip.payload->>'gcash', ''),
    'members', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', m->>'id',
          'name', m->>'name',
          'gcash', coalesce(m->>'gcash', ''),
          'claimedByUid', m->>'claimedByUid'
        )
      )
      from jsonb_array_elements(v_trip.payload->'members') as m
    ), '[]'::jsonb)
  );
end;
$$;

-- FIX: pgcrypto lives in the "extensions" schema on Supabase
create or replace function public.pin_digest(p_trip_id text, p_member_id text, p_pin text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(extensions.digest(p_trip_id || ':' || p_member_id || ':' || p_pin, 'sha256'), 'hex');
$$;

create or replace function public.claim_seat(
  p_trip_id text,
  p_member_id text,
  p_name text default '',
  p_gcash text default '',
  p_pin text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_trip public.lakads;
  v_members jsonb;
  v_member jsonb;
  v_next_id text;
  v_uid text := auth.uid()::text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;

  -- FIX: lock the row so two people claiming at once don't overwrite each other
  select * into v_trip from public.lakads where id = p_trip_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'missing');
  end if;

  v_members := coalesce(v_trip.payload->'members', '[]'::jsonb);

  if p_member_id = 'new' then
    if coalesce((v_trip.payload->>'open')::boolean, false) is not true then
      return jsonb_build_object('ok', false, 'reason', 'closed');
    end if;
    if jsonb_array_length(v_members) >= 60 then
      return jsonb_build_object('ok', false, 'reason', 'max');
    end if;
    v_next_id := 'm' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
    v_member := jsonb_build_object(
      'id', v_next_id,
      'name', left(trim(p_name), 40),
      'gcash', left(trim(p_gcash), 30),
      'claimedByUid', v_uid
    );
    v_members := v_members || jsonb_build_array(v_member);
  else
    select value into v_member
    from jsonb_array_elements(v_members) as value
    where value->>'id' = p_member_id;
    if v_member is null then
      return jsonb_build_object('ok', false, 'reason', 'missing-seat');
    end if;
    if coalesce(v_member->>'claimedByUid', '') <> '' and v_member->>'claimedByUid' <> v_uid then
      return jsonb_build_object('ok', false, 'reason', 'locked');
    end if;
    v_member := v_member || jsonb_build_object(
      'gcash', case when length(trim(p_gcash)) > 0 then left(trim(p_gcash), 30) else coalesce(v_member->>'gcash', '') end,
      'claimedByUid', v_uid
    );
    v_members := (
      select jsonb_agg(case when value->>'id' = p_member_id then v_member else value end)
      from jsonb_array_elements(v_members) as value
    );
    v_next_id := p_member_id;
  end if;

  update public.lakads
  set payload = jsonb_set(v_trip.payload, '{members}', v_members),
      updated_at = now()
  where id = p_trip_id
  returning * into v_trip;

  insert into public.seat_locks (trip_id, member_id, claimed_by_uid, pin_hash, pin_attempts, updated_at)
  values (
    p_trip_id,
    v_next_id,
    auth.uid(),
    case when p_pin ~ '^\d{4}$' then public.pin_digest(p_trip_id, v_next_id, p_pin) else null end,
    0,
    now()
  )
  on conflict (trip_id, member_id) do update
    set claimed_by_uid = excluded.claimed_by_uid,
        pin_hash = coalesce(excluded.pin_hash, public.seat_locks.pin_hash),
        pin_attempts = 0,
        pin_locked_until = null,
        updated_at = now();

  return jsonb_build_object('ok', true, 'trip', v_trip.payload);
end;
$$;

create or replace function public.verify_seat_pin(p_trip_id text, p_member_id text, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_lock public.seat_locks;
  v_digest text;
begin
  if auth.uid() is null or p_pin !~ '^\d{4}$' then
    return false;
  end if;
  select * into v_lock from public.seat_locks
  where trip_id = p_trip_id and member_id = p_member_id
  for update;
  if not found or v_lock.pin_hash is null then
    return false;
  end if;
  if v_lock.pin_locked_until is not null and v_lock.pin_locked_until > now() then
    return false;
  end if;
  v_digest := public.pin_digest(p_trip_id, p_member_id, p_pin);
  if v_digest = v_lock.pin_hash then
    update public.seat_locks
    set claimed_by_uid = auth.uid(), pin_attempts = 0, pin_locked_until = null, updated_at = now()
    where trip_id = p_trip_id and member_id = p_member_id;
    update public.lakads
    set payload = jsonb_set(
      payload,
      '{members}',
      coalesce((
        select jsonb_agg(
          case
            when m->>'id' = p_member_id then jsonb_set(m, '{claimedByUid}', to_jsonb(auth.uid()::text))
            else m
          end
        )
        from jsonb_array_elements(payload->'members') as m
      ), '[]'::jsonb)
    ),
    updated_at = now()
    where id = p_trip_id;
    return true;
  end if;
  update public.seat_locks
  set pin_attempts = v_lock.pin_attempts + 1,
      pin_locked_until = case when v_lock.pin_attempts + 1 >= 8 then now() + interval '15 minutes' else null end,
      updated_at = now()
  where trip_id = p_trip_id and member_id = p_member_id;
  return false;
end;
$$;

create or replace function public.reset_seat_lock(p_trip_id text, p_member_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.lakads;
begin
  if auth.uid() is null then
    return false;
  end if;
  select * into v_trip from public.lakads where id = p_trip_id for update;
  if not found then
    return false;
  end if;
  if not exists (
    select 1
    from jsonb_array_elements(v_trip.payload->'members') as m
    where m->>'id' = v_trip.payload->>'treasurer'
      and m->>'claimedByUid' = auth.uid()::text
  ) and v_trip.created_by <> auth.uid() then
    return false;
  end if;
  delete from public.seat_locks where trip_id = p_trip_id and member_id = p_member_id;
  update public.lakads
  set payload = jsonb_set(
    payload,
    '{members}',
    coalesce((
      select jsonb_agg(
        case
          when m->>'id' = p_member_id then m - 'claimedByUid'
          else m
        end
      )
      from jsonb_array_elements(payload->'members') as m
    ), '[]'::jsonb)
  ),
  updated_at = now()
  where id = p_trip_id;
  return true;
end;
$$;

-- FIX: functions are executable by PUBLIC (incl. anon) by default; restrict to signed-in users
revoke execute on function public.get_lakad_by_join_code(text) from public;
revoke execute on function public.claim_seat(text, text, text, text, text) from public, anon;
revoke execute on function public.verify_seat_pin(text, text, text) from public, anon;
revoke execute on function public.reset_seat_lock(text, text) from public, anon;
grant execute on function public.get_lakad_by_join_code(text) to anon, authenticated;
grant execute on function public.claim_seat(text, text, text, text, text) to authenticated;
grant execute on function public.verify_seat_pin(text, text, text) to authenticated;
grant execute on function public.reset_seat_lock(text, text) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.lakads;
exception
  when duplicate_object then null;
end $$;
