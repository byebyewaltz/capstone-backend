import dotenv from "dotenv";
dotenv.config();
import pool, { query } from "#db/client";
import { createUser } from "#db/users";
import { createOrg, addMember } from "#db/orgs";
import { createProject, listColumns } from "#db/projects";
import { createTask } from "#db/tasks";
import { addComment, addAttachment, createNotification } from "#db/activity";

/* Dates are always relative to the run, so the demo never looks stale. */
const d = (offset) => {
  const x = new Date();
  x.setDate(x.getDate() + offset);
  return x.toISOString().slice(0, 10);
};

/* ------------------------------------------------------------------------ */
/* People                                                                     */
/* ------------------------------------------------------------------------ */
const PEOPLE = [
  ["Donna Chen",     "donna@taskforge.io",   "#C4623D"],
  ["Marcus Reed",    "marcus@taskforge.io",  "#5B7B9A"],
  ["Priya Nair",     "priya@taskforge.io",   "#7A8B6F"],
  ["Leo Park",       "leo@taskforge.io",     "#D89B4A"],
  ["Sana Okonkwo",   "sana@taskforge.io",    "#B5566B"],
  ["Theo Vance",     "theo@taskforge.io",    "#6B8E5A"],
  ["Iris Kaminski",  "iris@taskforge.io",    "#8A6BA8"],
  ["Noah Ferreira",  "noah@taskforge.io",    "#4F7A78"],
  ["Ruth Blackwood", "ruth@taskforge.io",    "#A8763E"],
  ["Kenji Sato",     "kenji@taskforge.io",   "#3F6B8C"],
  ["Amara Diallo",   "amara@taskforge.io",   "#9C5A6B"],
];

/* ------------------------------------------------------------------------ */
/* Projects: [key, name, color, extraColumns]                                 */
/* ------------------------------------------------------------------------ */
const MERIDIAN_PROJECTS = [
  ["WEB", "Website Relaunch",  "#C4623D", ["Review"]],
  ["MOB", "Mobile App v2",     "#5B7B9A", ["QA"]],
  ["BPI", "Brand & Identity",  "#7A8B6F", []],
  ["INF", "Infrastructure",    "#4F7A78", ["Review"]],
  ["RES", "User Research",     "#8A6BA8", []],
];

/* Tasks: [projectKey, column, title, priority, assigneeIdx, dueOffset, desc] */
const TASKS = [
  // ── WEB ────────────────────────────────────────────────────────────────
  ["WEB","Backlog","Audit current information architecture","medium",2,6,"Map every existing page and flag redundant routes."],
  ["WEB","Backlog","Define editorial type scale","low",0,10,"Fraunces / Inter / Plex Mono — lock the modular scale."],
  ["WEB","Backlog","Collect testimonials from clients","low",4,12,"Reach out to five recent clients for pull quotes."],
  ["WEB","Backlog","Accessibility colour-contrast audit","medium",5,9,"Verify WCAG AA across the terracotta palette."],
  ["WEB","Backlog","Draft the 404 and 500 pages","low",6,18,"Keep them warm and useful, not cute."],
  ["WEB","Backlog","Decide on analytics vendor","medium",1,15,"Privacy-first options only. No third-party cookies."],
  ["WEB","In Progress","Build responsive nav component","high",1,2,"Mobile drawer + desktop rail, keyboard accessible."],
  ["WEB","In Progress","Wire up auth flow","urgent",0,-1,"JWT session, bcrypt hashing, role checks on routes."],
  ["WEB","In Progress","Migrate blog to new CMS","medium",4,5,"Port 40 posts, preserve slugs and redirects."],
  ["WEB","In Progress","Implement dark mode tokens","medium",6,7,"Derive from the warm palette; avoid pure black."],
  ["WEB","Review","Copywriting pass on homepage","medium",2,3,"Sentence case, active voice, no filler."],
  ["WEB","Review","QA cross-browser rendering","high",5,4,"Safari, Firefox, Chrome, and mobile webkit."],
  ["WEB","Review","Lighthouse performance budget","high",1,2,"Target 95+ on mobile. Watch the font loading."],
  ["WEB","Done","Set up CI pipeline","high",1,-3,"Vitest + Supertest on push to main."],
  ["WEB","Done","Finalize hosting + DNS","medium",0,-6,"Cutover plan with rollback window."],
  ["WEB","Done","Choose the CDN","low",7,-9,"Edge caching for static assets."],

  // ── MOB ────────────────────────────────────────────────────────────────
  ["MOB","Backlog","Offline caching strategy","medium",3,14,"Decide between SW cache and local DB."],
  ["MOB","Backlog","Design onboarding carousel","low",4,16,"Three panels, skippable, with progress dots."],
  ["MOB","Backlog","Deep-link routing table","medium",9,20,"Map every screen to a universal link."],
  ["MOB","Backlog","Reduce cold-start time","high",7,11,"Currently 2.4s on a mid-tier Android."],
  ["MOB","In Progress","Push notification service","high",1,1,"APNs + FCM abstraction with retry."],
  ["MOB","In Progress","Biometric login","high",5,7,"Face ID / fingerprint with PIN fallback."],
  ["MOB","In Progress","Offline queue for task edits","urgent",9,-2,"Edits made offline must reconcile on reconnect."],
  ["MOB","QA","Regression pass on iOS 17","medium",3,5,"Focus on the drag interactions."],
  ["MOB","QA","Battery drain profiling","medium",7,8,"Background sync is suspiciously hungry."],
  ["MOB","Done","Set up crash reporting","medium",1,-4,"Wire Sentry into release builds."],
  ["MOB","Done","App Store screenshots","low",4,-7,"Six devices, three locales."],

  // ── BPI ────────────────────────────────────────────────────────────────
  ["BPI","Backlog","Moodboard for new wordmark","medium",0,8,"Editorial, warm, a little unexpected."],
  ["BPI","Backlog","Source paper stock for cards","low",2,20,""],
  ["BPI","Backlog","Photography art direction","medium",8,17,"Natural light, no stock-photo smiles."],
  ["BPI","In Progress","Refine logo grid","medium",4,3,"Tighten the mark on a 12-col baseline."],
  ["BPI","In Progress","Write the brand voice guide","medium",8,9,"Ten dos, ten don'ts, with real examples."],
  ["BPI","Done","Pick primary typeface","high",0,-2,"Fraunces wins for display."],
  ["BPI","Done","Lock the core palette","medium",0,-11,"Terracotta, paper, ink. Three accents."],

  // ── INF ────────────────────────────────────────────────────────────────
  ["INF","Backlog","Evaluate managed Postgres options","medium",9,13,"Compare cost at 500GB and 5k connections."],
  ["INF","Backlog","Disaster-recovery runbook","high",1,10,"RTO under an hour. Test it quarterly."],
  ["INF","Backlog","Container image slimming","low",7,22,"Multi-stage builds; drop the toolchain."],
  ["INF","In Progress","Add read replicas","high",9,4,"Route analytics queries away from primary."],
  ["INF","In Progress","Structured logging","medium",7,6,"JSON lines, one request id end to end."],
  ["INF","Review","Rotate all service credentials","urgent",1,-1,"Quarterly rotation is overdue."],
  ["INF","Done","Terraform the staging env","high",9,-5,"Staging now matches prod within a version."],
  ["INF","Done","Enable automated backups","urgent",1,-14,"Nightly, encrypted, off-region."],

  // ── RES ────────────────────────────────────────────────────────────────
  ["RES","Backlog","Recruit five power users","medium",10,12,"Screener: uses the board daily, 3+ months."],
  ["RES","Backlog","Draft the interview protocol","medium",10,7,"Open questions. Never lead the witness."],
  ["RES","In Progress","Synthesize onboarding interviews","high",10,2,"Eight sessions transcribed; themes emerging."],
  ["RES","In Progress","Card-sort the navigation","medium",2,5,"Open sort, 20 participants."],
  ["RES","Done","Ship the churn survey","medium",10,-8,"142 responses. Pricing is not the problem."],
];

/* Comments: [taskTitle, authorIdx, body] */
const COMMENTS = [
  ["Wire up auth flow", 1, "The refresh-token rotation still needs a test."],
  ["Wire up auth flow", 0, "On it — adding Supertest coverage now."],
  ["Wire up auth flow", 2, "Once this lands I'll gate the settings routes behind admin."],
  ["Wire up auth flow", 5, "Reminder that the viewer role should 403 on every mutation, not just tasks."],
  ["Audit current information architecture", 2, "First pass of the sitemap is attached."],
  ["Audit current information architecture", 0, "This is thorough. Let's cut /resources entirely."],
  ["Push notification service", 5, "FCM keys are in the vault under mobile/prod."],
  ["Push notification service", 1, "Retry with exponential backoff, cap at five attempts."],
  ["Offline queue for task edits", 9, "Last-write-wins will lose data here. We need a real merge."],
  ["Offline queue for task edits", 1, "Agreed. Let's spike a CRDT before committing to an approach."],
  ["Rotate all service credentials", 1, "Blocked on the ops handover doc."],
  ["Add read replicas", 9, "Replica lag is 200ms under load. Acceptable for analytics."],
  ["Refine logo grid", 4, "The counter in the 'g' is still too tight at 14px."],
  ["Refine logo grid", 0, "Good catch. Loosen it and re-cut the small sizes."],
  ["Synthesize onboarding interviews", 10, "Three of eight never found the board view. That's a nav problem."],
  ["Synthesize onboarding interviews", 2, "That tracks with the card-sort results."],
  ["Copywriting pass on homepage", 2, "Cut the hero from 40 words to 12. It reads much better."],
  ["Lighthouse performance budget", 1, "Font preload got us from 78 to 94. One more push."],
  ["Reduce cold-start time", 7, "Deferring the analytics SDK saved 600ms."],
  ["Implement dark mode tokens", 6, "Pure black looks awful against terracotta. Using #1A1613."],
];

/* Attachments: [taskTitle, uploaderIdx, filename, bytes] */
const FILES = [
  ["Audit current information architecture", 2, "ia-audit.pdf", 284000],
  ["Audit current information architecture", 2, "sitemap-v1.png", 512000],
  ["Wire up auth flow", 0, "auth-sequence.excalidraw", 48000],
  ["Refine logo grid", 4, "wordmark-grid.fig", 1450000],
  ["Synthesize onboarding interviews", 10, "interview-themes.md", 22000],
  ["Synthesize onboarding interviews", 10, "session-transcripts.zip", 3400000],
  ["Disaster-recovery runbook", 1, "dr-runbook-draft.pdf", 190000],
  ["Ship the churn survey", 10, "churn-results.csv", 76000],
  ["Photography art direction", 8, "reference-shots.zip", 8900000],
  ["Copywriting pass on homepage", 2, "homepage-copy-v3.docx", 34000],
];

async function main() {
  /* -------------------------------- users ------------------------------- */
  const U = [];
  for (const [name, email, color] of PEOPLE) {
    U.push(await createUser({ name, email, password: "password123", color }));
  }
  const [donna, marcus, priya, leo, sana, theo, iris, noah, ruth, kenji, amara] = U;

  /* --------------------------- org 1: Meridian --------------------------- */
  const org = await createOrg({ name: "Studio Meridian", slug: "meridian", createdBy: donna.id });
  const ROLES = [
    [marcus, "admin"], [priya, "member"], [leo, "viewer"], [sana, "member"],
    [theo, "member"], [iris, "member"], [noah, "member"], [ruth, "viewer"],
    [kenji, "admin"], [amara, "member"],
  ];
  for (const [u, role] of ROLES) await addMember({ orgId: org.id, userId: u.id, role });

  /* ------------------------------ projects ------------------------------ */
  const P = {};
  for (const [key, name, color, extras] of MERIDIAN_PROJECTS) {
    const p = await createProject({ orgId: org.id, name, key, color });
    // createProject seeds Backlog/In Progress/Done at 0,1,2. Splice extras in
    // before Done so the flow reads left to right.
    for (const extra of extras) {
      await query(`UPDATE columns SET position = position + 1
                    WHERE project_id = $1 AND name = 'Done'`, [p.id]);
      const { rows } = await query(
        `SELECT COALESCE(MAX(position),0) AS m FROM columns
          WHERE project_id = $1 AND name <> 'Done'`, [p.id]);
      await query(`INSERT INTO columns (project_id, name, position) VALUES ($1,$2,$3)`,
        [p.id, extra, Number(rows[0].m) + 1]);
    }
    const cols = await listColumns(p.id);
    P[key] = { ...p, cols: Object.fromEntries(cols.map((c) => [c.name, c.id])) };
  }

  /* -------------------------------- tasks ------------------------------- */
  const byTitle = {};
  for (const [key, col, title, priority, who, due, desc] of TASKS) {
    const t = await createTask({
      projectId: P[key].id,
      columnId: P[key].cols[col],
      title,
      description: desc || "",
      priority,
      assigneeId: U[who].id,
      dueDate: d(due),
      createdBy: donna.id,
    });
    byTitle[title] = t;
  }

  /* ------------------------ comments & attachments ---------------------- */
  for (const [title, who, body] of COMMENTS) {
    await addComment({ taskId: byTitle[title].id, userId: U[who].id, body });
  }
  for (const [title, who, filename, sizeBytes] of FILES) {
    await addAttachment({ taskId: byTitle[title].id, userId: U[who].id, filename, sizeBytes });
  }

  /* ----------------------------- notifications -------------------------- */
  const N = [
    [donna,  `Marcus mentioned you on \u201CWire up auth flow\u201D`, "Wire up auth flow"],
    [donna,  `Priya commented on \u201CWire up auth flow\u201D`,      "Wire up auth flow"],
    [donna,  `\u201CWire up auth flow\u201D is overdue`,              "Wire up auth flow"],
    [donna,  `Sana moved \u201CRefine logo grid\u201D to Review`,     "Refine logo grid"],
    [donna,  `Kenji updated \u201CAdd read replicas\u201D (priority \u2192 high)`, "Add read replicas"],
    [marcus, `\u201CRotate all service credentials\u201D is overdue`, "Rotate all service credentials"],
    [marcus, `Kenji commented on \u201CAdd read replicas\u201D`,      "Add read replicas"],
    [priya,  `Donna commented on \u201CAudit current information architecture\u201D`, "Audit current information architecture"],
    [kenji,  `Marcus commented on \u201COffline queue for task edits\u201D`, "Offline queue for task edits"],
    [amara,  `Priya commented on \u201CSynthesize onboarding interviews\u201D`, "Synthesize onboarding interviews"],
  ];
  for (const [user, body, title] of N) {
    await createNotification({ userId: user.id, body, taskId: byTitle[title]?.id ?? null });
  }
  // A couple already read, so the bell isn't uniformly unread.
  await query(`UPDATE notifications SET is_read = true
                WHERE user_id = $1 AND id IN (
                  SELECT id FROM notifications WHERE user_id = $1 ORDER BY id LIMIT 2)`, [donna.id]);

  const counts = await query(`
    SELECT (SELECT count(*) FROM users) users, (SELECT count(*) FROM organizations) orgs,
           (SELECT count(*) FROM projects) projects, (SELECT count(*) FROM tasks) tasks,
           (SELECT count(*) FROM comments) comments, (SELECT count(*) FROM attachments) files,
           (SELECT count(*) FROM notifications) notifs`);
  console.log("Seed complete:", counts.rows[0]);
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
