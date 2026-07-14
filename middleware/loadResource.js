import asyncHandler from "#middleware/asyncHandler";

// The fetch-or-404 pattern shared by every id-carrying route: look the record
// up, 404 if it does not exist, attach it to req so handlers never re-fetch.
//
// `belongsTo` (optional) scopes the record to its parent — a record outside
// the caller's org/project/task gets the very same 404 as a missing one, so
// foreign ids cannot be probed for existence.
//
// resourceParam returns a router.param callback (Express passes the raw id as
// the fourth argument).
export function resourceParam({ fetch, as, notFound, belongsTo }) {
  return asyncHandler(async (req, res, next, id) => {
    const record = await fetch(Number(id));
    if (!record || (belongsTo && !belongsTo(record, req))) {
      return res.status(404).json({ error: notFound });
    }
    req[as] = record;
    next();
  });
}

// The same contract as ordinary route middleware, for lookups that must run
// after other guards in the chain (e.g. a role check should 403 before the
// lookup gets a chance to 404).
export function loadResource(param, options) {
  const handler = resourceParam(options);
  return (req, res, next) => handler(req, res, next, req.params[param]);
}
