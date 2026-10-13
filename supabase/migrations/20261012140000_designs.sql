create table public.designs (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 250),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index designs_owner_updated on public.designs(owner_id, updated_at desc);
alter table public.designs enable row level security;
grant select, insert, update, delete on public.designs to authenticated;
revoke all on public.designs from anon;
create policy "Owners read their designs" on public.designs for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Owners create their designs" on public.designs for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "Owners update their designs" on public.designs for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "Owners delete their designs" on public.designs for delete to authenticated using ((select auth.uid()) = owner_id);

-- Uploaded images travel inside the design document as embedded image data.
-- This keeps imported/exported designs portable and covered by the same owner policy.
