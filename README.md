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
