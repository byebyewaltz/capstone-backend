import "dotenv/config";
import express from "express";
import authRouter from "#routes/auth";
import orgsRouter from "#routes/orgs";
import notificationsRouter from "#routes/notifications";
import errorHandler from "#middleware/errorHandler";

const app = express();

// Cross-origin support for split deployments (SPA on one host, API on
// another). CORS_ORIGIN holds the allowed origin(s), comma-separated; unset
// means same-origin (the dev proxy) and adds no headers. Auth is a bearer
// header, not a cookie, so no credentials handling is needed.
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);

if (ALLOWED_ORIGINS.length > 0) {
  app.use((req, res, next) => {
    if (ALLOWED_ORIGINS.includes(req.headers.origin)) {
      res.set("Access-Control-Allow-Origin", req.headers.origin);
      res.set("Vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      return res.sendStatus(204);
    }
    next();
  });
}

app.use(express.json());

// Liveness probe.
app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use("/auth", authRouter);
app.use("/orgs", orgsRouter); // nests /projects, which nests /tasks
app.use("/notifications", notificationsRouter);

// Anything unmatched is a 404, in the same JSON shape as other errors.
app.use((req, res) => res.status(404).json({ error: "Route not found." }));

app.use(errorHandler);

export default app;
