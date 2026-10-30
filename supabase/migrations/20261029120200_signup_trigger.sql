-- Every auth user gets a learner row (research_opt_in defaults to false).
-- security definer so the trigger can insert although nobody holds an INSERT
-- grant on learner; search_path is locked so nothing can be shadowed.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.learner (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
