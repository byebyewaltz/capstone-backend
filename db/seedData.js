// Seed data for db/seed.js — one exported table per entity. Every row
// becomes one insert. Order matters: tests reference tasks (and users)
// by id, so PEOPLE and TASKS must keep their sequence.

/* People: [name, email, color, role]. Index 0 founds the org as owner. */
export const PEOPLE = [
  ["Donna Chen",     "donna@taskforge.io",  "#C4623D", "owner"],
  ["Marcus Reed",    "marcus@taskforge.io", "#5B7B9A", "admin"],
  ["Priya Nair",     "priya@taskforge.io",  "#7A8B6F", "member"],
  ["Leo Park",       "leo@taskforge.io",    "#D89B4A", "viewer"],
  ["Sana Okonkwo",   "sana@taskforge.io",   "#B5566B", "member"],
  ["Theo Vance",     "theo@taskforge.io",   "#6B8E5A", "member"],
  ["Iris Kaminski",  "iris@taskforge.io",   "#8A6BA8", "member"],
  ["Noah Ferreira",  "noah@taskforge.io",   "#4F7A78", "member"],
  ["Ruth Blackwood", "ruth@taskforge.io",   "#A8763E", "viewer"],
  ["Kenji Sato",     "kenji@taskforge.io",  "#3F6B8C", "admin"],
  ["Amara Diallo",   "amara@taskforge.io",  "#9C5A6B", "member"],
];

/* Projects: [key, name, color, extraColumns spliced in before Done]. */
export const PROJECTS = [
  ["WEB", "Website Relaunch", "#C4623D", ["Review"]],
  ["MOB", "Mobile App v2",    "#5B7B9A", ["QA"]],
  ["BPI", "Brand & Identity", "#7A8B6F", []],
  ["INF", "Infrastructure",   "#4F7A78", ["Review"]],
  ["RES", "User Research",    "#8A6BA8", []],
];

/* Tasks: [projectKey, column, title, priority, assigneeIdx, dueOffset, desc] */
export const TASKS = [
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
export const COMMENTS = [
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
export const FILES = [
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

/* Notifications: [recipientIdx, body, taskTitle] */
export const NOTIFS = [
  [0,  "Marcus mentioned you on “Wire up auth flow”",                 "Wire up auth flow"],
  [0,  "Priya commented on “Wire up auth flow”",                      "Wire up auth flow"],
  [0,  "“Wire up auth flow” is overdue",                              "Wire up auth flow"],
  [0,  "Sana moved “Refine logo grid” to Review",                     "Refine logo grid"],
  [0,  "Kenji updated “Add read replicas” (priority → high)",         "Add read replicas"],
  [1,  "“Rotate all service credentials” is overdue",                 "Rotate all service credentials"],
  [1,  "Kenji commented on “Add read replicas”",                      "Add read replicas"],
  [2,  "Donna commented on “Audit current information architecture”", "Audit current information architecture"],
  [9,  "Marcus commented on “Offline queue for task edits”",          "Offline queue for task edits"],
  [10, "Priya commented on “Synthesize onboarding interviews”",       "Synthesize onboarding interviews"],
  [0,  "Iris commented on “Implement dark mode tokens”",              "Implement dark mode tokens"],
  [0,  "“Ship the churn survey” was moved to Done",                   "Ship the churn survey"],
  [2,  "Amara commented on “Analytics audit of drop-off points”",     "Analytics audit of drop-off points"],
  [4,  "Noah commented on “Newsletter signup flow”",                  "Newsletter signup flow"],
  [7,  "Leo commented on “Battery drain profiling”",                  "Battery drain profiling"],
];
