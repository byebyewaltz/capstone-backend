import express from "express";
import cors from "cors";
import authRouter from "#routes/auth";
import orgsRouter from "#routes/orgs";
import notifRouter from "#routes/notifications";
import errorHandler from "#middleware/errorHandler";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use("/auth", authRouter);
app.use("/orgs", orgsRouter);
app.use("/notifications", notifRouter);

// Unknown route -> 404 JSON (before the error handler).
app.use((req, res) => res.status(404).json({ error: "Not found." }));

app.use(errorHandler);

export default app;
