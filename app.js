import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import authRouter from "#routes/auth";
import orgsRouter from "#routes/orgs";
import notificationsRouter from "#routes/notifications";
import errorHandler from "#middleware/errorHandler";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(express.json()); 

// The analytics dashboard (charts) lives at "/".
app.use(express.static(path.join(__dirname, "public")));

// Liveness probe. No auth, no database — if the process is up, this is 200.
app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use("/auth", authRouter);
app.use("/orgs", orgsRouter);
app.use("/notifications", notificationsRouter);

// Anything unmatched is a JSON 404, never an HTML error page. 
app.use((req, res) => res.status(404).json({ error: "Not found." }));

app.use(errorHandler);

export default app;
