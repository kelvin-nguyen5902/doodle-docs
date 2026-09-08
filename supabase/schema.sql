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
  content_ydoc bytea,
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
create index document_collaborators_invited_by_idx on public.document_collaborators(invited_by);

create table public.document_drawings (
  document_id uuid primary key references public.documents(id) on delete cascade,
  strokes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'full_name',
    new.email
  );
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_new_document()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.document_drawings (document_id) values (new.id);
  return new;
end; $$;

create trigger on_document_created
  after insert on public.documents
  for each row execute function public.handle_new_document();

create or replace function public.is_document_owner(doc_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists(select 1 from public.documents d where d.id = doc_id and d.owner_id = auth.uid());
$$;

create or replace function public.has_document_access(doc_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists(select 1 from public.documents d where d.id = doc_id and d.owner_id = auth.uid())
      or exists(select 1 from public.document_collaborators c
                where c.document_id = doc_id and c.user_id = auth.uid() and c.status = 'accepted');
$$;

create or replace function public.can_edit_document(doc_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists(select 1 from public.documents d where d.id = doc_id and d.owner_id = auth.uid())
      or exists(select 1 from public.document_collaborators c
                where c.document_id = doc_id and c.user_id = auth.uid()
                  and c.status = 'accepted' and c.role = 'editor');
$$;

create or replace function public.enforce_collaborator_update_rules()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_document_owner(new.document_id) then
    if new.role is distinct from old.role
       or new.document_id is distinct from old.document_id
       or new.user_id is distinct from old.user_id then
      raise exception 'not authorized to modify this field';
    end if;
  end if;
  return new;
end; $$;

create trigger document_collaborators_update_guard
  before update on public.document_collaborators
  for each row execute function public.enforce_collaborator_update_rules();

alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.document_collaborators enable row level security;
alter table public.document_drawings enable row level security;

create policy profiles_select_all on public.profiles for select to authenticated using (true);
create policy profiles_insert_self on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update_self on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy documents_select on public.documents for select to authenticated
  using (public.has_document_access(id));
create policy documents_insert on public.documents for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy documents_update on public.documents for update to authenticated
  using (public.can_edit_document(id)) with check (public.can_edit_document(id));
create policy documents_delete on public.documents for delete to authenticated
  using (public.is_document_owner(id));

create policy collaborators_select on public.document_collaborators for select to authenticated
  using (public.is_document_owner(document_id) or user_id = (select auth.uid()) or public.has_document_access(document_id));
create policy collaborators_insert on public.document_collaborators for insert to authenticated
  with check (public.is_document_owner(document_id));
create policy collaborators_update on public.document_collaborators for update to authenticated
  using (public.is_document_owner(document_id) or user_id = (select auth.uid()))
  with check (public.is_document_owner(document_id) or user_id = (select auth.uid()));
create policy collaborators_delete on public.document_collaborators for delete to authenticated
  using (public.is_document_owner(document_id));

create policy drawings_select on public.document_drawings for select to authenticated
  using (public.has_document_access(document_id));
create policy drawings_insert on public.document_drawings for insert to authenticated
  with check (public.is_document_owner(document_id));
create policy drawings_update on public.document_drawings for update to authenticated
  using (public.can_edit_document(document_id)) with check (public.can_edit_document(document_id));
create policy drawings_delete on public.document_drawings for delete to authenticated
  using (public.is_document_owner(document_id));

revoke execute on function public.is_document_owner(uuid) from public, anon, authenticated;
revoke execute on function public.has_document_access(uuid) from public, anon, authenticated;
revoke execute on function public.can_edit_document(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_new_document() from public, anon, authenticated;
revoke execute on function public.enforce_collaborator_update_rules() from public, anon, authenticated;

grant execute on function public.is_document_owner(uuid) to authenticated;
grant execute on function public.has_document_access(uuid) to authenticated;
grant execute on function public.can_edit_document(uuid) to authenticated;
