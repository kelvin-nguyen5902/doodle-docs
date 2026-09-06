create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  full_name text,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'Untitled document',
  content_html text not null default '<h1>Untitled document</h1><p></p>',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_owner_id_idx on public.documents(owner_id);

create table public.document_collaborators (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'editor' check (role in ('editor','viewer')),
  status text not null default 'pending' check (status in ('pending','accepted')),
  invited_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (document_id, user_id)
);
create index document_collaborators_document_id_idx on public.document_collaborators(document_id);
create index document_collaborators_user_id_idx on public.document_collaborators(user_id);

create table public.document_drawings (
  document_id uuid primary key references public.documents(id) on delete cascade,
  strokes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
