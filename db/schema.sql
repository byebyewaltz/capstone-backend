-- ============================================================================
--  TaskForge schema
--  A normalized relational model for a team project-management platform.
--  Ownership graph:  users ─< memberships >─ organizations ─< projects
--                    projects ─< columns ─< tasks ─< (comments | attachments)
--  Notifications fan out to a single recipient user.
-- ============================================================================

DROP TABLE IF EXISTS notifications  CASCADE;
DROP TABLE IF EXISTS attachments    CASCADE;
DROP TABLE IF EXISTS comments       CASCADE;
DROP TABLE IF EXISTS tasks          CASCADE;
DROP TABLE IF EXISTS columns        CASCADE;
DROP TABLE IF EXISTS projects       CASCADE;
DROP TABLE IF EXISTS memberships    CASCADE;
DROP TABLE IF EXISTS organizations  CASCADE;
DROP TABLE IF EXISTS users          CASCADE;

DROP TYPE IF EXISTS member_role     CASCADE;
DROP TYPE IF EXISTS task_priority   CASCADE;

-- Roles are ordered by privilege; guards compare rank in application code.
CREATE TYPE member_role   AS ENUM ('viewer', 'member', 'admin', 'owner');
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');

-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  color         TEXT NOT NULL DEFAULT '#C4623D',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
CREATE TABLE organizations (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Join table carrying the role. One row per (user, org).
CREATE TABLE memberships (
  id      SERIAL PRIMARY KEY,
  org_id  INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  role    member_role NOT NULL DEFAULT 'member',
  UNIQUE (org_id, user_id)
);

-- ---------------------------------------------------------------------------
CREATE TABLE projects (
  id      SERIAL PRIMARY KEY,
  org_id  INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name    TEXT NOT NULL,
  key     TEXT NOT NULL,               -- short prefix, e.g. WEB
  color   TEXT NOT NULL DEFAULT '#5B7B9A',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, key)
);

CREATE TABLE columns (
  id         SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
CREATE TABLE tasks (
  id          SERIAL PRIMARY KEY,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  column_id   INTEGER NOT NULL REFERENCES columns(id)  ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority    task_priority NOT NULL DEFAULT 'medium',
  assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_date    DATE,
  position    INTEGER NOT NULL DEFAULT 0,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE comments (
  id         SERIAL PRIMARY KEY,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE attachments (
  id         SERIAL PRIMARY KEY,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  filename   TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  task_id    INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  is_read    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Indexes for the hot read paths (board load, task detail, notif bell).
CREATE INDEX idx_memberships_user   ON memberships (user_id);
CREATE INDEX idx_projects_org       ON projects (org_id);
CREATE INDEX idx_columns_project    ON columns (project_id, position);
CREATE INDEX idx_tasks_column       ON tasks (column_id, position);
CREATE INDEX idx_tasks_project      ON tasks (project_id);
CREATE INDEX idx_tasks_assignee     ON tasks (assignee_id);
CREATE INDEX idx_comments_task      ON comments (task_id, created_at);
CREATE INDEX idx_attachments_task   ON attachments (task_id);
CREATE INDEX idx_notifs_user        ON notifications (user_id, is_read, created_at DESC);
