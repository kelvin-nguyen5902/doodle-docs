-- Supabase's default privileges grant EXECUTE directly to anon/authenticated on
-- function creation (separate from the PUBLIC grant), so revoke from those roles
-- explicitly too.

revoke execute on function public.is_document_owner(uuid) from anon, authenticated;
revoke execute on function public.has_document_access(uuid) from anon, authenticated;
revoke execute on function public.can_edit_document(uuid) from anon, authenticated;
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.handle_new_document() from anon, authenticated;
revoke execute on function public.enforce_collaborator_update_rules() from anon, authenticated;

-- RLS policies run as 'authenticated' (via PostgREST) and reference these three
-- helper functions in USING/WITH CHECK clauses, so that role needs EXECUTE back.
grant execute on function public.is_document_owner(uuid) to authenticated;
grant execute on function public.has_document_access(uuid) to authenticated;
grant execute on function public.can_edit_document(uuid) to authenticated;
