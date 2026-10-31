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
      'claimedByUid', v_uid,
      'joinedAt', (extract(epoch from clock_timestamp()) * 1000)::bigint
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
