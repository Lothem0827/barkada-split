-- Force created_by to the live JWT so a stale client uid cannot fail RLS.
create or replace function public.lakads_bind_created_by()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if TG_OP = 'INSERT' then
    NEW.created_by := auth.uid();
  else
    NEW.created_by := OLD.created_by;
  end if;
  return NEW;
end;
$$;

drop trigger if exists lakads_bind_created_by on public.lakads;
create trigger lakads_bind_created_by
  before insert or update on public.lakads
  for each row
  execute function public.lakads_bind_created_by();
