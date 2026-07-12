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

<<<<<<< HEAD
// Anything unmatched is a 404, in the same JSON shape as other errors.
app.use((req, res) => res.status(404).json({ error: "Route not found." }));
=======
// Anything unmatched is a JSON 404, never an HTML error page. 
app.use((req, res) => res.status(404).json({ error: "Not found." }));
>>>>>>> 35cbbd6d4c8862f0a707b40ced8d55f2bef3bbd7

app.use(errorHandler);

export default app;
