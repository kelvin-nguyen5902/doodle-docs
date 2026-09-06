-- Helper/trigger functions are only meant to run inside RLS policies / triggers,
-- not to be called directly as PostgREST RPC endpoints. Lock that down.

revoke execute on function public.is_document_owner(uuid) from public;
revoke execute on function public.has_document_access(uuid) from public;
revoke execute on function public.can_edit_document(uuid) from public;
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_document() from public;
revoke execute on function public.enforce_collaborator_update_rules() from public;

-- RLS policies run as the 'authenticated' role (via PostgREST), so that role still
-- needs EXECUTE on the three helper functions referenced in USING/WITH CHECK clauses.
grant execute on function public.is_document_owner(uuid) to authenticated;
grant execute on function public.has_document_access(uuid) to authenticated;
grant execute on function public.can_edit_document(uuid) to authenticated;
