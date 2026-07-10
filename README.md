# TaskForge API

Express 5 + PostgreSQL backend for **TaskForge**, a team project-management
platform (a simplified Trello/Asana/Jira). This is the API the TaskForge React
frontend maps onto: JWT auth, role-based authorization, a normalized relational
schema, and a transactional drag-and-drop move endpoint.

## Stack

- **Express 5** with nested routers and `router.param()` for centralized 404s
- **PostgreSQL** with a normalized schema, enums, foreign-key cascade rules, and indexes
- **JWT** auth (`jsonwebtoken`) + **bcryptjs** password hashing
- Node's built-in test runner (`node:test`) with an 18-case end-to-end suite

## Layout

```
db/
  schema.sql        normalized schema (source of truth)
  client.js         shared pg Pool  (#db/client)
  users.js          auth + account queries
  orgs.js           organizations & memberships
  projects.js       projects & columns
  tasks.js          tasks, transactional move, analytics, search
  activity.js       comments, attachments, notifications
  reset.js / seed.js
middleware/
  auth.js           signToken, requireUser, requireOrgMember, requireRole
  requireBody.js    field-presence validation
  errorHandler.js   central handler w/ PG error-code mapping
routes/
  auth.js  orgs.js  projects.js  tasks.js  notifications.js
app.js  server.js
tests/api.test.js
```

Subpath imports (`#db/*`, `#middleware/*`, `#routes/*`) are declared in
`package.json` so modules import by role, not by relative path.

## Setup

```bash
npm install
# point DATABASE_URL at your instance in .env, then:
npm run db:reset   # apply schema.sql
npm run db:seed    # load demo org, users, projects, tasks
npm start          # http://localhost:3000
npm test           # 18 end-to-end tests
```

### Demo identities (password: `password123`)

| User          | Role   |
| ------------- | ------ |
| donna@…       | Owner  |
| marcus@…      | Admin  |
| priya@…       | Member |
| leo@…         | Viewer |

## Authorization model

Roles are ranked `viewer < member < admin < owner`. `requireOrgMember` resolves
the caller's membership from the `:orgId` param; `requireRole(min)` gates the
action. Reads are open to any member; creating/moving/editing tasks needs
**member**; managing projects and members needs **admin**; an **owner** cannot be
demoted or removed.

## REST API

All routes except `/auth/register`, `/auth/login`, and `/health` require
`Authorization: Bearer <token>`.

### Auth
```
POST   /auth/register        { name, email, password, color? } -> { user, token }
POST   /auth/login           { email, password }               -> { user, token }
GET    /auth/me
DELETE /auth/me              delete own account
```

### Organizations & members
```
POST   /orgs                          { name, slug }         (creator -> owner)
GET    /orgs/:orgId
GET    /orgs/:orgId/members
POST   /orgs/:orgId/members           { email, role? }       (admin+)
PATCH  /orgs/:orgId/members/:memberId { role }               (admin+)
DELETE /orgs/:orgId/members/:memberId                        (admin+)
```

### Projects, columns, analytics, search
```
GET    /orgs/:orgId/projects
POST   /orgs/:orgId/projects          { name, key, color? }  (admin+)
GET    /orgs/:orgId/projects/:projectId
GET    /orgs/:orgId/projects/:projectId/columns
GET    /orgs/:orgId/projects/analytics
GET    /orgs/:orgId/projects/search?q=
```

### Tasks (nested under a project)
```
GET    …/tasks?priority=&assigneeId=
POST   …/tasks                        { title, columnId, ... }   (member+)
GET    …/tasks/:taskId
PATCH  …/tasks/:taskId                 partial update            (member+)
POST   …/tasks/:taskId/move            { toColumnId, toPosition } (member+)
DELETE …/tasks/:taskId                                            (member+)
```

### Comments & attachments
```
GET    …/tasks/:taskId/comments
POST   …/tasks/:taskId/comments        { body }                 (member+)
GET    …/tasks/:taskId/attachments
POST   …/tasks/:taskId/attachments     { filename, sizeBytes }  (member+)
DELETE …/tasks/:taskId/attachments/:attId                       (member+)
```

### Notifications
```
GET    /notifications
PATCH  /notifications/read-all
PATCH  /notifications/:id/read
```

## Notes on design

- **`moveTask`** runs the reorder in a transaction with `SELECT … FOR UPDATE`,
  closing the gap in the source column and opening one at the target so
  positions stay contiguous under concurrent drags.
- **Error mapping** is centralized: `23505 → 409`, `23503/23502/22P02/23514 → 400`,
  so route handlers just `next(err)`.
- **Attachments** store metadata only (filename + size); binary storage is left
  to an object store in production.
