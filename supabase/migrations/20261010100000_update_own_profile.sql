-- Allow an authenticated user to update only their own profile name.
-- The function is SECURITY DEFINER so table write access remains restricted.

create function public.update_my_profile(p_full_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_full_name text := btrim(p_full_name);
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  if v_full_name is null or char_length(v_full_name) < 2 or char_length(v_full_name) > 100 then
    raise exception using errcode = '22023', message = 'Name must be between 2 and 100 characters';
  end if;

  update public.profiles
     set full_name = v_full_name,
         updated_at = now()
   where id = v_user_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Profile not found';
  end if;
end;
$$;

revoke all on function public.update_my_profile(text) from public;
grant execute on function public.update_my_profile(text) to authenticated;
