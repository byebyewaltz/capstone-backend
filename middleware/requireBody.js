// 400s any request missing one of the named body fields.
export default (...fields) => (req, res, next) => {
  if (!req.body || typeof req.body !== "object")
    return res.status(400).json({ error: "Request body is required." });
  const missing = fields.filter((f) => [undefined, null, ""].includes(req.body[f]));
  if (missing.length)
    return res.status(400).json({ error: `Missing required field(s): ${missing.join(", ")}` });
  next();
};
