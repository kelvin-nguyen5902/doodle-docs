-- New source of truth for collaborative text sync (Yjs CRDT state). Nullable,
-- no backfill: existing documents are lazily migrated the first time they're
-- opened under the new sync path (see yjs_service.py / sockets.py yjs_seed
-- handling) by parsing their existing content_html into an initial Y.Doc.
-- content_html itself is kept as a derived, denormalized snapshot — regenerated
-- from the live Y.Doc on each checkpoint — purely for the dashboard preview.
alter table public.documents add column content_ydoc bytea;
