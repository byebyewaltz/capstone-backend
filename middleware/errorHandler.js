// Wraps async route/param handlers so they can throw or reject into next().
export const h = (fn) => async (req, res, next, ...args) => {
  try { await fn(req, res, next, ...args); } catch (err) { next(err); }
};

// PostgreSQL error code -> HTTP status.
const PG = {
  23505: [409, "That value already exists."],
  23503: [400, "Referenced record does not exist."],
  23502: [400, "A required field was null."],
  "22P02": [400, "Invalid value for a field."],
  23514: [400, "A field failed a constraint check."],
};

export default function errorHandler(err, req, res, _next) {
  if (PG[err?.code]) {
    const [status, error] = PG[err.code];
    return res.status(status).json({ error, detail: err.detail });
  }
  if (err?.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "Internal server error." });
}
