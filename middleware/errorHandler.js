// Central error handler. Maps common PostgreSQL error codes to HTTP statuses
// so route handlers can stay thin and just `next(err)`.
//   23505 unique_violation      -> 409
//   23503 foreign_key_violation -> 400
//   23502 not_null_violation    -> 400
//   22P02 invalid_text_repr     -> 400 (e.g. bad enum / non-integer id)
//   23514 check_violation       -> 400
const PG_MAP = {
  "23505": [409, "That value already exists."],
  "23503": [400, "Referenced record does not exist."],
  "23502": [400, "A required field was null."],
  "22P02": [400, "Invalid value for a field."],
  "23514": [400, "A field failed a constraint check."],
};

// Builds an error the handler below will render as that HTTP response, for
// business-rule failures raised from helpers rather than route handlers.
export function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

export default function errorHandler(err, req, res, _next) {
  if (err && PG_MAP[err.code]) {
    const [status, message] = PG_MAP[err.code];
    // PG's `detail` names columns and echoes values, so it stays out of
    // production responses; in development it makes 4xx causes obvious.
    const detail = process.env.NODE_ENV === "production" ? undefined : err.detail;
    return res.status(status).json({ error: message, detail });
  }
  if (err && err.status) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error." });
}
