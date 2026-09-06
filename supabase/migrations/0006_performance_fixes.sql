-- missing covering index on a foreign key
create index document_collaborators_invited_by_idx on public.document_collaborators(invited_by);

-- wrap auth.uid() as (select auth.uid()) so Postgres evaluates it once per
-- query instead of once per row (Supabase RLS performance recommendation)
alter policy profiles_insert_self on public.profiles
  with check (id = (select auth.uid()));

alter policy profiles_update_self on public.profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy documents_insert on public.documents
  with check (owner_id = (select auth.uid()));

alter policy collaborators_select on public.document_collaborators
  using (public.is_document_owner(document_id) or user_id = (select auth.uid()) or public.has_document_access(document_id));

alter policy collaborators_update on public.document_collaborators
  using (public.is_document_owner(document_id) or user_id = (select auth.uid()))
  with check (public.is_document_owner(document_id) or user_id = (select auth.uid()));
