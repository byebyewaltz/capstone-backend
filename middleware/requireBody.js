// Rejects requests missing any of the named fields with a 400. Keeps route
// handlers free of repetitive presence checks.
export default function requireBody(...fields) {
  return (req, res, next) => {
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "Request body is required." });
    }
    const missing = fields.filter((f) => {
      const v = req.body[f];
      return v === undefined || v === null || v === "";
    });
    if (missing.length) {
      return res
        .status(400)
        .json({ error: `Missing required field(s): ${missing.join(", ")}` });
    }
    next();
  };
}
