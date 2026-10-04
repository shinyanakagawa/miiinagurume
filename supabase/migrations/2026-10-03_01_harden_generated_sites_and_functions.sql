-- generated_sites: 作成者本人だけが読める・書けるようにする
alter table public.generated_sites
  add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();

drop policy if exists "authenticated read generated_sites" on public.generated_sites;
drop policy if exists "authenticated insert generated_sites" on public.generated_sites;

create policy "owner read own generated_sites" on public.generated_sites
  for select to authenticated using (user_id = (select auth.uid()));
create policy "owner insert own generated_sites" on public.generated_sites
  for insert to authenticated with check (user_id = (select auth.uid()));

-- トリガー用関数をAPIから直接呼べないようにする（トリガーとしての動作は変わらない）
revoke execute on function public.protect_billing_columns() from public, anon, authenticated;

-- search_path を固定
alter function public.set_updated_at() set search_path = public, pg_temp;
