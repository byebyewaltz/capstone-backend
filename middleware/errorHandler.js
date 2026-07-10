// h() wraps async handlers/params so rejections reach the error handler.
// Works for both (req,res,next) handlers and (req,res,next,value) param callbacks.
export const h = (fn) => (req, res, next, ...rest) =>
  Promise.resolve(fn(req, res, next, ...rest)).catch(next);

const PG = { 23505: [409, "That value is already taken."],
             23503: [400, "A referenced record does not exist."],
             "22P02": [400, "Invalid value."] };

export default (err, req, res, next) => {
  const [status, message] = PG[err.code] ?? [err.status || 500, err.message || "Internal server error."];
  if (status === 500) console.error(err);
  res.status(status).json({ error: message });
};
