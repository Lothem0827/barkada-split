-- Join links are opened before a session exists. The lookup function is
-- security definer and only returns a public preview, so anon can call it.
grant execute on function public.get_lakad_by_join_code(text) to anon;
