// Date-string helpers. The API and the database speak "YYYY-MM-DD" for due
// dates; these keep every producer and comparer on that one format.

// pg returns DATE columns as local-midnight Date objects while request bodies
// carry "YYYY-MM-DD" strings; normalize both so due dates compare correctly.
export function ymd(d) {
  if (d == null || d === "") return null;
  if (d instanceof Date) {
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");
  }
  return String(d).slice(0, 10);
}

// Today shifted by `offset` days, as "YYYY-MM-DD" — used by the seed so demo
// due dates are always relative to the run and never look stale.
export function daysFromNow(offset) {
  const x = new Date();
  x.setDate(x.getDate() + offset);
  return x.toISOString().slice(0, 10);
}
