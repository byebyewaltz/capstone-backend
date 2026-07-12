import express from "express";
import authRouter from "#routes/auth";
import orgsRouter from "#routes/orgs";
import notificationsRouter from "#routes/notifications";
import errorHandler from "#middleware/errorHandler";

const app = express();

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
