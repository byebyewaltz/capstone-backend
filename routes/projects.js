import express from "express";
import requireBody from "#middleware/requireBody";
import { requireRole } from "#middleware/auth";
import {
  getProjectById, listProjectsForOrg, createProject, listColumns,
} from "#db/projects";
import { projectAnalytics, searchTasks } from "#db/tasks";
import tasksRouter from "#routes/tasks";

const router = express.Router({ mergeParams: true });

// Org-level analytics + search sit above individual projects.
// GET /orgs/:orgId/projects/analytics
router.get("/analytics", async (req, res, next) => {
  try {
    res.json(await projectAnalytics(Number(req.params.orgId)));
  } catch (err) { next(err); }
});

// GET /orgs/:orgId/projects/search?q=
router.get("/search", async (req, res, next) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) return res.json([]);
    res.json(await searchTasks(Number(req.params.orgId), q));
  } catch (err) { next(err); }
});

router.param("projectId", async (req, res, next, id) => {
  try {
    const project = await getProjectById(Number(id));
    if (!project || project.org_id !== Number(req.params.orgId)) {
      return res.status(404).json({ error: "Project not found." });
    }
    req.project = project;
    next();
  } catch (err) { next(err); }
});

// GET projects for the org
router.get("/", async (req, res, next) => {
  try {
    res.json(await listProjectsForOrg(Number(req.params.orgId)));
  } catch (err) { next(err); }
});

// POST project — admins and up.
router.post("/", requireRole("admin"), requireBody("name", "key"),
  async (req, res, next) => {
    try {
      const { name, key, color } = req.body;
      const project = await createProject({
        orgId: Number(req.params.orgId), name, key, color,
      });
      res.status(201).json(project);
    } catch (err) { next(err); } // 23505 -> 409 for duplicate key in org
  });

router.get("/:projectId", (req, res) => res.json(req.project));

router.get("/:projectId/columns", async (req, res, next) => {
  try {
    res.json(await listColumns(req.project.id));
  } catch (err) { next(err); }
});

// Nested task routes.
router.use("/:projectId/tasks", tasksRouter);

export default router;
