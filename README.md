# TaskForge — Frontend

React + Vite client for TaskForge, a team project-management app: organizations,
members with roles, kanban boards with drag-and-drop, task comments and
attachments, dashboard analytics, and notifications. It talks to the Express +
PostgreSQL API in `../taskforge-backend` — no mock data; every screen reads and
writes through real REST calls with a JWT held in `localStorage`.

# TaskForge — Tech Stack & Architecture

A full-stack project management application (Kanban boards, task tracking, team & organization management, analytics) in the style of Trello / Asana / Jira.

---

## Overview

| Layer             | Technology                                |
| ----------------- | ----------------------------------------- |
| Runtime           | Node.js (ES modules)                      |
| Backend framework | Express 5                                 |
| Database          | PostgreSQL                                |
| Auth              | JWT + bcryptjs, role-based access control |
| Frontend          | React 18 + Vite                           |
| Routing (client)  | React Router 6                            |
| Drag & drop       | @hello-pangea/dnd                         |
| Charts            | Recharts                                  |

---

## Backend

### Runtime & Module System

- **Node.js with native ES modules**
- **Subpath imports** for clean internal resolution:
  - `#db/*` — database client and queries
  - `#middleware/*` — auth, validation, error handling
  - `#routes/*` — Express routers

### Framework — Express 5

- **Nested routers with `mergeParams: true`** — resources like tasks mount under boards, boards under organizations, with parent params flowing down.
- **`router.param()` middleware** — centralizes 404 handling and attaches the loaded record to `req`, so route handlers never re-fetch or re-check existence.
- **`requireBody` validation middleware** — declarative required-field checks before handlers run.
- **Central error handler** — maps PostgreSQL error codes (e.g. `23505` unique violation, `23503` foreign key violation) to appropriate HTTP responses.
- **Route ordering discipline** — auth checks before existence checks to avoid information leakage.

### Database — PostgreSQL

- **Parameterized queries** throughout (no string interpolation).
- **Transactions with `SELECT ... FOR UPDATE`** for operations requiring row-level locking (e.g. fractional position reordering, org membership changes).
- **Cross-organization data isolation** enforced at the query level; JOINs scoped by organization to prevent leakage between tenants.

### Authentication & Authorization

- **bcryptjs** for password hashing.
- **JWT** bearer tokens for stateless session auth.
- **RBAC hierarchy:** `owner > admin > member > viewer`, enforced in middleware with role-comparison guards (verified via mutation testing).

### Organization Features

- Auto-join organization on registration
- Organization switching
- Assign-to-org flows
- Org deletion with typed confirmation and safe member adoption

## Frontend

### Core

- **React 18** bootstrapped with **Vite**
- **React Router 6** for client-side routing

### Key Libraries

- **@hello-pangea/dnd** — drag-and-drop Kanban board with **fractional positioning** (cards get positions like 1.5 between 1 and 2, avoiding full-column renumbering on every move).
- **Recharts** — analytics dashboard:
  - Weekly activity grouped bar chart
  - Monthly growth composed chart

### Component Surface

- `Board.jsx` — Kanban columns and drag-and-drop
- `TaskDrawer.jsx` — task detail panel
- `Topbar.jsx` / `Sidebar.jsx` — navigation and org switching
- `Dashboard.jsx` — analytics charts
- `TeamView.jsx` — member management with role hierarchy enforcement and inline confirmation flows

### Design System — "Drafting Sheet"

- **Accent:** terracotta `#C4623D`
- **Background:** warm paper `#F4EFE6`
- **Type stack:** Fraunces (display) / Inter (body) / IBM Plex Mono (data & code)
- Editorial, ledger-inspired aesthetic carried through charts and UI chrome

---

## Engineering Practices

- End-to-end verification against a **live database** rather than assumed behavior
- **Integration bug detection** by cross-referencing API response shapes against component expectations
- **Mutation testing** applied to security guard middleware
- Growing test suite covering auth, RBAC, org isolation, and CRUD flows
- Security-first review cadence — two cross-org isolation vulnerabilities and an org-deletion regression identified and patched

- **React 18** (hooks + Context API for app state)
- **Vite 5** (dev server proxies `/auth`, `/orgs`, `/notifications` to the API on `:3000`)
- **Recharts** — dashboard charts (status, priority, weekly activity, monthly growth)
- **lucide-react** — icons
- Hand-rolled CSS (`src/styles.css`), no framework

# TaskForge — full-stack team project management

This platform uses relational data modeling, SQL (joins, aggregates, CTEs, transactions, locking), REST API design, Express middleware architecture, JWT auth + bcrypt, role-based authorization and multi-tenant isolation, centralized error handling, React with Context/hooks, optimistic UI and drag-and-drop, client-side API abstraction, data visualization with Recharts, seeding/demo-data engineering, API testing, and environment-based configuration.

The through-line that makes it a good capstone: every rule is enforced at the right layer — the database constrains what can exist, the API constrains who can do what, and the UI merely reflects those rules back to the user.

# Tech Stack

Frontend
React 19
React Router
Context API
Redux Toolkit
Chart.js
React Hook Form
Tailwind CSS
Framer Motion

Backend
Express.js
Node.js
PostgreSQL
JWT Authentication
bcrypt
Socket.io (notifications)
Database

A simplified Trello/Asana/Jira in two parts:

- **taskforge-backend/** — Express 5 + PostgreSQL REST API (JWT auth, RBAC,
  normalized schema, transactional drag-and-drop, 18-test suite).
- **taskforge-frontend/** — React + Vite frontend wired to that API (no mock data).

## Quick start

```bash
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

## Scripts

```bash
npm run dev       # Vite dev server with API proxy
npm run build     # production build to dist/
npm run preview   # serve the production build
npm run lint      # eslint over src/
```

## Layout

```
index.html            entry document
src/main.jsx          mounts <App />
src/App.jsx           session boot, org selection, view routing, app context
src/api.js            fetch wrapper + typed ApiError, JWT handling, all endpoints
src/constants.js      theme colors, roles, priorities, small format helpers
src/styles.css        all styling
src/views/            AuthGate, Sidebar, Topbar, Dashboard, Board, TaskDrawer,
                      TeamView, SettingsView
```

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
