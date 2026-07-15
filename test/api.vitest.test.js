import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import app from "#app";
import pool from "#db/client";
import { applySchema } from "#db/schema";

const api = request(app);
const auth = (t) => ({ Authorization: `Bearer ${t}` });

let alice, bob, carol, dave; // { user, token, org }
let org2, project, cols, task;

beforeAll(() => applySchema());
afterAll(() => pool.end());

const register = async (name, email) => {
  const res = await api.post("/auth/register")
    .send({ name, email, password: "password123" });
  expect(res.status).toBe(201);
  return res.body;
};

describe("health & auth", () => {
  it("GET /health", async () => {
    const res = await api.get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("register validates the body", async () => {
    expect((await api.post("/auth/register").send({ name: "x" })).status).toBe(400);
  });

  it("first account founds its own org as owner", async () => {
    alice = await register("Alice A", "alice@test.io");
    expect(alice.token).toBeTruthy();
    expect(alice.user).not.toHaveProperty("password_hash");
    expect(alice.org).toBeTruthy();
  });

  it("later accounts join the shared org", async () => {
    bob = await register("Bob B", "bob@test.io");
    carol = await register("Carol C", "carol@test.io");
    dave = await register("Dave D", "dave@test.io");
    expect(bob.org.id).toBe(alice.org.id);
  });

  it("duplicate email → 409", async () => {
    const res = await api.post("/auth/register")
      .send({ name: "Alice 2", email: "alice@test.io", password: "x" });
    expect(res.status).toBe(409);
  });

  it("login: wrong password 401, right password 200", async () => {
    expect((await api.post("/auth/login")
      .send({ email: "alice@test.io", password: "nope" })).status).toBe(401);
    const ok = await api.post("/auth/login")
      .send({ email: "ALICE@test.io", password: "password123" });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();
  });

  it("GET /auth/me requires a valid token", async () => {
    expect((await api.get("/auth/me")).status).toBe(401);
    expect((await api.get("/auth/me").set(auth("garbage"))).status).toBe(401);
    const res = await api.get("/auth/me").set(auth(alice.token));
    expect(res.body.user.email).toBe("alice@test.io");
  });
});

describe("orgs & members", () => {
  it("lists my orgs with my role", async () => {
    const res = await api.get("/orgs").set(auth(alice.token));
    expect(res.status).toBe(200);
    expect(res.body.find((o) => o.id === alice.org.id).role).toBe("owner");
  });

  it("creates a second org", async () => {
    const res = await api.post("/orgs").set(auth(alice.token))
      .send({ name: "Second Org", slug: "second" });
    expect(res.status).toBe(201);
    org2 = res.body;
  });

  it("non-members get 403, unknown orgs 404", async () => {
    expect((await api.get(`/orgs/${org2.id}`).set(auth(carol.token))).status).toBe(403);
    expect((await api.get("/orgs/999999").set(auth(alice.token))).status).toBe(404);
  });

  it("admin adds members; the owner role cannot be granted", async () => {
    const grant = (body) =>
      api.post(`/orgs/${org2.id}/members`).set(auth(alice.token)).send(body);
    expect((await grant({ role: "member" })).status).toBe(400);
    expect((await grant({ email: "ghost@test.io" })).status).toBe(404);
    expect((await grant({ email: "carol@test.io", role: "owner" })).status).toBe(403);
    expect((await grant({ email: "carol@test.io", role: "member" })).status).toBe(201);
    expect((await grant({ userId: dave.user.id, role: "viewer" })).status).toBe(201);
  });

  it("members list; role changes guard the owner", async () => {
    const members = (await api.get(`/orgs/${org2.id}/members`).set(auth(alice.token))).body;
    expect(members).toHaveLength(3);
    const owner = members.find((m) => m.role === "owner");
    const carolM = members.find((m) => m.user_id === carol.user.id);
    expect((await api.patch(`/orgs/${org2.id}/members/${owner.id}`)
      .set(auth(alice.token)).send({ role: "member" })).status).toBe(403);
    expect((await api.delete(`/orgs/${org2.id}/members/${owner.id}`)
      .set(auth(alice.token))).status).toBe(403);
    // The owner role cannot be granted through a role change either.
    expect((await api.patch(`/orgs/${org2.id}/members/${carolM.id}`)
      .set(auth(alice.token)).send({ role: "owner" })).status).toBe(403);
    const res = await api.patch(`/orgs/${org2.id}/members/${carolM.id}`)
      .set(auth(alice.token)).send({ role: "admin" });
    expect(res.body.role).toBe("admin");
  });

  it("assignable directory is admin-only", async () => {
    expect((await api.get(`/orgs/${org2.id}/assignable`).set(auth(dave.token))).status).toBe(403);
    expect((await api.get(`/orgs/${org2.id}/assignable`).set(auth(carol.token))).status).toBe(200);
  });
});

describe("projects & tasks", () => {
  it("admin creates a project seeded with default columns", async () => {
    expect((await api.post(`/orgs/${org2.id}/projects`).set(auth(dave.token))
      .send({ name: "Site", key: "web" })).status).toBe(403); // viewer
    const res = await api.post(`/orgs/${org2.id}/projects`).set(auth(carol.token))
      .send({ name: "Site", key: "web" });
    expect(res.status).toBe(201);
    project = res.body;
    expect(project.key).toBe("WEB");
    cols = (await api.get(`/orgs/${org2.id}/projects/${project.id}/columns`)
      .set(auth(alice.token))).body;
    expect(cols.map((c) => c.name)).toEqual(["Backlog", "In Progress", "Done"]);
  });

  const taskUrl = () => `/orgs/${org2.id}/projects/${project.id}/tasks`;

  it("task creation validates column, assignee membership, and role", async () => {
    const post = (t, body) => api.post(taskUrl()).set(auth(t)).send(body);
    expect((await post(dave.token, { title: "x", columnId: cols[0].id })).status).toBe(403);
    expect((await post(carol.token, { title: "x" })).status).toBe(400);
    expect((await post(carol.token, { title: "x", columnId: 999999 })).status).toBe(400);
    expect((await post(carol.token,
      { title: "x", columnId: cols[0].id, assigneeId: bob.user.id })).status).toBe(422);
    const res = await post(carol.token, {
      title: "Ship it", columnId: cols[0].id, priority: "high",
      assigneeId: alice.user.id, description: "the big one",
    });
    expect(res.status).toBe(201);
    task = res.body;
    expect([task.position, task.assignee_id]).toEqual([0, alice.user.id]);
  });

  it("assignment notified the assignee", async () => {
    const notifs = (await api.get("/notifications").set(auth(alice.token))).body;
    expect(notifs.some((n) => n.task_id === task.id && /assigned/.test(n.body))).toBe(true);
  });

  it("lists with filters", async () => {
    await api.post(taskUrl()).set(auth(carol.token))
      .send({ title: "Low key", columnId: cols[0].id, priority: "low" });
    const all = (await api.get(taskUrl()).set(auth(dave.token))).body; // viewers can read
    expect(all).toHaveLength(2);
    const high = (await api.get(`${taskUrl()}?priority=high`).set(auth(carol.token))).body;
    expect(high.map((t) => t.title)).toEqual(["Ship it"]);
    const mine = (await api.get(`${taskUrl()}?assigneeId=${alice.user.id}`)
      .set(auth(carol.token))).body;
    expect(mine).toHaveLength(1);
  });

  it("PATCH updates fields and clears with empty string", async () => {
    const res = await api.patch(`${taskUrl()}/${task.id}`).set(auth(carol.token))
      .send({ priority: "urgent", dueDate: "2026-08-01" });
    expect(res.body.priority).toBe("urgent");
    expect(String(res.body.due_date)).toContain("2026-08-01");
    const cleared = await api.patch(`${taskUrl()}/${task.id}`).set(auth(carol.token))
      .send({ assigneeId: "" });
    expect(cleared.body.assignee_id).toBeNull();
  });

  it("move validates the target column and re-sequences positions", async () => {
    expect((await api.post(`${taskUrl()}/${task.id}/move`).set(auth(carol.token))
      .send({ toColumnId: 999999, toPosition: 0 })).status).toBe(400);
    const res = await api.post(`${taskUrl()}/${task.id}/move`).set(auth(carol.token))
      .send({ toColumnId: cols[2].id, toPosition: 0 });
    expect(res.body.column_id).toBe(cols[2].id);
    const left = (await api.get(taskUrl()).set(auth(carol.token))).body
      .filter((t) => t.column_id === cols[0].id);
    expect(left.map((t) => t.position)).toEqual([0]);
  });

  it("unknown task in this project → 404", async () => {
    expect((await api.get(`${taskUrl()}/999999`).set(auth(carol.token))).status).toBe(404);
  });

  it("comments and attachments", async () => {
    const c = await api.post(`${taskUrl()}/${task.id}/comments`).set(auth(alice.token))
      .send({ body: "LGTM" });
    expect(c.status).toBe(201);
    expect((await api.get(`${taskUrl()}/${task.id}/comments`)
      .set(auth(dave.token))).body).toHaveLength(1);
    const a = await api.post(`${taskUrl()}/${task.id}/attachments`).set(auth(carol.token))
      .send({ filename: "spec.pdf", sizeBytes: 1024 });
    expect(a.status).toBe(201);
    expect((await api.delete(`${taskUrl()}/${task.id}/attachments/999999`)
      .set(auth(carol.token))).status).toBe(404);
    expect((await api.delete(`${taskUrl()}/${task.id}/attachments/${a.body.id}`)
      .set(auth(carol.token))).body.deleted).toBe(true);
  });

  it("search and analytics", async () => {
    const hits = (await api.get(`/orgs/${org2.id}/projects/search?q=ship`)
      .set(auth(carol.token))).body;
    expect(hits.map((t) => t.title)).toEqual(["Ship it"]);
    expect((await api.get(`/orgs/${org2.id}/projects/search`)
      .set(auth(carol.token))).body).toEqual([]);
    const stats = (await api.get(`/orgs/${org2.id}/projects/analytics`)
      .set(auth(carol.token))).body;
    // Analytics returns { byStatus, byPriority, totals, perProject }; the
    // per-board figures live under perProject.
    expect(stats.perProject.find((p) => p.id === project.id)).toMatchObject({ total: 2, done: 1 });
  });

  it("member can delete a task", async () => {
    const res = await api.delete(`${taskUrl()}/${task.id}`).set(auth(carol.token));
    expect(res.body.deleted).toBe(true);
  });
});

describe("notifications", () => {
  it("mark one, mark all; other people's notifications are invisible", async () => {
    // carol assigns alice a task in the shared org → fresh notification for alice
    const p = (await api.post(`/orgs/${alice.org.id}/projects`).set(auth(alice.token))
      .send({ name: "Shared", key: "SHR" })).body;
    const [backlog] = (await api.get(`/orgs/${alice.org.id}/projects/${p.id}/columns`)
      .set(auth(carol.token))).body;
    await api.post(`/orgs/${alice.org.id}/projects/${p.id}/tasks`).set(auth(carol.token))
      .send({ title: "Ping Alice", columnId: backlog.id, assigneeId: alice.user.id });
    const notifs = (await api.get("/notifications").set(auth(alice.token))).body;
    expect(notifs.length).toBeGreaterThan(0);
    expect((await api.patch(`/notifications/${notifs[0].id}/read`)
      .set(auth(bob.token))).status).toBe(404);
    const read = await api.patch(`/notifications/${notifs[0].id}/read`).set(auth(alice.token));
    expect(read.body.is_read).toBe(true);
    await api.patch("/notifications/read-all").set(auth(alice.token));
    const after = (await api.get("/notifications").set(auth(alice.token))).body;
    expect(after.every((n) => n.is_read)).toBe(true);
  });
});

describe("org deletion & account deletion", () => {
  it("requires typing the org name, then reports the footprint", async () => {
    const del = (body) => api.delete(`/orgs/${org2.id}`).set(auth(alice.token)).send(body);
    expect((await del({ confirm: "wrong" })).status).toBe(400);
    const res = await del({ confirm: "Second Org" });
    expect(res.status).toBe(200);
    expect(res.body.destroyed.projects).toBe(1);
  });

  it("refuses to delete your only org", async () => {
    const res = await api.delete(`/orgs/${alice.org.id}`).set(auth(alice.token))
      .send({ confirm: alice.org.name });
    expect(res.status).toBe(409);
  });

  it("DELETE /auth/me removes the account and invalidates the token", async () => {
    expect((await api.delete("/auth/me").set(auth(dave.token))).body.deleted).toBe(true);
    expect((await api.get("/auth/me").set(auth(dave.token))).status).toBe(401);
  });

  it("unknown routes → 404", async () => {
    expect((await api.get("/nope")).status).toBe(404);
  });
});
