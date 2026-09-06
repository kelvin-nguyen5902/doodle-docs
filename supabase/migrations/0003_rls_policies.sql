alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.document_collaborators enable row level security;
alter table public.document_drawings enable row level security;

-- profiles: readable by any authenticated user (search by username/email), writable only by self
create policy profiles_select_all on public.profiles for select to authenticated using (true);
create policy profiles_insert_self on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- documents
create policy documents_select on public.documents for select to authenticated
  using (public.has_document_access(id));
create policy documents_insert on public.documents for insert to authenticated
  with check (owner_id = auth.uid());
create policy documents_update on public.documents for update to authenticated
  using (public.can_edit_document(id)) with check (public.can_edit_document(id));
create policy documents_delete on public.documents for delete to authenticated
  using (public.is_document_owner(id));

-- document_collaborators
create policy collaborators_select on public.document_collaborators for select to authenticated
  using (public.is_document_owner(document_id) or user_id = auth.uid() or public.has_document_access(document_id));
create policy collaborators_insert on public.document_collaborators for insert to authenticated
  with check (public.is_document_owner(document_id));
create policy collaborators_update on public.document_collaborators for update to authenticated
  using (public.is_document_owner(document_id) or user_id = auth.uid())
  with check (public.is_document_owner(document_id) or user_id = auth.uid());
create policy collaborators_delete on public.document_collaborators for delete to authenticated
  using (public.is_document_owner(document_id));

-- document_drawings
create policy drawings_select on public.document_drawings for select to authenticated
  using (public.has_document_access(document_id));
create policy drawings_insert on public.document_drawings for insert to authenticated
  with check (public.is_document_owner(document_id));
create policy drawings_update on public.document_drawings for update to authenticated
  using (public.can_edit_document(document_id)) with check (public.can_edit_document(document_id));
create policy drawings_delete on public.document_drawings for delete to authenticated
  using (public.is_document_owner(document_id));
