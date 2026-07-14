import { createNotification } from "#db/activity";

// Notifies a user about task activity — unless they are the actor themselves;
// nobody needs a ping about their own edit.
export function notify(actor, userId, body, taskId) {
  if (userId && userId !== actor.id) {
    return createNotification({ userId, body, taskId });
  }
}

// The assignment ping is sent from two places — task creation with an
// assignee, and reassignment to a new owner — so the wording lives here once.
export function notifyAssigned(actor, task) {
  return notify(actor, task.assignee_id,
    `${actor.name} assigned you “${task.title}”`, task.id);
}
