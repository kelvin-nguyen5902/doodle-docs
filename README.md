# Doodle Docs

A full-stack document collaboration app with live text editing and drawing.

**Live app:** https://doodle-docs-rho.vercel.app/

## Features

- Real time collaborative text editing and drawing
- Text editing features such as bold, underline, italics, font size, font colour
- Drawing features such as stroke colours, eraser, stroke delete, and adjustable brush size
- Live presence: see who else is viewing a document and where their cursor is
- Dashboard listing documents with live preview of documents
- Document sharing via invitations, with accept/decline and pending invite tracking
- Account signup/login with either username or email, with password reset
- Account settings to edit name/username, signout, change your password, or delete your account
- Document title editing and deletion
- Limits on document count, text length, title length, and drawing amounts for storage limit purposes

## Technical features

- Live updates with Socket.IO (Websockets)
- Text editing synchronisation built on Yjs CRDT (via pycrdt on the backend), so concurrent text edits merge without lost data
- Drawing strokes are appended rather than replacing the full stroke list, so concurrent drawings merge without lost data where whoever's drawing started more recently ends up on top
- Row Level Security policies in Postgres enforce document access at the database layer, in addition to backend authorisation checks
- IP and account scoped rate limiting on signup, login, and password reset endpoints
- JWT-based authentication via Supabase

## Running locally

The app uses Supabase for its database and authentication. To setup your own Supabase project:

1. Create a project at https://supabase.com .
2. Open the SQL Editor and copy and paste contents from supabase/schema.sql
3. Under Authentication > Providers > Email, turn Confirm email off.
4. Under Authentication > URL Configuration > Site URL, change to `http://localhost:5173`
5. Under Authentication > URL Configuration > Redirect URLs, add `http://localhost:5173/reset-password`

After setting up your Supabase project, create a backend/.env file as specified in
backend/.env.example. Then, from the root folder, run:

```bash
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend: http://localhost:5001

To stop and remove the containers, run:

```bash
docker compose down
```

## Tech stack

- **Frontend**: React, TypeScript + Vite, Tiptap, socket.io-client
- **Backend**: Flask + Flask-SocketIO, Yjs
- **Database**: Supabase (Postgres)
