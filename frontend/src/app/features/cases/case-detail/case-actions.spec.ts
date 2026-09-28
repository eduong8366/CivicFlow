import { assignmentMessage, completionMessage, outcomeChoices, statusChangeMessage } from './case-actions';
import { testCase, testTask } from './case-detail.testing';

describe('outcomeChoices', () => {
  const intake = testTask({ id: 11, status: 'Completed', outcome: 'Approve', assigneeName: 'Luis Ortega', completedAt: '2026-09-20T19:32:00+00:00' });
  const review = testTask({
    id: 12,
    name: 'Plan Review',
    sequence: 2,
    status: 'Active',
    allowedOutcomes: ['Reject', 'Return', 'Approve', 'RequestInfo'],
  });
  const inspection = testTask({ id: 13, name: 'Inspection', sequence: 3, departmentName: 'Public Works' });

  it('offers the allowed outcomes, forward first, each with its effect', () => {
    const choices = outcomeChoices([intake, review, inspection], review);

    expect(choices.map((c) => c.label)).toEqual(['Approve', 'Return to Intake', 'Request info', 'Reject']);
    expect(choices[0].effect).toBe('Moves the case to Inspection, in the Public Works queue.');
    expect(choices[1].effect).toBe('Sends the case back to Intake, assigned to Luis Ortega. This step runs again after it.');
    expect(choices[3].effect).toBe('Closes the case as rejected.');
    expect(choices.map((c) => c.notesRequired)).toEqual([false, true, true, true]);
  });

  it('says the last step closes the case', () => {
    const last = testTask({ id: 13, name: 'Inspection', sequence: 3, status: 'Active', allowedOutcomes: ['Complete'] });

    expect(outcomeChoices([intake, review, last], last)[0].effect).toBe('This is the last step, so the case closes as completed.');
  });

  it('leaves out Return when no earlier step was completed', () => {
    const first = testTask({ id: 11, status: 'Active', allowedOutcomes: ['Approve', 'Return'] });

    expect(outcomeChoices([first, inspection], first).map((c) => c.outcome)).toEqual(['Approve']);
  });

  it('returns to the latest completed instance of the previous step', () => {
    const again = testTask({ ...intake, id: 14, assigneeName: 'Mia Chen', completedAt: '2026-09-25T10:00:00+00:00' });

    const choice = outcomeChoices([intake, again, review], review).find((c) => c.outcome === 'Return');
    expect(choice?.effect).toContain('assigned to Mia Chen');
  });
});

describe('completionMessage', () => {
  const task = { name: 'Plan Review' };

  it('names the step the case moved to', () => {
    const updated = testCase({ tasks: [testTask({ name: 'Inspection', status: 'Active', departmentName: 'Public Works' })] });

    expect(completionMessage(task, 'Approve', updated)).toBe('Plan Review approved. The case moved to Inspection, in the Public Works queue.');
  });

  it('says when the case closed', () => {
    const closed = testCase({ status: 'Closed', tasks: [testTask({ status: 'Completed' })] });

    expect(completionMessage(task, 'Complete', closed)).toBe('Plan Review completed. The case is closed.');
    expect(completionMessage(task, 'Reject', closed)).toBe('Plan Review rejected. The case is closed as rejected.');
  });

  it('describes returns and information requests', () => {
    const returned = testCase({ tasks: [testTask({ name: 'Intake', status: 'Active' })] });

    expect(completionMessage(task, 'Return', returned)).toBe('Plan Review returned. The case went back to Intake.');
    expect(completionMessage(task, 'RequestInfo', returned)).toContain('on hold');
  });
});

describe('assignmentMessage', () => {
  it('names the new assignee, or the queue', () => {
    const assigned = testCase({ tasks: [testTask({ id: 12, name: 'Plan Review', assigneeName: 'Mia Chen' })] });
    const queued = testCase({ tasks: [testTask({ id: 12, name: 'Plan Review' })] });

    expect(assignmentMessage(12, assigned)).toBe('Plan Review is assigned to Mia Chen.');
    expect(assignmentMessage(12, queued)).toBe('Plan Review is back in the Planning & Zoning queue.');
  });
});

describe('statusChangeMessage', () => {
  it('tells resuming from reopening', () => {
    const reopened = testCase({ tasks: [testTask({ name: 'Inspection', status: 'Active', departmentName: 'Public Works' })] });

    expect(statusChangeMessage('reopen', true, reopened)).toBe('The case was resumed.');
    expect(statusChangeMessage('reopen', false, reopened)).toBe('The case was reopened. Inspection is in the Public Works queue.');
    expect(statusChangeMessage('cancel', false, reopened)).toBe('The case was cancelled.');
  });
});
