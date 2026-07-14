# TaskForge

**Full-stack team project management** — organizations, role-based membership, drag-and-drop Kanban boards, task comments and attachments, dashboard analytics, and in-app notifications. A simplified Trello / Asana / Jira built as a capstone project, in two independently runnable parts:

- **[`Capstone-Backend/`](Capstone-Backend/)** — an Express + PostgreSQL REST API with JWT authentication, role-based access control, a normalized relational schema, transactional drag-and-drop reordering, and a test suite that runs against a live database.
- **[`Capstone-Frontend/`](Capstone-Frontend/)** — a React + Vite single-page client wired directly to that API. No mock data: every screen reads and writes through real REST calls.

The through-line of the design: **every rule is enforced at the right layer.** The database constrains what can exist, the API constrains who can do what, and the UI merely reflects those rules back to the user — hidden buttons are a courtesy, never the security boundary.

![TaskForge dashboard](Capstone-Frontend/preview.png)

---

## Table of Contents

1. [MVP Features](#mvp-features)
2. [Tech Stack](#tech-stack)
3. [Repository Architecture](#repository-architecture)
4. [Getting Started](#getting-started)
5. [Demo Accounts](#demo-accounts)
6. [Scripts Reference](#scripts-reference)
7. [API Reference](#api-reference)
8. [Data Model](#data-model)
9. [Roles & Permissions](#roles--permissions)
10. [Backend Design Notes](#backend-design-notes)
11. [Frontend Design Notes](#frontend-design-notes)
12. [Testing](#testing)
13. [Design System](#design-system--drafting-sheet)
14. [Beyond the MVP](#beyond-the-mvp)

---

## MVP Features

**Authentication & accounts**
- Register and log in with email + password (bcrypt-hashed, never stored in plain text).
- Stateless JWT sessions (7-day expiry); a token for a deleted account is refused on the next request.
- Self-service account deletion.

**Organizations & membership**
- Every new account is auto-enrolled in a default workspace, so nobody lands in an empty app. The first account on a fresh database *founds* that workspace and owns it.
- Any user can create additional organizations (becoming their owner) and switch between them.
- Admins add members by email or user id, change roles, and remove members. Exactly one owner exists per org — the owner role can never be granted, changed, or removed.
- Org deletion is owner-only, requires typing the organization's name to confirm, and is refused if it would strand the caller with no workspace.

**Projects & Kanban boards**
- Projects per organization, each with a short key (e.g. `WEB`), a color, and ordered columns (`Backlog → In Progress → [Review / QA] → Done`).
- Tasks with title, description, priority (`low / medium / high / urgent`), assignee, and due date.
- Drag-and-drop between and within columns, persisted through a transactional reorder endpoint with optimistic UI on the client.
- Filtering by priority and assignee; org-wide task search from the top bar.

**Collaboration**
- Threaded comments per task.
- Attachment records per task (filename + size metadata; binary storage is intentionally out of scope for the MVP).
- Notifications that describe what actually changed: assignment, reassignment, priority/due-date/title/description edits, column moves, and new comments — and never notify the actor about their own action.

**Analytics dashboard**
- Task status and priority breakdowns per project.
- Weekly created-vs-completed activity (last 7 days).
- Monthly cumulative growth (last 6 months).
- Due-date calendar density for any month.

---

## Tech Stack

| Layer              | Technology                                                        |
| ------------------ | ----------------------------------------------------------------- |
| Runtime            | Node.js (native ES modules + subpath imports)                     |
| Backend framework  | Express 5                                                         |
| Database           | PostgreSQL via `pg` (connection pool, parameterized queries)      |
| Auth               | `jsonwebtoken` (JWT bearer tokens) + `bcryptjs` password hashing  |
| Config             | `dotenv` (`.env` → `PORT`, `DATABASE_URL`, `JWT_SECRET`)          |
| Backend testing    | `node:test` + Supertest, plus a Vitest suite                      |
| Frontend           | React 18 + Vite 5                                                 |
| Client state       | React Context + hooks (no external state library, no router — view switching is plain state) |
| Drag & drop        | Native HTML5 drag-and-drop events with optimistic updates         |
| Charts             | Recharts (bar, pie, area, line)                                   |
| Icons              | lucide-react                                                      |
| Styling            | Hand-rolled CSS design system (`src/styles.css`)                  |

---

## Repository Architecture

```
Capstone - TaskForge/
├── README.md                      ← you are here
├── index.html                     ← capstone portfolio landing page (static,
├── script.js                        separate from the app itself)
├── style.css
├── portfolio.css
│
├── Capstone-Backend/              ── REST API ──────────────────────────────
│   ├── server.js                  boot: loads .env, starts app on :3000
│   ├── app.js                     Express app: routers, /health, 404, errors
│   ├── package.json               "type": "module" + subpath imports
│   │                              (#app, #db/*, #middleware/*, #routes/*)
│   ├── .env                       PORT, DATABASE_URL, JWT_SECRET
│   ├── db/
│   │   ├── client.js              pg connection pool
│   │   ├── schema.sql             full DDL: tables, enums, indexes
│   │   ├── reset.js               drop + recreate schema   (npm run db:reset)
│   │   ├── seed.js                demo data with backdated timestamps
│   │   ├── seedData.js            people, projects, and ~100 seeded tasks
│   │   ├── users.js               user queries + password verification
│   │   ├── orgs.js                orgs, memberships, default-workspace logic
│   │   ├── projects.js            projects + columns
│   │   ├── tasks.js               task CRUD, transactional move, analytics
│   │   └── activity.js            comments, attachments, notifications
│   ├── middleware/
│   │   ├── auth.js                signToken, requireUser, requireOrgMember,
│   │   │                          requireRole (viewer < member < admin < owner)
│   │   ├── requireBody.js         declarative required-field validation
│   │   └── errorHandler.js        central handler; maps PG error codes → HTTP
│   ├── routes/
│   │   ├── auth.js                register (auto-join org), login, me, delete
│   │   ├── orgs.js                orgs, members, analytics; nests projects
│   │   ├── projects.js            projects, columns, search; nests tasks
│   │   ├── tasks.js               tasks, move, comments, attachments
│   │   └── notifications.js       per-user feed, mark read / read-all
│   └── test/
│       ├── api.test.js            node:test + Supertest integration suite
│       └── api.vitest.test.js     Vitest suite (auth, RBAC, isolation, CRUD)
│
└── Capstone-Frontend/             ── React SPA ─────────────────────────────
    ├── index.html                 entry document
    ├── vite.config.js             dev proxy: /auth, /orgs, /notifications → :3000
    ├── package.json
    └── src/
        ├── main.jsx               mounts <App />
        ├── App.jsx                session bootstrap (GET /auth/me), org
        │                          selection, view routing, app context
        ├── api.js                 fetch wrapper: JWT handling, typed ApiError,
        │                          one function per endpoint
        ├── context.js             AppCtx (React Context)
        ├── constants.js           role ranks, priorities, theme colors, helpers
        ├── styles.css             the entire design system
        └── views/
            ├── AuthGate.jsx       login / register with demo-account shortcuts
            ├── Sidebar.jsx        org switcher, project list, navigation
            ├── Topbar.jsx         global search, notification bell
            ├── Dashboard.jsx      Recharts analytics (bar / pie / area / line)
            ├── Board.jsx          Kanban board with HTML5 drag-and-drop
            ├── TaskDrawer.jsx     task detail: edit, comments, attachments
            ├── TeamView.jsx       member & role administration
            └── SettingsView.jsx   org settings, danger zone (delete org/account)
```

**Request flow, end to end:** a click in a view calls a function in `src/api.js` → the Vite proxy forwards it to Express → `requireUser` resolves the JWT to a live account → `requireOrgMember` / `requireRole` check membership and rank → a `router.param` loader 404s missing records and attaches them to `req` → the route handler calls a query function in `db/` → the central error handler translates anything thrown into a consistent JSON error shape.

---

## Getting Started

### Prerequisites

- **Node.js 20+** (the backend uses `node --watch` and the built-in `node:test` runner)
- **PostgreSQL 14+** running locally (or a connection string to a hosted instance)
- npm (ships with Node)

### 1. Set up the backend

```bash
cd Capstone-Backend
npm install
```

Create the database and configure the environment:

```bash
createdb taskforge          # or use an existing Postgres database
```

Edit `.env`:

```ini
PORT=3000
DATABASE_URL=postgres://<user>:<password>@localhost:5432/taskforge
JWT_SECRET=<any long random string>
```

> `JWT_SECRET` falls back to an insecure development default when unset, and the
> server refuses to boot without it when `NODE_ENV=production`.

Create the schema and load demo data, then start the server:

```bash
npm run db:reset            # applies db/schema.sql (drops + recreates everything)
npm run db:seed             # 11 users, 5 projects, ~100 tasks with realistic history
npm start                   # → TaskForge API listening on :3000
```

Sanity check: `curl http://localhost:3000/health` → `{"status":"ok"}`.

### 2. Set up the frontend

In a second terminal:

```bash
cd Capstone-Frontend
npm install
npm run dev                 # → http://localhost:5173
```

The Vite dev server proxies `/auth`, `/orgs`, and `/notifications` to the API on port 3000 (adjust `vite.config.js` if your API runs elsewhere), so the client can use relative URLs with no CORS setup.

### 3. Sign in

Open <http://localhost:5173> and use a demo account below, or register a fresh account — new registrations are automatically enrolled in the default workspace.

---

## Demo Accounts

All seeded accounts share the password **`password123`**.

| Name        | Email                  | Role   | What you can try                                  |
| ----------- | ---------------------- | ------ | ------------------------------------------------- |
| Donna Chen  | `donna@taskforge.io`   | Owner  | Everything, including org settings and deletion   |
| Marcus Reed | `marcus@taskforge.io`  | Admin  | Manage members and projects                       |
| Priya Nair  | `priya@taskforge.io`   | Member | Create, edit, move, and comment on tasks          |
| Leo Park    | `leo@taskforge.io`     | Viewer | Read-only: boards render, mutations are refused   |

The role changes what the UI permits — and every permission is enforced server-side by role-guarded routes, not just hidden buttons. Signing in as Leo and replaying a Priya request against the API will get you a `403`.

The seed also creates seven more teammates and five projects (`WEB`, `MOB`, `BPI`, `INF`, `RES`) with backdated activity so the dashboard charts have real shape on first load.

---

## Scripts Reference

**Backend** (`Capstone-Backend/`)

| Script                | What it does                                          |
| --------------------- | ----------------------------------------------------- |
| `npm start`           | Run the API (`node server.js`)                        |
| `npm run dev`         | Run with auto-reload (`node --watch`)                 |
| `npm run db:reset`    | Drop and recreate the schema from `db/schema.sql`     |
| `npm run db:seed`     | Load demo users, projects, tasks, and notifications   |
| `npm test`            | Run both test suites (node:test, then Vitest)         |
| `npm run test:node`   | Integration suite via the built-in `node --test`      |
| `npm run test:vitest` | Vitest suite                                          |

**Frontend** (`Capstone-Frontend/`)

| Script            | What it does                             |
| ----------------- | ---------------------------------------- |
| `npm run dev`     | Vite dev server with API proxy on :5173  |
| `npm run build`   | Production build to `dist/`              |
| `npm run preview` | Serve the production build locally       |
| `npm run lint`    | ESLint over `src/`                       |

---

## API Reference

All responses are JSON. Errors share one shape: `{ "error": "message" }`. Every route except `/health`, `/auth/register`, and `/auth/login` requires an `Authorization: Bearer <token>` header.

### Auth

| Method   | Path             | Access        | Description                                    |
| -------- | ---------------- | ------------- | ---------------------------------------------- |
| `POST`   | `/auth/register` | public        | Create account; auto-joins the default org     |
| `POST`   | `/auth/login`    | public        | Exchange email + password for a JWT            |
| `GET`    | `/auth/me`       | authenticated | The caller's own account                       |
| `DELETE` | `/auth/me`       | authenticated | Permanently delete the caller's account        |

### Organizations & members

| Method   | Path                            | Access | Description                                        |
| -------- | ------------------------------- | ------ | -------------------------------------------------- |
| `GET`    | `/orgs`                         | user   | Orgs the caller belongs to (with their role)       |
| `POST`   | `/orgs`                         | user   | Create an org; the caller becomes owner            |
| `GET`    | `/orgs/:orgId`                  | member | One org + the caller's role                        |
| `DELETE` | `/orgs/:orgId`                  | owner  | Delete (requires `confirm` = exact org name)       |
| `GET`    | `/orgs/:orgId/members`          | member | Member roster                                      |
| `GET`    | `/orgs/:orgId/assignable`       | admin  | Full assignee directory                            |
| `POST`   | `/orgs/:orgId/members`          | admin  | Add a member by `email` or `userId`                |
| `PATCH`  | `/orgs/:orgId/members/:memberId`| admin  | Change a member's role (owners are untouchable)    |
| `DELETE` | `/orgs/:orgId/members/:memberId`| admin  | Remove a member (owners are untouchable)           |

### Analytics & search

| Method | Path                                     | Access | Description                                  |
| ------ | ---------------------------------------- | ------ | -------------------------------------------- |
| `GET`  | `/orgs/:orgId/analytics/weekly`          | member | Created vs. completed, last 7 days           |
| `GET`  | `/orgs/:orgId/analytics/monthly`         | member | Cumulative totals, last 6 months             |
| `GET`  | `/orgs/:orgId/analytics/calendar?month=` | member | Due-date density for a month (`YYYY-MM`)     |
| `GET`  | `/orgs/:orgId/projects/analytics`        | member | Per-project status & priority breakdowns     |
| `GET`  | `/orgs/:orgId/projects/search?q=`        | member | Org-wide task search                         |

### Projects & tasks

| Method   | Path                                                | Access | Description                                     |
| -------- | --------------------------------------------------- | ------ | ----------------------------------------------- |
| `GET`    | `/orgs/:orgId/projects`                              | member | List projects                                   |
| `POST`   | `/orgs/:orgId/projects`                              | admin  | Create a project (`name`, `key`)                |
| `GET`    | `/orgs/:orgId/projects/:projectId`                   | member | One project                                     |
| `GET`    | `/orgs/:orgId/projects/:projectId/columns`           | member | Ordered board columns                           |
| `GET`    | `…/tasks?priority=&assigneeId=`                      | member | List tasks, optionally filtered                 |
| `POST`   | `…/tasks`                                            | member | Create a task (`title`, `columnId`, …)          |
| `GET`    | `…/tasks/:taskId`                                    | member | One task                                        |
| `PATCH`  | `…/tasks/:taskId`                                    | member | Edit fields; notifies the assignee              |
| `POST`   | `…/tasks/:taskId/move`                               | member | Drag-and-drop: `toColumnId` + `toPosition`      |
| `DELETE` | `…/tasks/:taskId`                                    | member | Delete a task                                   |
| `GET/POST` | `…/tasks/:taskId/comments`                         | member | Read / add comments                             |
| `GET/POST` | `…/tasks/:taskId/attachments`                      | member | Read / add attachment records                   |
| `DELETE` | `…/tasks/:taskId/attachments/:attId`                 | member | Remove an attachment record                     |

*(`…` = `/orgs/:orgId/projects/:projectId` — task routes are nested and inherit both parent ids via `mergeParams`. "member/admin/owner" means that role **or higher**; viewers can perform every `GET`.)*

### Notifications

| Method  | Path                       | Access | Description                     |
| ------- | -------------------------- | ------ | ------------------------------- |
| `GET`   | `/notifications`           | user   | The caller's own feed           |
| `PATCH` | `/notifications/:id/read`  | user   | Mark one read (owner only)      |
| `PATCH` | `/notifications/read-all`  | user   | Mark everything read            |

---

## Data Model

Nine tables in a normalized ownership graph, defined in [`db/schema.sql`](Capstone-Backend/db/schema.sql):

```
users ──< memberships >── organizations ──< projects ──< columns ──< tasks ──< comments
                                                                          └──< attachments
notifications >── users        (each notification targets one recipient)
```

- **Enums** enforce vocabulary at the database layer: `member_role` (`viewer | member | admin | owner`) and `task_priority` (`low | medium | high | urgent`).
- **`memberships`** is the join table carrying the role, with a `UNIQUE (org_id, user_id)` constraint — one row per person per org.
- **Deletes cascade downward** (dropping a project takes its columns, tasks, comments, and attachments with it) while **authorship survives**: `created_by`, `assignee_id`, and comment authors are `ON DELETE SET NULL`, so deleting an account never destroys the team's work.
- **Indexes target the hot read paths**: board load (`columns`/`tasks` by position), task detail (comments, attachments), and the notification bell (`user_id, is_read, created_at DESC`).

---

## Roles & Permissions

Roles are ranked `viewer < member < admin < owner`, and every guard admits the named role **and everything above it**.

| Action                                  | Owner | Admin | Member | Viewer |
| --------------------------------------- | :---: | :---: | :----: | :----: |
| View boards, tasks, members, analytics  |  ✅   |  ✅   |   ✅   |   ✅   |
| Create / edit / move / delete tasks     |  ✅   |  ✅   |   ✅   |   ❌   |
| Comment and attach files                |  ✅   |  ✅   |   ✅   |   ❌   |
| Create projects                         |  ✅   |  ✅   |   ❌   |   ❌   |
| Add / remove members, change roles      |  ✅   |  ✅   |   ❌   |   ❌   |
| Enumerate the assignee directory        |  ✅   |  ✅   |   ❌   |   ❌   |
| Delete the organization                 |  ✅   |  ❌   |   ❌   |   ❌   |

Special rules: there is exactly one owner per org, seated at creation; the owner role can never be granted, changed, or removed through the API; and tasks may only be assigned to members of the same organization (a `422` otherwise) so no notification can leak a task title into a foreign org.

---

## Backend Design Notes

**ES modules with subpath imports.** `package.json` maps `#app`, `#db/*`, `#middleware/*`, and `#routes/*`, so internal imports read as `import { requireUser } from "#middleware/auth"` — no `../../..` chains, and moving a file never breaks its consumers.

**Nested routers with `mergeParams`.** Tasks mount under projects, projects under orgs. `:orgId` and `:projectId` flow down the chain, so a task handler can scope its queries by both without re-parsing the URL.

**`router.param` loaders.** Each id segment (`orgId`, `projectId`, `taskId`) has one loader that 404s missing records, verifies the record belongs to its parent (`project.org_id === :orgId`, `task.project_id === :projectId`), and attaches it to `req`. Handlers never re-fetch or re-check existence — and a valid task id from another org's project is indistinguishable from a nonexistent one.

**Auth precedes existence.** `requireUser` and `requireOrgMember` run before any record loading, so unauthenticated callers can't probe which resources exist.

**Transactional drag-and-drop.** `moveTask` runs inside a transaction with `SELECT … FOR UPDATE`: it closes the gap in the source column, opens one at the target position, and drops the task in. Both columns keep contiguous positions `0..n-1` — no gaps, no duplicates, even under concurrent moves.

**Central error handling.** Route handlers stay thin and `next(err)`; one handler maps PostgreSQL error codes to HTTP (`23505` unique violation → `409`, `23503`/`23502`/`22P02`/`23514` → `400`) and hides PG's column-echoing `detail` field in production.

**Notifications with editorial judgment.** The PATCH handler diffs before/after and describes what actually changed (`priority → urgent`, `due 2026-07-20`, `title`), reassignment tells both the new and previous assignee, and no one is ever notified about their own action.

**Security posture.** Parameterized queries everywhere (no string interpolation). Cross-org isolation is enforced at the query and loader level, not the UI. Passwords are bcrypt-hashed; login failures don't reveal whether the email exists; `password_hash` is stripped before any user object leaves the API.

---

## Frontend Design Notes

**No router, no state library — deliberately.** `App.jsx` boots the session (`GET /auth/me`), loads the caller's orgs, restores the last-used workspace from `localStorage`, and exposes everything through a single `AppCtx` context: identity, active org, role-check helper (`can("member")`), view switching, and a `refresh()` version counter that dependent views watch to refetch.

**One API surface.** `src/api.js` is the only file that touches `fetch`. It carries the JWT (memory + `localStorage`), serializes JSON, and throws a typed `ApiError` with the HTTP status so views can react per-status (e.g. treat a `403` differently from a `500`).

**Optimistic drag-and-drop.** The Kanban board uses native HTML5 drag events. On drop, the card moves in local state immediately, then the `move` endpoint persists it; on failure, the board refetches to reconcile. Same pattern the API's contiguous-position model expects.

**Charts from real aggregates.** The dashboard renders Recharts bar, pie, area, and line charts fed by the API's SQL aggregation endpoints — nothing is computed client-side from a task dump.

**Role-aware UI.** The `can(minRole)` helper hides controls the caller can't use — but that's presentation, not protection. Every mutation is re-checked server-side.

---

## Testing

```bash
cd Capstone-Backend
npm test
```

Two complementary suites run against a live PostgreSQL database (reset your data with `npm run db:reset && npm run db:seed` afterwards if you care about it):

- **`test/api.test.js`** — integration tests on the built-in `node:test` runner with Supertest: auth flows, RBAC boundaries (each role tried against each guard), cross-org isolation, CRUD, and the move endpoint's position invariants.
- **`test/api.vitest.test.js`** — a Vitest suite covering the same API through a second runner.

The suites exercise the API the way a hostile client would — replaying viewer tokens against member endpoints, reaching for records across org boundaries, and confirming both the status code and the error shape.

---

## Design System — "Drafting Sheet"

An editorial, ledger-inspired aesthetic carried through every chart and piece of UI chrome, implemented entirely in [`src/styles.css`](Capstone-Frontend/src/styles.css):

- **Accent:** terracotta `#C4623D`
- **Background:** warm paper `#F4EFE6`
- **Type stack:** Fraunces (display) · Inter (body) · IBM Plex Mono (data & code)

Seeded users and projects each carry a color from the same palette, so avatars, project dots, and chart series stay coherent without any per-component color logic.

---

## Beyond the MVP

Natural next steps, roughly in order of value:

- **Real file storage** for attachments (S3-style presigned uploads; the metadata model is already in place).
- **Live updates** — WebSocket or SSE fan-out so a teammate's drag shows up without a refresh.
- **Column management UI** — the schema and API model ordered columns; the UI currently renders the seeded set.
- **Ownership transfer** — the single-owner invariant is enforced; transferring it is the missing admin flow.
- **Rate limiting and refresh tokens** for production hardening.

---

*Built by Donna Chen as a full-stack capstone project. The backend and frontend live in this folder as sibling apps (`Capstone-Backend/`, `Capstone-Frontend/`), each with its own `package.json` and git history.*
