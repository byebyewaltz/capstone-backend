# TaskForge

Team project-management API: organizations, members with roles, kanban
project boards, tasks with drag-and-drop ordering, comments, attachments,
and notifications.

# TaskForge — full-stack team project management

A simplified Trello/Asana/Jira in two parts:

- **taskforge-api/** — Express 5 + PostgreSQL REST API (JWT auth, RBAC,
  normalized schema, transactional drag-and-drop, 18-test suite).
- **taskforge-web/** — React + Vite frontend wired to that API (no mock data).

## Quick start

```bash
# 1. Backend
cd taskforge-api
npm install
# edit .env -> DATABASE_URL for your Postgres, then:
npm run db:reset && npm run db:seed
npm start                      # http://localhost:3000
npm test                       # 18 passing

# 2. Frontend (new terminal)
cd taskforge-web
npm install
npm run dev                    # http://localhost:5173
```

Sign in with a demo identity (password `password123`):
Donna = owner, Marcus = admin, Priya = member, Leo = viewer. The role changes
what the UI permits, enforced server-side by role-guarded routes.

See each folder's README for endpoint reference and architecture notes.

## Setup

```bash
npm install
cp .env.example .env    # set DATABASE_URL and JWT_SECRET
npm run db:reset        # apply db/schema.sql
npm run db:seed         # optional demo data
npm start               # serve on :3000 (or PORT)
```

## Tests

Both suites run against the database in `DATABASE_URL` and reset it.

```bash
npm test              # runs both suites
npm run test:node     # node:test suite (resets + seeds, then exercises the API)
npm run test:vitest   # vitest + supertest suite (applies schema, builds its own data)
```

## Layout

```
app.js            express app: /health, /auth, /orgs, /notifications, 404, errors
server.js         boots the app
db/               pg pool, schema, reset/seed scripts, query layer per domain
middleware/       auth (JWT + role guards), requireBody, central error handler
routes/           auth, orgs (nests projects, which nest tasks), notifications
test/             api.test.js (node:test), api.vitest.test.js (vitest)
```

## Roles

`viewer < member < admin < owner`. Viewers read; members manage tasks,
comments, and attachments; admins manage projects and members; the owner
(exactly one, seated at org creation) can delete the org.
