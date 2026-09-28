import { testTask } from './case-detail.testing';
import { workflowSteps } from './workflow-steps';

describe('workflowSteps', () => {
  it('lists steps in order with their state', () => {
    const steps = workflowSteps([
      testTask({ id: 3, name: 'Inspection', sequence: 3 }),
      testTask({ id: 1, name: 'Intake', sequence: 1, status: 'Completed', outcome: 'Approve' }),
      testTask({ id: 2, name: 'Plan Review', sequence: 2, status: 'Active' }),
    ]);

    expect(steps.map((s) => [s.name, s.state, s.stateLabel])).toEqual([
      ['Intake', 'done', 'Approved'],
      ['Plan Review', 'current', 'Current'],
      ['Inspection', 'pending', 'Not started'],
    ]);
  });

  it('shows a returned step by its latest instance and counts the attempts', () => {
    // Plan Review was returned: Intake got a second, active instance and Plan Review a fresh pending one.
    const steps = workflowSteps([
      testTask({ id: 1, name: 'Intake', sequence: 1, status: 'Completed', outcome: 'Approve' }),
      testTask({ id: 2, name: 'Plan Review', sequence: 2, status: 'Completed', outcome: 'Return' }),
      testTask({ id: 4, name: 'Intake', sequence: 1, status: 'Active' }),
      testTask({ id: 5, name: 'Plan Review', sequence: 2, status: 'Pending' }),
    ]);

    expect(steps.map((s) => [s.name, s.state, s.task.id, s.attempts])).toEqual([
      ['Intake', 'current', 4, 2],
      ['Plan Review', 'pending', 5, 2],
    ]);
  });

  it('marks rejected and skipped steps', () => {
    const steps = workflowSteps([
      testTask({ id: 1, sequence: 1, status: 'Completed', outcome: 'Reject' }),
      testTask({ id: 2, sequence: 2, status: 'Skipped' }),
    ]);

    expect(steps.map((s) => [s.state, s.stateLabel])).toEqual([
      ['rejected', 'Rejected'],
      ['skipped', 'Skipped'],
    ]);
  });
});
