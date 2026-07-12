import pool, { query } from "#db/client";
import { createUser } from "#db/users";
import { createOrg, addMember } from "#db/orgs";
import { createProject, listColumns } from "#db/projects";
import { createTask } from "#db/tasks";
import { addComment, addAttachment, createNotification } from "#db/activity";
import { PEOPLE, PROJECTS, TASKS, COMMENTS, FILES, NOTIFS } from "#db/seedData";

/* Dates are always relative to the run, so the demo never looks stale. */
const d = (offset) => {
  const x = new Date();
  x.setDate(x.getDate() + offset);
  return x.toISOString().slice(0, 10);
};

/* Each function walks one table from seedData.js. */

async function seedUsers() {
  const users = [];
  for (const [name, email, color] of PEOPLE)
    users.push(await createUser({ name, email, password: "password123", color }));
  return users;
}

async function seedOrg(users) {
  const org = await createOrg({
    name: "Studio Meridian", slug: "meridian", createdBy: users[0].id,
  });
  // createOrg already seated users[0] as owner; add everyone else by role.
  for (let i = 1; i < users.length; i++)
    await addMember({ orgId: org.id, userId: users[i].id, role: PEOPLE[i][3] });
  return org;
}

async function seedProjects(orgId) {
  const byKey = {};
  for (const [key, name, color, extras] of PROJECTS) {
    const p = await createProject({ orgId, name, key, color });
    // Defaults are Backlog(0) / In Progress(1) / Done(2); extras slot in
    // before Done so the flow reads left to right.
    for (const [i, extra] of extras.entries())
      await query(`INSERT INTO columns (project_id, name, position) VALUES ($1, $2, $3)`,
        [p.id, extra, 2 + i]);
    await query(`UPDATE columns SET position = $2 WHERE project_id = $1 AND name = 'Done'`,
      [p.id, 2 + extras.length]);
    const cols = await listColumns(p.id);
    byKey[key] = { ...p, cols: Object.fromEntries(cols.map((c) => [c.name, c.id])) };
  }
  return byKey;
}

async function seedTasks(projects, users) {
  const byTitle = {};
  for (const [key, col, title, priority, who, due, desc] of TASKS)
    byTitle[title] = await createTask({
      projectId: projects[key].id,
      columnId: projects[key].cols[col],
      title, description: desc, priority,
      assigneeId: users[who].id,
      dueDate: d(due),
      createdBy: users[0].id,
    });
  return byTitle;
}

async function seedActivity(byTitle, users) {
  for (const [title, who, body] of COMMENTS)
    await addComment({ taskId: byTitle[title].id, userId: users[who].id, body });
  for (const [title, who, filename, sizeBytes] of FILES)
    await addAttachment({ taskId: byTitle[title].id, userId: users[who].id, filename, sizeBytes });
  for (const [who, body, title] of NOTIFS)
    await createNotification({ userId: users[who].id, body, taskId: byTitle[title].id });
  // A couple already read, so the bell isn't uniformly unread.
  await query(
    `UPDATE notifications SET is_read = true
      WHERE user_id = $1 AND id IN (
        SELECT id FROM notifications WHERE user_id = $1 ORDER BY id LIMIT 2)`,
    [users[0].id]
  );
}

// Everything above was inserted "now", which flattens the dashboard charts.
// Spread task creation across the last ~5 months in a growth curve, keep a
// busy final week, and stamp Done tasks with completion times through the
// last 7 days so both activity charts have real shape.
async function backdate(byTitle) {
  const all = Object.values(byTitle);
  for (let i = 0; i < all.length; i++) {
    const frac = i / all.length; // 0 = oldest … 1 = newest
    const daysAgo = i % 4 === 0
      ? i % 7                                       // every 4th task lands in the last week
      : Math.round(150 * Math.pow(1 - frac, 1.7));  // the rest curve up over ~5 months
    await query(
      `UPDATE tasks
          SET created_at = now() - make_interval(days => $2, hours => (id % 9) + 1),
              updated_at = now() - make_interval(days => $2, hours => id % 9)
        WHERE id = $1`,
      [all[i].id, daysAgo]
    );
  }

  // Done tasks "completed" (last touched) on a rotation through the past week,
  // never earlier than they were created.
  const { rows: done } = await query(
    `SELECT t.id FROM tasks t JOIN columns c ON c.id = t.column_id
      WHERE c.name = 'Done' ORDER BY t.id`
  );
  for (let i = 0; i < done.length; i++)
    await query(
      `UPDATE tasks
          SET updated_at = GREATEST(created_at, now() - make_interval(days => $2, hours => 3))
        WHERE id = $1`,
      [done[i].id, i % 7]
    );

  // Scatter comment/attachment/notification times over recent days so the
  // task drawer and bell don't read "just now" on every row.
  await query(`UPDATE comments      SET created_at = now() - make_interval(hours => (id * 7)  % 200)`);
  await query(`UPDATE attachments   SET created_at = now() - make_interval(hours => (id * 13) % 340)`);
  await query(`UPDATE notifications SET created_at = now() - make_interval(hours => (id * 5)  % 70)`);
}

async function main() {
  const users = await seedUsers();
  const org = await seedOrg(users);
  const projects = await seedProjects(org.id);
  const byTitle = await seedTasks(projects, users);
  await seedActivity(byTitle, users);
  await backdate(byTitle);

  const { rows: [counts] } = await query(`
    SELECT (SELECT count(*) FROM users) users, (SELECT count(*) FROM organizations) orgs,
           (SELECT count(*) FROM projects) projects, (SELECT count(*) FROM tasks) tasks,
           (SELECT count(*) FROM comments) comments, (SELECT count(*) FROM attachments) files,
           (SELECT count(*) FROM notifications) notifs`);
  console.log("Seed complete:", counts);
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
