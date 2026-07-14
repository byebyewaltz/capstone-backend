// Wraps an async handler so a rejected promise lands in next(err) and the
// central error handler, instead of every route carrying its own try/catch.
// The rest parameter keeps it usable for router.param callbacks too, which
// receive the parameter value as a fourth argument.
export default function asyncHandler(fn) {
  return async (req, res, next, ...params) => {
    try {
      await fn(req, res, next, ...params);
    } catch (err) {
      next(err);
    }
  };
}
