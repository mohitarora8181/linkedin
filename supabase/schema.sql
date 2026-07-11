create table if not exists public.linkerin_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  user_email text not null,
  source_url text not null,
  item_type text not null check (item_type in ('job', 'post')),
  content jsonb,
  is_pending boolean not null default true,
  scrape_error text,
  author_name text,
  post_content text,
  job_title text,
  company_name text,
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.linkerin_items add column if not exists is_pending boolean not null default false;
alter table public.linkerin_items add column if not exists scrape_error text;
alter table public.linkerin_items add column if not exists author_name text;
alter table public.linkerin_items add column if not exists post_content text;
alter table public.linkerin_items add column if not exists job_title text;
alter table public.linkerin_items add column if not exists company_name text;
alter table public.linkerin_items add column if not exists location text;
alter table public.linkerin_items add column if not exists updated_at timestamptz not null default now();

update public.linkerin_items
set
  is_pending = coalesce(is_pending, false),
  author_name = content #>> '{author,name}',
  post_content = content ->> 'content',
  job_title = content ->> 'title',
  company_name = content #>> '{company,name}',
  location = content ->> 'location',
  updated_at = coalesce(updated_at, created_at)
where
  content is not null
  and (
    author_name is null
    or post_content is null
    or job_title is null
    or company_name is null
    or location is null
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
  on public.linkerin_items (user_id, created_at desc, id desc);

create unique index if not exists linkerin_items_user_source_url_idx
  on public.linkerin_items (user_id, source_url);

create index if not exists linkerin_items_pending_idx
  on public.linkerin_items (is_pending, created_at);

create index if not exists linkerin_items_post_search_idx
  on public.linkerin_items (user_id, item_type, author_name, post_content)
  where item_type = 'post';

create index if not exists linkerin_items_job_search_idx
  on public.linkerin_items (user_id, item_type, job_title, company_name, location)
  where item_type = 'job';

alter table public.linkerin_items add column if not exists ai_status text not null default 'idle' check (ai_status in ('idle', 'queued', 'completed', 'failed'));
alter table public.linkerin_items add column if not exists ai_error text;
alter table public.linkerin_items add column if not exists ai_mail jsonb;
alter table public.linkerin_items add column if not exists is_job_related boolean;
alter table public.linkerin_items add column if not exists recruiter_email text;
alter table public.linkerin_items add column if not exists ai_updated_at timestamptz;

create table if not exists public.linkerin_user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null,
  resume_summary jsonb not null,
  resume_file_name text,
  resume_mime_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists linkerin_user_profiles_user_id_idx
  on public.linkerin_user_profiles (user_id);

alter table public.linkerin_user_profiles enable row level security;

create policy "Users can read their LinkerIn profile"
  on public.linkerin_user_profiles
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their LinkerIn profile"
  on public.linkerin_user_profiles
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their LinkerIn profile"
  on public.linkerin_user_profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists linkerin_items_ai_status_idx
  on public.linkerin_items (ai_status, ai_updated_at);
