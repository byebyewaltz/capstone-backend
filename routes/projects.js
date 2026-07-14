import express from "express";
import requireBody from "#middleware/requireBody";
import asyncHandler from "#middleware/asyncHandler";
import { resourceParam } from "#middleware/loadResource";
import { requireRole } from "#middleware/auth";
import {
  getProjectById, listProjectsForOrg, createProject, listColumns,
} from "#db/projects";
import { projectAnalytics, searchTasks } from "#db/tasks";
import tasksRouter from "#routes/tasks";

const router = express.Router({ mergeParams: true });

// Org-level analytics + search sit above individual projects.
// GET /orgs/:orgId/projects/analytics
router.get("/analytics", asyncHandler(async (req, res) => {
  res.json(await projectAnalytics(Number(req.params.orgId)));
}));

// GET /orgs/:orgId/projects/search?q=
router.get("/search", asyncHandler(async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json([]);
  res.json(await searchTasks(Number(req.params.orgId), q));
}));

router.param("projectId", resourceParam({
  fetch: getProjectById, as: "project", notFound: "Project not found.",
  belongsTo: (project, req) => project.org_id === Number(req.params.orgId),
}));

// GET projects for the org
router.get("/", asyncHandler(async (req, res) => {
  res.json(await listProjectsForOrg(Number(req.params.orgId)));
}));

// POST project — admins and up.
router.post("/", requireRole("admin"), requireBody("name", "key"),
  asyncHandler(async (req, res) => {
    const { name, key, color } = req.body;
    const project = await createProject({
      orgId: Number(req.params.orgId), name, key, color,
    });
    res.status(201).json(project);
  })); // 23505 -> 409 for duplicate key in org

router.get("/:projectId", (req, res) => res.json(req.project));

router.get("/:projectId/columns", asyncHandler(async (req, res) => {
  res.json(await listColumns(req.project.id));
}));

// Nested task routes.
router.use("/:projectId/tasks", tasksRouter);

export default router;
