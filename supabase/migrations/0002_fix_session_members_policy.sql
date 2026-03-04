drop policy if exists members_select_member on public.session_members;

create policy members_select_member
  on public.session_members
  for select
  using (true);