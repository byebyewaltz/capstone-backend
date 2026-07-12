# TaskForge — Frontend

React + Vite client for TaskForge, a team project-management app: organizations,
members with roles, kanban boards with drag-and-drop, task comments and
attachments, dashboard analytics, and notifications. It talks to the Express +
PostgreSQL API in `../taskforge-backend` — no mock data; every screen reads and
writes through real REST calls with a JWT held in `localStorage`.

## Tech stack

- **React 18** (hooks + Context API for app state)
- **Vite 5** (dev server proxies `/auth`, `/orgs`, `/notifications` to the API on `:3000`)
- **Recharts** — dashboard charts (status, priority, weekly activity, monthly growth)
- **lucide-react** — icons
- Hand-rolled CSS (`src/styles.css`), no framework
  
# TaskForge — full-stack team project management

Use relational data modeling, SQL (joins, aggregates, CTEs, transactions, locking), REST API design, Express middleware architecture, JWT auth + bcrypt, role-based authorization and multi-tenant isolation, centralized error handling, React with Context/hooks, optimistic UI and drag-and-drop, client-side API abstraction, data visualization with Recharts, seeding/demo-data engineering, API testing, and environment-based configuration.

The through-line that makes it a good capstone: every rule is enforced at the right layer — the database constrains what can exist, the API constrains who can do what, and the UI merely reflects those rules back to the user.

A simplified Trello/Asana/Jira in two parts:

- **taskforge-backend/** — Express 5 + PostgreSQL REST API (JWT auth, RBAC,
  normalized schema, transactional drag-and-drop, 18-test suite).
- **taskforge-frontend/** — React + Vite frontend wired to that API (no mock data).
>>>>>>> 0a14dcffb652a1190ef0b386d38a6bd629300385

## Quick start
```
# 1. Backend (see ../taskforge-backend/README.md)
cd taskforge-backend
npm install
# edit .env -> DATABASE_URL for your Postgres, then:
npm run db:reset && npm run db:seed
npm start                      # http://localhost:3000

# 2. Frontend (new terminal)
cd Capstone-Frontend
npm install
npm run dev                    # http://localhost:5173
```

Sign in with a demo identity (password `password123`):
Donna = owner, Marcus = admin, Priya = member, Leo = viewer. The role changes
what the UI permits, enforced server-side by role-guarded routes.

## Roles

`viewer < member < admin < owner`. Viewers read; members manage tasks,
comments, and attachments; admins manage projects and members; the owner
(exactly one, seated at org creation) has full control.

| Action              | Owner | Admin | Member | Viewer |
| ------------------- | ----- | ----- | ------ | ------ |
| Create organization | ✅    | ✅    | ❌     | ❌     |
| Manage members      | ✅    | ✅    | ❌     | ❌     |
| Create projects     | ✅    | ✅    | ❌     | ❌     |
| Create / edit tasks | ✅    | ✅    | ✅     | ❌     |
| View boards         | ✅    | ✅    | ✅     | ✅     |
