import { httpError } from "#middleware/errorHandler";
import { getColumnById } from "#db/projects";
import { getMembership } from "#db/orgs";

// A task may only be assigned to someone who belongs to the same organization.
// Without this, assigning to an outsider would create a notification carrying
// the task title and project id into an org they cannot otherwise see.
export async function resolveAssignee(orgId, assigneeId) {
  if (assigneeId === undefined || assigneeId === null || assigneeId === "") return null;
  const id = Number(assigneeId);
  if (!Number.isInteger(id)) {
    throw httpError(400, "Assignee must be a user id.");
  }
  const membership = await getMembership(Number(orgId), id);
  if (!membership) {
    throw httpError(422, "That person is not a member of this organization.");
  }
  return id;
}

// A column reference is only valid inside its own project — creating a task
// in, or moving one to, another project's column would let it escape the
// board. Returns the column, or throws the caller's 400.
export async function resolveColumn(columnId, projectId, message) {
  const column = await getColumnById(Number(columnId));
  if (!column || column.project_id !== Number(projectId)) {
    throw httpError(400, message);
  }
  return column;
}
