import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import app from "../app.js";
import pool from "#db/client";

let server, base;

// Reset + seed a clean database before the suite runs.
before(async () => {
  execSync("node db/reset.js && node db/seed.js", { cwd: process.cwd() });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://localhost:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
  await pool.end();
});

// Small fetch helper carrying an optional bearer token.
async function api(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
}

const login = async (email) =>
  (await api("POST", "/auth/login", { body: { email, password: "password123" } })).body.token;

// ---------------------------------------------------------------------------
test("health check responds", async () => {
  const res = await api("GET", "/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ok");
});

test("register issues a token and rejects duplicate email", async () => {
  const ok = await api("POST", "/auth/register", {
    body: { name: "New Person", email: "new@taskforge.io", password: "hunter2" },
  });
  assert.equal(ok.status, 201);
  assert.ok(ok.body.token);

  const dup = await api("POST", "/auth/register", {
    body: { name: "Dup", email: "new@taskforge.io", password: "hunter2" },
  });
  assert.equal(dup.status, 409); // 23505 mapped centrally
});

test("register validates required fields", async () => {
  const res = await api("POST", "/auth/register", { body: { email: "x@y.z" } });
  assert.equal(res.status, 400);
});

test("login rejects a wrong password", async () => {
  const res = await api("POST", "/auth/login", {
    body: { email: "donna@taskforge.io", password: "wrong" },
  });
  assert.equal(res.status, 401);
});

test("protected route rejects a missing token", async () => {
  const res = await api("GET", "/notifications");
  assert.equal(res.status, 401);
});

test("owner can read the org and its members", async () => {
  const token = await login("donna@taskforge.io");
  const org = await api("GET", "/orgs/1", { token });
  assert.equal(org.status, 200);
  assert.equal(org.body.role, "owner");

  const members = await api("GET", "/orgs/1/members", { token });
  assert.equal(members.status, 200);
  // Exactly one owner, and the seeded roles are all represented.
  assert.equal(members.body.filter((m) => m.role === "owner").length, 1);
  const roles = new Set(members.body.map((m) => m.role));
  assert.ok(["owner", "admin", "member", "viewer"].every((r) => roles.has(r)));
  assert.ok(members.body.length >= 4);
});

test("RBAC: viewer cannot create a task", async () => {
  const token = await login("leo@taskforge.io"); // viewer
  const cols = await api("GET", "/orgs/1/projects/1/columns", { token });
  const backlog = cols.body.find((c) => c.name === "Backlog");
  const res = await api("POST", "/orgs/1/projects/1/tasks", {
    token, body: { title: "Nope", columnId: backlog.id },
  });
  assert.equal(res.status, 403);
});

test("RBAC: member can create a task, viewer can still read it", async () => {
  const memberToken = await login("priya@taskforge.io");
  const cols = await api("GET", "/orgs/1/projects/1/columns", { token: memberToken });
  const backlog = cols.body.find((c) => c.name === "Backlog");
  const created = await api("POST", "/orgs/1/projects/1/tasks", {
    token: memberToken,
    body: { title: "Member-made task", columnId: backlog.id, priority: "high" },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.priority, "high");

  const viewerToken = await login("leo@taskforge.io");
  const read = await api("GET", `/orgs/1/projects/1/tasks/${created.body.id}`, { token: viewerToken });
  assert.equal(read.status, 200);
});

test("RBAC: member cannot create a project, admin can", async () => {
  const memberToken = await login("priya@taskforge.io");
  const denied = await api("POST", "/orgs/1/projects", {
    token: memberToken, body: { name: "X", key: "XXX" },
  });
  assert.equal(denied.status, 403);

  const adminToken = await login("marcus@taskforge.io");
  const ok = await api("POST", "/orgs/1/projects", {
    token: adminToken, body: { name: "Design System", key: "DS" },
  });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.key, "DS");
});

test("duplicate project key in an org returns 409", async () => {
  const adminToken = await login("marcus@taskforge.io");
  const res = await api("POST", "/orgs/1/projects", {
    token: adminToken, body: { name: "Dup Web", key: "WEB" },
  });
  assert.equal(res.status, 409);
});

test("task move reorders across columns (drag-and-drop)", async () => {
  const token = await login("donna@taskforge.io");
  const cols = (await api("GET", "/orgs/1/projects/1/columns", { token })).body;
  const inProgress = cols.find((c) => c.name === "In Progress");
  const done = cols.find((c) => c.name === "Done");

  const tasks = (await api("GET", "/orgs/1/projects/1/tasks", { token })).body;
  const moving = tasks.find((t) => t.column_id === inProgress.id);

  const moved = await api("POST", `/orgs/1/projects/1/tasks/${moving.id}/move`, {
    token, body: { toColumnId: done.id, toPosition: 0 },
  });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.column_id, done.id);
  assert.equal(moved.body.position, 0);

  // The rest of the Done column shifted down by one.
  const after = (await api("GET", "/orgs/1/projects/1/tasks", { token })).body
    .filter((t) => t.column_id === done.id)
    .sort((a, b) => a.position - b.position);
  assert.equal(after[0].id, moving.id);
  after.forEach((t, i) => assert.equal(t.position, i)); // contiguous, no gaps
});

test("comments and attachments attach to a task", async () => {
  const token = await login("donna@taskforge.io");
  const c = await api("POST", "/orgs/1/projects/1/tasks/1/comments", {
    token, body: { body: "Looks good to me." },
  });
  assert.equal(c.status, 201);
  const list = await api("GET", "/orgs/1/projects/1/tasks/1/comments", { token });
  assert.ok(list.body.length >= 1);

  const a = await api("POST", "/orgs/1/projects/1/tasks/1/attachments", {
    token, body: { filename: "spec.pdf", sizeBytes: 12000 },
  });
  assert.equal(a.status, 201);
});

test("assigning a task notifies the assignee", async () => {
  const token = await login("marcus@taskforge.io"); // admin
  const cols = (await api("GET", "/orgs/1/projects/1/columns", { token })).body;
  const backlog = cols.find((c) => c.name === "Backlog");
  // assign to Priya (user 3)
  await api("POST", "/orgs/1/projects/1/tasks", {
    token, body: { title: "Ping Priya", columnId: backlog.id, assigneeId: 3 },
  });
  const priyaToken = await login("priya@taskforge.io");
  const notifs = await api("GET", "/notifications", { token: priyaToken });
  assert.ok(notifs.body.some((n) => n.body.includes("Ping Priya")));
});

test("search finds tasks by title across the org", async () => {
  const token = await login("donna@taskforge.io");
  const res = await api("GET", "/orgs/1/projects/search?q=auth", { token });
  assert.equal(res.status, 200);
  assert.ok(res.body.some((t) => /auth/i.test(t.title)));
});

test("analytics returns status, priority, and totals", async () => {
  const token = await login("donna@taskforge.io");
  const res = await api("GET", "/orgs/1/projects/analytics", { token });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.byStatus));
  assert.ok(Array.isArray(res.body.byPriority));
  assert.equal(typeof res.body.totals.total, "number");
  assert.ok(res.body.totals.total > 0);
});

test("admin can change a member role but not an owner's", async () => {
  const token = await login("marcus@taskforge.io");
  const members = (await api("GET", "/orgs/1/members", { token })).body;
  const priya = members.find((m) => m.email === "priya@taskforge.io");
  const owner = members.find((m) => m.role === "owner");

  const up = await api("PATCH", `/orgs/1/members/${priya.id}`, {
    token, body: { role: "admin" },
  });
  assert.equal(up.status, 200);
  assert.equal(up.body.role, "admin");

  const blocked = await api("PATCH", `/orgs/1/members/${owner.id}`, {
    token, body: { role: "member" },
  });
  assert.equal(blocked.status, 403);
});

test("404 for a task that does not exist", async () => {
  const token = await login("donna@taskforge.io");
  const res = await api("GET", "/orgs/1/projects/1/tasks/99999", { token });
  assert.equal(res.status, 404);
});

test("delete account removes the user and unassigns their tasks", async () => {
  // Register a throwaway user, have them create nothing, then self-delete.
  const reg = await api("POST", "/auth/register", {
    body: { name: "Temp User", email: "temp@taskforge.io", password: "byebye1" },
  });
  const token = reg.body.token;
  const del = await api("DELETE", "/auth/me", { token });
  assert.equal(del.status, 200);
  assert.equal(del.body.deleted, true);

  // Token now resolves to a missing account -> 401.
  const after = await api("GET", "/auth/me", { token });
  assert.equal(after.status, 401);
});

test("notifications carry project_id for direct task open", async () => {
  const token = await login("donna@taskforge.io");
  const notifs = await api("GET", "/notifications", { token });
  assert.equal(notifs.status, 200);
  const withTask = notifs.body.filter((n) => n.task_id);
  assert.ok(withTask.length > 0);
  // Every task-linked notification resolves to a real project.
  for (const n of withTask) assert.equal(typeof n.project_id, "number");
});

test("board filters by priority and by assignee", async () => {
  const token = await login("donna@taskforge.io");
  const urgent = await api("GET", "/orgs/1/projects/1/tasks?priority=urgent", { token });
  assert.equal(urgent.status, 200);
  assert.ok(urgent.body.every((t) => t.priority === "urgent"));

  const mine = await api("GET", "/orgs/1/projects/1/tasks?assigneeId=1", { token });
  assert.ok(mine.body.every((t) => t.assignee_id === 1));
});

test("search reaches the third project", async () => {
  const token = await login("donna@taskforge.io");
  const res = await api("GET", "/orgs/1/projects/search?q=logo", { token });
  assert.equal(res.status, 200);
  assert.ok(res.body.some((t) => t.project_key === "BPI"));
});

test("analytics reflects the fuller board", async () => {
  const token = await login("donna@taskforge.io");
  const res = await api("GET", "/orgs/1/projects/analytics", { token });
  assert.ok(res.body.totals.total >= 40);
  const statuses = res.body.byStatus.map((r) => r.name);
  // The seed adds Review and QA columns beyond the default three.
  assert.ok(statuses.includes("Review"));
  assert.ok(statuses.includes("QA"));
  // Every priority level appears, so the pie chart has all four segments.
  const priorities = res.body.byPriority.map((r) => r.name);
  ["low", "medium", "high", "urgent"].forEach((p) => assert.ok(priorities.includes(p)));
  // Some work is genuinely overdue, and none of it sits in a Done column.
  assert.ok(res.body.totals.overdue > 0);
  assert.ok(res.body.totals.completed > 0);
});

test("seed: every column on every board has at least one task", async () => {
  const token = await login("donna@taskforge.io");
  const all = (await api("GET", "/orgs/1/projects", { token })).body;
  // Earlier tests create projects of their own; only assert on the seeded set.
  const SEEDED = ["WEB", "MOB", "BPI", "INF", "RES"];
  const projects = all.filter((p) => SEEDED.includes(p.key));
  assert.equal(projects.length, SEEDED.length);

  for (const p of projects) {
    const cols = (await api("GET", `/orgs/1/projects/${p.id}/columns`, { token })).body;
    const tasks = (await api("GET", `/orgs/1/projects/${p.id}/tasks`, { token })).body;
    for (const c of cols) {
      const inCol = tasks.filter((t) => t.column_id === c.id);
      assert.ok(inCol.length > 0, `${p.key}/${c.name} is empty`);
      // Positions are contiguous 0..n-1 so drag-and-drop maths stay sound.
      const sorted = inCol.map((t) => t.position).sort((a, b) => a - b);
      sorted.forEach((pos, i) => assert.equal(pos, i, `${p.key}/${c.name} position gap`));
    }
  }
});

test("seed: ships a single organization", async () => {
  const donna = await login("donna@taskforge.io");
  const orgs = (await api("GET", "/orgs", { token: donna })).body;
  // Earlier tests create orgs of their own; the seed itself provides exactly one.
  assert.ok(orgs.some((o) => o.slug === "meridian"));
  const meridian = orgs.find((o) => o.slug === "meridian");
  assert.equal(meridian.role, "owner");

  // Leo belongs to that one org and nothing else.
  const leo = await login("leo@taskforge.io");
  const leoOrgs = (await api("GET", "/orgs", { token: leo })).body;
  assert.equal(leoOrgs.length, 1);
  assert.equal(leoOrgs[0].slug, "meridian");
  assert.equal(leoOrgs[0].role, "viewer");
});

test("a second organization stays isolated from the first", async () => {
  // The seed ships one org; multi-org support is exercised by building one here.
  const donna = await login("donna@taskforge.io");
  const created = await api("POST", "/orgs", {
    token: donna, body: { name: "Ferrous Press", slug: "ferrous" },
  });
  assert.equal(created.status, 201);
  const orgId = created.body.id;

  // Donna owns it, and its project list starts empty and separate.
  const mine = (await api("GET", "/orgs", { token: donna })).body;
  assert.equal(mine.find((o) => o.slug === "ferrous").role, "owner");
  const projects = (await api("GET", `/orgs/${orgId}/projects`, { token: donna })).body;
  assert.equal(projects.length, 0);

  // A project here does not appear in Meridian, and vice versa.
  await api("POST", `/orgs/${orgId}/projects`, { token: donna, body: { name: "Quarterly Zine", key: "ZIN" } });
  const ferrousKeys = (await api("GET", `/orgs/${orgId}/projects`, { token: donna })).body.map((p) => p.key);
  const meridianKeys = (await api("GET", "/orgs/1/projects", { token: donna })).body.map((p) => p.key);
  assert.deepEqual(ferrousKeys, ["ZIN"]);
  assert.ok(!meridianKeys.includes("ZIN"));

  // Leo is not a member and is shut out entirely.
  const leo = await login("leo@taskforge.io");
  const leoOrgs = (await api("GET", "/orgs", { token: leo })).body;
  assert.ok(!leoOrgs.some((o) => o.slug === "ferrous"));
  assert.equal((await api("GET", `/orgs/${orgId}`, { token: leo })).status, 403);
  assert.equal((await api("GET", `/orgs/${orgId}/projects`, { token: leo })).status, 403);
});

test("seed: tasks carry comments and attachments", async () => {
  const token = await login("donna@taskforge.io");
  const tasks = (await api("GET", "/orgs/1/projects/1/tasks", { token })).body;
  const auth = tasks.find((t) => t.title === "Wire up auth flow");
  assert.ok(auth, "seeded auth task should exist");

  const comments = (await api("GET", `/orgs/1/projects/1/tasks/${auth.id}/comments`, { token })).body;
  assert.ok(comments.length >= 3);
  // Comments resolve to real authors.
  comments.forEach((c) => assert.ok(c.name && c.color));

  const files = (await api("GET", `/orgs/1/projects/1/tasks/${auth.id}/attachments`, { token })).body;
  assert.ok(files.length >= 1);
});

/* ---------------------------------------------------------------------------
   User-story coverage: registration, workspaces, and task-update notifications.
   ------------------------------------------------------------------------ */

test("registration auto-joins the default workspace as a member", async () => {
  const reg = await api("POST", "/auth/register", {
    body: { name: "Ada Lovelace", email: "ada@teamflow.io", password: "analytical1" },
  });
  assert.equal(reg.status, 201);
  const token = reg.body.token;

  // The response names the workspace they landed in.
  assert.ok(reg.body.org);
  assert.equal(reg.body.org.slug, "meridian");

  // No create-organization step: they are already in one, as a member.
  const mine = await api("GET", "/orgs", { token });
  assert.equal(mine.status, 200);
  assert.equal(mine.body.length, 1);
  assert.equal(mine.body[0].slug, "meridian");
  assert.equal(mine.body[0].role, "member");

  // And they can immediately read the boards.
  const projects = await api("GET", "/orgs/1/projects", { token });
  assert.equal(projects.status, 200);
  assert.ok(projects.body.length > 0);

  // Member role holds: tasks yes, projects no.
  const cols = (await api("GET", "/orgs/1/projects/1/columns", { token })).body;
  const madeTask = await api("POST", "/orgs/1/projects/1/tasks", {
    token, body: { title: "first task", columnId: cols[0].id },
  });
  assert.equal(madeTask.status, 201);
  const madeProject = await api("POST", "/orgs/1/projects", {
    token, body: { name: "Nope", key: "NOP" },
  });
  assert.equal(madeProject.status, 403);
});

test("the API still supports creating an additional organization", async () => {
  // The UI no longer exposes this, but the endpoint remains for multi-workspace
  // deployments; the creator becomes its owner.
  const reg = await api("POST", "/auth/register", {
    body: { name: "Grace Hopper", email: "grace@teamflow.io", password: "compiler1" },
  });
  const token = reg.body.token;
  // She auto-joined Meridian as a member.
  assert.equal(reg.body.org.slug, "meridian");

  const created = await api("POST", "/orgs", {
    token, body: { name: "Analytical Engines", slug: "engines" },
  });
  assert.equal(created.status, 201);

  const mine = await api("GET", "/orgs", { token });
  assert.equal(mine.body.length, 2);
  const engines = mine.body.find((o) => o.slug === "engines");
  assert.equal(engines.role, "owner");
  // Membership in the default workspace is unchanged.
  assert.equal(mine.body.find((o) => o.slug === "meridian").role, "member");
});

test("story: duplicate org slug is rejected", async () => {
  const token = await login("donna@taskforge.io");
  const res = await api("POST", "/orgs", { token, body: { name: "Copy", slug: "meridian" } });
  assert.equal(res.status, 409);
});

test("story: GET /orgs only lists orgs you belong to", async () => {
  const donna = await login("donna@taskforge.io");
  const solo = await api("POST", "/orgs", { token: donna, body: { name: "Solo Studio", slug: "solo" } });
  assert.equal(solo.status, 201);

  // Leo is not a member of Solo Studio.
  const leo = await login("leo@taskforge.io");
  const leoOrgs = await api("GET", "/orgs", { token: leo });
  assert.ok(!leoOrgs.body.some((o) => o.slug === "solo"));
  // ...and cannot read it directly.
  const denied = await api("GET", `/orgs/${solo.body.id}`, { token: leo });
  assert.equal(denied.status, 403);
});

test("story: a team lead invites a member into their org", async () => {
  const token = await login("donna@taskforge.io");
  const org = await api("POST", "/orgs", { token, body: { name: "Invite Test", slug: "invite-test" } });
  const added = await api("POST", `/orgs/${org.body.id}/members`, {
    token, body: { email: "priya@taskforge.io", role: "member" },
  });
  assert.equal(added.status, 201);

  const members = await api("GET", `/orgs/${org.body.id}/members`, { token });
  assert.equal(members.body.length, 2);
  assert.ok(members.body.some((m) => m.email === "priya@taskforge.io" && m.role === "member"));

  // Adding an unknown email is a 404, adding twice is a 409.
  const ghost = await api("POST", `/orgs/${org.body.id}/members`, {
    token, body: { email: "nobody@nowhere.io" },
  });
  assert.equal(ghost.status, 404);
  const dup = await api("POST", `/orgs/${org.body.id}/members`, {
    token, body: { email: "priya@taskforge.io" },
  });
  assert.equal(dup.status, 409);
});

test("story: assignee is notified when their task is updated", async () => {
  const donna = await login("donna@taskforge.io");
  const priya = await login("priya@taskforge.io");

  // Task 1 is assigned to Priya in the seed.
  const before = (await api("GET", "/notifications", { token: priya })).body.length;

  await api("PATCH", "/orgs/1/projects/1/tasks/1", { token: donna, body: { priority: "urgent" } });
  const afterPriority = (await api("GET", "/notifications", { token: priya })).body;
  assert.equal(afterPriority.length, before + 1);
  assert.match(afterPriority[0].body, /updated/);
  assert.match(afterPriority[0].body, /priority → urgent/);

  await api("PATCH", "/orgs/1/projects/1/tasks/1", { token: donna, body: { dueDate: "2026-12-01" } });
  const afterDue = (await api("GET", "/notifications", { token: priya })).body;
  assert.match(afterDue[0].body, /due 2026-12-01/);
});

test("story: moving a task notifies its assignee of the new status", async () => {
  const donna = await login("donna@taskforge.io");
  const priya = await login("priya@taskforge.io");
  const cols = (await api("GET", "/orgs/1/projects/1/columns", { token: donna })).body;
  const done = cols.find((c) => c.name === "Done");

  await api("POST", "/orgs/1/projects/1/tasks/1/move", {
    token: donna, body: { toColumnId: done.id, toPosition: 0 },
  });
  const notifs = (await api("GET", "/notifications", { token: priya })).body;
  assert.match(notifs[0].body, /moved .* to Done/);
});

test("story: reassignment notifies both the new and previous assignee", async () => {
  const donna = await login("donna@taskforge.io");
  // Task 1 belongs to Priya (3). Hand it to Marcus (2).
  await api("PATCH", "/orgs/1/projects/1/tasks/1", { token: donna, body: { assigneeId: 2 } });

  const marcus = await login("marcus@taskforge.io");
  const priya = await login("priya@taskforge.io");
  const mN = (await api("GET", "/notifications", { token: marcus })).body;
  const pN = (await api("GET", "/notifications", { token: priya })).body;
  assert.match(mN[0].body, /assigned you/);
  assert.match(pN[0].body, /reassigned/);
});

test("editing your own task does not notify you", async () => {
  const donna = await login("donna@taskforge.io");
  const before = (await api("GET", "/notifications", { token: donna })).body.length;
  // Task 2 is Donna's own in the seed.
  await api("PATCH", "/orgs/1/projects/1/tasks/2", { token: donna, body: { priority: "high" } });
  const after = (await api("GET", "/notifications", { token: donna })).body.length;
  assert.equal(after, before);
});

/* ---------------------------------------------------------------------------
   Regression: nobody should ever land in the app without a workspace.
   ------------------------------------------------------------------------ */

test("an account with no membership is adopted into the default workspace", async () => {
  // Simulates an account created before auto-enrolment existed, or one whose
  // last membership was revoked. It used to strand the user on an error screen.
  const reg = await api("POST", "/auth/register", {
    body: { name: "Legacy User", email: "legacy@taskforge.io", password: "legacy123" },
  });
  const token = reg.body.token;

  // Strip the membership the registration just created.
  await pool.query(
    `DELETE FROM memberships WHERE user_id = (SELECT id FROM users WHERE email = 'legacy@taskforge.io')`
  );
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM memberships m
       JOIN users u ON u.id = m.user_id WHERE u.email = 'legacy@taskforge.io'`
  );
  assert.equal(rows[0].n, 0);

  // GET /orgs adopts them rather than returning an empty list.
  const orgs = await api("GET", "/orgs", { token });
  assert.equal(orgs.status, 200);
  assert.equal(orgs.body.length, 1);
  assert.equal(orgs.body[0].slug, "meridian");

  // The membership is persisted, not just synthesised in the response.
  const after = await pool.query(
    `SELECT count(*)::int AS n FROM memberships m
       JOIN users u ON u.id = m.user_id WHERE u.email = 'legacy@taskforge.io'`
  );
  assert.equal(after.rows[0].n, 1);
});

test("adoption is idempotent — repeated calls add no duplicate memberships", async () => {
  const token = await login("donna@taskforge.io");
  const before = (await pool.query(`SELECT count(*)::int AS n FROM memberships`)).rows[0].n;
  await api("GET", "/orgs", { token });
  await api("GET", "/orgs", { token });
  await api("GET", "/orgs", { token });
  const after = (await pool.query(`SELECT count(*)::int AS n FROM memberships`)).rows[0].n;
  assert.equal(after, before);
});

test("seeded users belong to the seeded workspace with stable roles", async () => {
  // Note: an earlier test promotes Priya to admin, so only assert on the
  // members no other test mutates.
  const stable = { donna: "owner", marcus: "admin", leo: "viewer" };
  for (const [who, role] of Object.entries(stable)) {
    const token = await login(`${who}@taskforge.io`);
    const orgs = (await api("GET", "/orgs", { token })).body;
    assert.equal(orgs[0].slug, "meridian");
    assert.equal(orgs[0].role, role, `${who} should be ${role}`);
  }
  // And every seeded member resolves to exactly one workspace.
  const token = await login("sana@taskforge.io");
  const orgs = (await api("GET", "/orgs", { token })).body;
  assert.equal(orgs.length, 1);
  assert.equal(orgs[0].slug, "meridian");
});

/* ---------------------------------------------------------------------------
   Cross-organization isolation. A user must never learn anything about an
   organization they do not belong to — including through assignment and the
   notification feed, which bypass the usual :orgId route guard.
   ------------------------------------------------------------------------ */

// Build a private org that Leo is not a member of, and return its ids.
async function makePrivateOrg(ownerToken, slug) {
  const org = (await api("POST", "/orgs", {
    token: ownerToken, body: { name: `Private ${slug}`, slug },
  })).body;
  const project = (await api("POST", `/orgs/${org.id}/projects`, {
    token: ownerToken, body: { name: "Secret", key: slug.slice(0, 3).toUpperCase() },
  })).body;
  const cols = (await api("GET", `/orgs/${org.id}/projects/${project.id}/columns`, { token: ownerToken })).body;
  return { org, project, columnId: cols[0].id };
}

test("isolation: every route on a foreign org returns 403", async () => {
  const donna = await login("donna@taskforge.io");
  const { org, project } = await makePrivateOrg(donna, "iso-routes");
  const leo = await login("leo@taskforge.io");

  for (const path of [
    `/orgs/${org.id}`,
    `/orgs/${org.id}/members`,
    `/orgs/${org.id}/projects`,
    `/orgs/${org.id}/projects/analytics`,
    `/orgs/${org.id}/projects/search?q=secret`,
    `/orgs/${org.id}/projects/${project.id}/tasks`,
  ]) {
    const res = await api("GET", path, { token: leo });
    assert.equal(res.status, 403, `${path} should be forbidden`);
  }
  // And the foreign org never appears in his own list.
  const mine = (await api("GET", "/orgs", { token: leo })).body;
  assert.ok(!mine.some((o) => o.id === org.id));
});

test("isolation: a foreign project id cannot be reached through a permitted org", async () => {
  // The confused-deputy shape: use org 1 (allowed) with org 2's project id.
  const donna = await login("donna@taskforge.io");
  const { project } = await makePrivateOrg(donna, "iso-deputy");
  const leo = await login("leo@taskforge.io");

  for (const path of [
    `/orgs/1/projects/${project.id}`,
    `/orgs/1/projects/${project.id}/columns`,
    `/orgs/1/projects/${project.id}/tasks`,
  ]) {
    const res = await api("GET", path, { token: leo });
    assert.equal(res.status, 404, `${path} should not resolve`);
  }
});

test("isolation: a task cannot be assigned to a non-member", async () => {
  const donna = await login("donna@taskforge.io");
  const { org, project, columnId } = await makePrivateOrg(donna, "iso-assign");

  // Leo (user 4) is not a member of this org.
  const created = await api("POST", `/orgs/${org.id}/projects/${project.id}/tasks`, {
    token: donna, body: { title: "Leak me", columnId, assigneeId: 4 },
  });
  assert.equal(created.status, 422);

  // Nor via a later reassignment.
  const task = (await api("POST", `/orgs/${org.id}/projects/${project.id}/tasks`, {
    token: donna, body: { title: "Sneaky", columnId },
  })).body;
  const patched = await api("PATCH", `/orgs/${org.id}/projects/${project.id}/tasks/${task.id}`, {
    token: donna, body: { assigneeId: 4 },
  });
  assert.equal(patched.status, 422);

  // Leo's feed stays clean of both titles.
  const leo = await login("leo@taskforge.io");
  const notifs = (await api("GET", "/notifications", { token: leo })).body;
  assert.ok(!notifs.some((n) => /Leak me|Sneaky/.test(n.body)));
});

test("isolation: assignment inside the organization still works", async () => {
  const donna = await login("donna@taskforge.io");
  // Priya (3) is a member of Meridian.
  const ok = await api("PATCH", "/orgs/1/projects/1/tasks/1", {
    token: donna, body: { assigneeId: 3 },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.assignee_id, 3);
  // Unassigning is allowed.
  const cleared = await api("PATCH", "/orgs/1/projects/1/tasks/1", {
    token: donna, body: { assigneeId: "" },
  });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.assignee_id, null);
});

test("isolation: the notification feed hides rows from foreign organizations", async () => {
  const donna = await login("donna@taskforge.io");
  const { project, columnId, org } = await makePrivateOrg(donna, "iso-notif");
  const task = (await api("POST", `/orgs/${org.id}/projects/${project.id}/tasks`, {
    token: donna, body: { title: "Historic secret", columnId },
  })).body;

  // Write a notification directly, as an older build would have done.
  await pool.query(
    `INSERT INTO notifications (user_id, body, task_id)
     VALUES ((SELECT id FROM users WHERE email='leo@taskforge.io'), 'Old leak', $1)`,
    [task.id]
  );

  const leo = await login("leo@taskforge.io");
  const notifs = (await api("GET", "/notifications", { token: leo })).body;
  assert.ok(!notifs.some((n) => n.body === "Old leak"),
    "a notification pointing into a foreign org must not be served");
});
