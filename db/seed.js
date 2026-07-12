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
  ["WEB","Backlog","Set up A/B testing framework","low",3,24,"Feature-flag driven, no client-side flicker."],
  ["WEB","Backlog","Image optimization pipeline","medium",7,19,"AVIF with JPEG fallback, responsive srcsets."],
  ["WEB","In Progress","Newsletter signup flow","low",4,8,"Double opt-in with a short welcome sequence."],
  ["WEB","Backlog","Add structured data for SEO","low",1,21,"JSON-LD for articles and the org profile."],
  ["WEB","Done","Set up CI pipeline","high",1,-3,"Vitest + Supertest on push to main."],
  ["WEB","Done","Finalize hosting + DNS","medium",0,-6,"Cutover plan with rollback window."],
  ["WEB","Done","Choose the CDN","low",7,-9,"Edge caching for static assets."],
  ["WEB","Done","Remove jQuery from legacy pages","medium",1,-12,"Four pages still pulled 1.9. Gone now."],
  ["WEB","Done","Compress hero imagery","low",6,-16,"Cut the homepage payload by 60%."],
  ["WEB","Done","Set up staging environment","high",9,-20,"Mirrors prod, reseeded nightly."],

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
  ["MOB","Backlog","Widget for today's tasks","low",5,26,"Home-screen widget, iOS and Android."],
  ["MOB","In Progress","Haptic feedback pass","low",4,10,"Subtle taps on drag, drop, and complete."],
  ["MOB","QA","Verify offline sync on flaky networks","high",9,3,"Throttle to 2G and airplane-mode mid-save."],
  ["MOB","Done","Set up crash reporting","medium",1,-4,"Wire Sentry into release builds."],
  ["MOB","Done","App Store screenshots","low",4,-7,"Six devices, three locales."],
  ["MOB","Done","Migrate to the new build pipeline","high",7,-10,"CI builds are 40% faster."],
  ["MOB","Done","Fix keyboard overlap on comment box","medium",3,-13,"The composer now scrolls into view."],

  // ── BPI ────────────────────────────────────────────────────────────────
  ["BPI","Backlog","Moodboard for new wordmark","medium",0,8,"Editorial, warm, a little unexpected."],
  ["BPI","Backlog","Source paper stock for cards","low",2,20,""],
  ["BPI","Backlog","Photography art direction","medium",8,17,"Natural light, no stock-photo smiles."],
  ["BPI","In Progress","Refine logo grid","medium",4,3,"Tighten the mark on a 12-col baseline."],
  ["BPI","In Progress","Write the brand voice guide","medium",8,9,"Ten dos, ten don'ts, with real examples."],
  ["BPI","Backlog","Design email signature set","low",8,28,""],
  ["BPI","In Progress","Social media templates","medium",8,6,"Nine formats from one master layout."],
  ["BPI","Done","Pick primary typeface","high",0,-2,"Fraunces wins for display."],
  ["BPI","Done","Lock the core palette","medium",0,-11,"Terracotta, paper, ink. Three accents."],
  ["BPI","Done","Icon set — first twelve glyphs","medium",4,-15,"Consistent 2px stroke on a 24px grid."],

  // ── INF ────────────────────────────────────────────────────────────────
  ["INF","Backlog","Evaluate managed Postgres options","medium",9,13,"Compare cost at 500GB and 5k connections."],
  ["INF","Backlog","Disaster-recovery runbook","high",1,10,"RTO under an hour. Test it quarterly."],
  ["INF","Backlog","Container image slimming","low",7,22,"Multi-stage builds; drop the toolchain."],
  ["INF","In Progress","Add read replicas","high",9,4,"Route analytics queries away from primary."],
  ["INF","In Progress","Structured logging","medium",7,6,"JSON lines, one request id end to end."],
  ["INF","Review","Rotate all service credentials","urgent",1,-1,"Quarterly rotation is overdue."],
  ["INF","Backlog","Rate limiting on the public API","high",9,16,"Token bucket per key, 429 with Retry-After."],
  ["INF","In Progress","Alert on error-budget burn","medium",7,5,"Page only when the burn rate says we'll miss SLO."],
  ["INF","Done","Terraform the staging env","high",9,-5,"Staging now matches prod within a version."],
  ["INF","Done","Enable automated backups","urgent",1,-14,"Nightly, encrypted, off-region."],
  ["INF","Done","Postgres minor version upgrade","medium",9,-18,"Zero downtime via replica promotion."],
  ["INF","Done","Set up uptime monitoring","medium",7,-21,"Alerts route to the on-call channel."],

  // ── RES ────────────────────────────────────────────────────────────────
  ["RES","Backlog","Recruit five power users","medium",10,12,"Screener: uses the board daily, 3+ months."],
  ["RES","Backlog","Draft the interview protocol","medium",10,7,"Open questions. Never lead the witness."],
  ["RES","In Progress","Synthesize onboarding interviews","high",10,2,"Eight sessions transcribed; themes emerging."],
  ["RES","Backlog","Diary study for mobile usage","low",10,30,"Two weeks, twelve participants."],
  ["RES","In Progress","Card-sort the navigation","medium",2,5,"Open sort, 20 participants."],
  ["RES","In Progress","Pricing sensitivity survey","medium",10,4,"Van Westendorp, 200 responses target."],
  ["RES","Done","Ship the churn survey","medium",10,-8,"142 responses. Pricing is not the problem."],
  ["RES","Done","Competitive teardown","medium",2,-19,"Six competitors, feature and pricing matrix."],
  ["RES","Done","Analytics audit of drop-off points","high",10,-23,"Signup step three loses 40% of users."],
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
  ["Regression pass on iOS 17", 7, "Drag drops the card if a notification lands mid-gesture. Repro attached."],
  ["Battery drain profiling", 3, "Sync interval was 30s in release builds. Bumping to 5m."],
  ["Rate limiting on the public API", 1, "Start with 100 req/min per key and watch the logs."],
  ["Social media templates", 0, "The story format needs a safe zone for the caption."],
  ["Pricing sensitivity survey", 2, "Let's segment by team size when we analyze."],
  ["Analytics audit of drop-off points", 10, "The password rules are the culprit — nobody reads them until they fail."],
  ["Newsletter signup flow", 4, "Confirmation email lands in spam on Outlook. Investigating DKIM."],
  ["Build responsive nav component", 6, "Focus trap works; arrow-key support next."],
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
  ["Regression pass on iOS 17", 3, "drag-bug-repro.mov", 5600000],
  ["Social media templates", 8, "template-master.fig", 2300000],
  ["Competitive teardown", 2, "teardown-matrix.xlsx", 145000],
  ["Analytics audit of drop-off points", 10, "funnel-report.pdf", 210000],
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
    [donna,  `Iris commented on \u201CImplement dark mode tokens\u201D`,  "Implement dark mode tokens"],
    [donna,  `\u201CShip the churn survey\u201D was moved to Done`,      "Ship the churn survey"],
    [priya,  `Amara commented on \u201CAnalytics audit of drop-off points\u201D`, "Analytics audit of drop-off points"],
    [sana,   `Noah commented on \u201CNewsletter signup flow\u201D`,     "Newsletter signup flow"],
    [noah,   `Leo commented on \u201CBattery drain profiling\u201D`,     "Battery drain profiling"],
  ];
  for (const [user, body, title] of N) {
    await createNotification({ userId: user.id, body, taskId: byTitle[title]?.id ?? null });
  }

   // A couple already read, so the bell isn't uniformly unread.
  await query(`UPDATE notifications SET is_read = true
                WHERE user_id = $1 AND id IN (
                  SELECT id FROM notifications WHERE user_id = $1 ORDER BY id LIMIT 2)`, [donna.id]);

  /* --------------------- backdate timestamps for charts ------------------ */
  // Everything above was inserted "now", which flattens the dashboard: the
  // weekly chart shows a single spike and the monthly growth chart a cliff.
  // Spread task creation across the last ~5 months in a growth curve, keep a
  // busy final week, and stamp Done tasks with completion times through the
  // last 7 days so both activity charts have real shape.
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
  const { rows: doneTasks } = await query(
    `SELECT t.id FROM tasks t JOIN columns c ON c.id = t.column_id WHERE c.name = 'Done' ORDER BY t.id`
  );
  for (let i = 0; i < doneTasks.length; i++) {
    await query(
      `UPDATE tasks
          SET updated_at = GREATEST(created_at, now() - make_interval(days => $2, hours => 3))
        WHERE id = $1`,
      [doneTasks[i].id, i % 7]
    );
  }

  // Scatter comment/attachment/notification times over recent days so the
  // task drawer and bell don't read "just now" on every row.
  await query(`UPDATE comments      SET created_at = now() - make_interval(hours => (id * 7)  % 200)`);
  await query(`UPDATE attachments   SET created_at = now() - make_interval(hours => (id * 13) % 340)`);
  await query(`UPDATE notifications SET created_at = now() - make_interval(hours => (id * 5)  % 70)`);

  const counts = await query(`
    SELECT (SELECT count(*) FROM users) users, (SELECT count(*) FROM organizations) orgs,
           (SELECT count(*) FROM projects) projects, (SELECT count(*) FROM tasks) tasks,
           (SELECT count(*) FROM comments) comments, (SELECT count(*) FROM attachments) files,
           (SELECT count(*) FROM notifications) notifs`);
  console.log("Seed complete:", counts.rows[0]);
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
