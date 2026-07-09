create table if not exists public.linkerin_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  user_email text not null,
  source_url text not null,
  item_type text not null check (item_type in ('job', 'post')),
  content jsonb,
  created_at timestamptz not null default now()
);

alter table public.linkerin_items enable row level security;

create policy "Users can read their LinkerIn items"
  on public.linkerin_items
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their LinkerIn items"
  on public.linkerin_items
  for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their LinkerIn items"
  on public.linkerin_items
  for delete
  using (auth.uid() = user_id);

create index if not exists linkerin_items_user_created_at_idx
  on public.linkerin_items (user_id, created_at desc);

create unique index if not exists linkerin_items_user_source_url_idx
  on public.linkerin_items (user_id, source_url);
