import { CaseStatusChange } from '../../../core/api/cases.api';
import { CaseDetail, TaskOutcome, WorkflowTask } from '../../../core/api/cases.models';
import { outcomeLabel, outcomePastLabel } from '../../../shared/labels';

/** One outcome the current step allows, described by what it will do to the case. */
export interface OutcomeChoice {
  outcome: TaskOutcome;
  /** "Approve", "Return to Intake"… */
  label: string;
  /** What happens next, in a sentence. */
  effect: string;
  /** Sending work back or stopping it needs a reason on the record. */
  notesRequired: boolean;
}

/** Outcomes that need notes, as the API requires. */
export const outcomesNeedingNotes: readonly TaskOutcome[] = ['Reject', 'Return', 'RequestInfo'];

// The order choices are offered in: moving forward first, stopping last.
const order: readonly TaskOutcome[] = ['Approve', 'Complete', 'Return', 'RequestInfo', 'Reject'];

/**
 * The outcomes `task` allows, each with its effect, following the workflow engine's rules. Return
 * is left out when there's no completed earlier step to return to, because the API would refuse it.
 */
export function outcomeChoices(tasks: readonly WorkflowTask[], task: WorkflowTask): OutcomeChoice[] {
  const choices: OutcomeChoice[] = [];
  for (const outcome of order.filter((o) => task.allowedOutcomes.includes(o))) {
    const notesRequired = outcomesNeedingNotes.includes(outcome);
    switch (outcome) {
      case 'Approve':
      case 'Complete': {
        const next = nextStep(tasks);
        const effect = next
          ? `Moves the case to ${next.name}, in the ${next.departmentName} queue.`
          : 'This is the last step, so the case closes as completed.';
        choices.push({ outcome, label: outcomeLabel(outcome), effect, notesRequired });
        break;
      }
      case 'Return': {
        const previous = previousStep(tasks, task);
        if (previous) {
          const who = previous.assigneeName ? `, assigned to ${previous.assigneeName}` : '';
          choices.push({
            outcome,
            label: `Return to ${previous.name}`,
            effect: `Sends the case back to ${previous.name}${who}. This step runs again after it.`,
            notesRequired,
          });
        }
        break;
      }
      case 'RequestInfo':
        choices.push({
          outcome,
          label: outcomeLabel(outcome),
          effect: 'Puts the case on hold with your request. Resume it here when the information arrives.',
          notesRequired,
        });
        break;
      case 'Reject':
        choices.push({ outcome, label: outcomeLabel(outcome), effect: 'Closes the case as rejected.', notesRequired });
        break;
    }
  }

  return choices;
}

/** What happened after `task` was completed with `outcome`, given the case the API returned. */
export function completionMessage(task: Pick<WorkflowTask, 'name'>, outcome: TaskOutcome, updated: CaseDetail): string {
  const next = updated.tasks.find((t) => t.status === 'Active');
  switch (outcome) {
    case 'RequestInfo':
      return `Information requested. The case is on hold until it's resumed.`;
    case 'Reject':
      return `${task.name} rejected. The case is closed as rejected.`;
    case 'Return':
      return `${task.name} returned. The case went back to ${next?.name ?? 'the previous step'}.`;
    default: {
      const done = `${task.name} ${outcomePastLabel(outcome).toLowerCase()}.`;
      return next ? `${done} The case moved to ${next.name}, in the ${next.departmentName} queue.` : `${done} The case is closed.`;
    }
  }
}

/** What an assignment did, given the case the API returned. */
export function assignmentMessage(taskId: number, updated: CaseDetail): string {
  const task = updated.tasks.find((t) => t.id === taskId);
  if (!task) {
    return 'The task was updated.';
  }

  return task.assigneeName
    ? `${task.name} is assigned to ${task.assigneeName}.`
    : `${task.name} is back in the ${task.departmentName} queue.`;
}

/** What a hold, cancel or reopen did, given the case the API returned. */
export function statusChangeMessage(change: CaseStatusChange, wasOnHold: boolean, updated: CaseDetail): string {
  switch (change) {
    case 'hold':
      return 'The case is on hold. Its current step is paused until the case is resumed.';
    case 'cancel':
      return 'The case was cancelled.';
    case 'reopen': {
      if (wasOnHold) {
        return 'The case was resumed.';
      }

      const step = updated.tasks.find((t) => t.status === 'Active');
      return step ? `The case was reopened. ${step.name} is in the ${step.departmentName} queue.` : 'The case was reopened.';
    }
  }
}

/** The step that Approve or Complete activates: the lowest pending one. */
function nextStep(tasks: readonly WorkflowTask[]): WorkflowTask | undefined {
  return tasks.filter((t) => t.status === 'Pending').sort((a, b) => a.sequence - b.sequence || a.id - b.id)[0];
}

/** The step that Return reactivates: the latest completed instance of an earlier step. */
function previousStep(tasks: readonly WorkflowTask[], task: WorkflowTask): WorkflowTask | undefined {
  const earlier = tasks
    .filter((t) => t.sequence < task.sequence && t.status === 'Completed')
    .sort((a, b) => a.sequence - b.sequence || Date.parse(a.completedAt ?? '') - Date.parse(b.completedAt ?? ''));
  return earlier[earlier.length - 1];
}
