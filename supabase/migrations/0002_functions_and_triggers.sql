-- auto-provision profile on signup (username/full_name from supabase.auth.signUp options.data)
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

-- auto-create the matching drawings row so Flask never has to do a second insert
create or replace function public.handle_new_document()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.document_drawings (document_id) values (new.id);
  return new;
end; $$;

create trigger on_document_created
  after insert on public.documents
  for each row execute function public.handle_new_document();

-- RLS helper functions (security definer avoids policy-recursion issues)
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

-- guard: only the owner may change role/document_id/user_id on a collaborator row;
-- the invited user may only flip status pending -> accepted via this same row
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
