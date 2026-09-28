import { WorkflowTask } from '../../../core/api/cases.models';
import { outcomePastLabel } from '../../../shared/labels';

export type StepState = 'done' | 'rejected' | 'current' | 'pending' | 'skipped';

/** One workflow step as the stepper shows it: its latest instance, and how many there were. */
export interface StepView {
  sequence: number;
  name: string;
  state: StepState;
  /** "Approved", "Current", "Not started"… */
  stateLabel: string;
  task: WorkflowTask;
  /** More than 1 when the step was returned to or reopened. */
  attempts: number;
}

/**
 * The case's steps in order. A returned or reopened step has several task instances with the
 * same sequence; the last one (highest id) is its current state.
 */
export function workflowSteps(tasks: readonly WorkflowTask[]): StepView[] {
  const bySequence = new Map<number, WorkflowTask[]>();
  for (const task of [...tasks].sort((a, b) => a.sequence - b.sequence || a.id - b.id)) {
    bySequence.set(task.sequence, [...(bySequence.get(task.sequence) ?? []), task]);
  }

  return [...bySequence.entries()].map(([sequence, instances]) => {
    const task = instances[instances.length - 1];
    const state = stateOf(task);
    return { sequence, name: task.name, state, stateLabel: stateLabel(task, state), task, attempts: instances.length };
  });
}

function stateOf(task: WorkflowTask): StepState {
  switch (task.status) {
    case 'Active':
      return 'current';
    case 'Completed':
      return task.outcome === 'Reject' ? 'rejected' : 'done';
    case 'Skipped':
      return 'skipped';
    default:
      return 'pending';
  }
}

function stateLabel(task: WorkflowTask, state: StepState): string {
  switch (state) {
    case 'current':
      return 'Current';
    case 'pending':
      return 'Not started';
    case 'skipped':
      return 'Skipped';
    default:
      return task.outcome ? outcomePastLabel(task.outcome) : 'Completed';
  }
}
