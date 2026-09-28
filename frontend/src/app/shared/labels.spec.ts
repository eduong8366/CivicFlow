import { caseStatusLabel, formatBytes, formatFieldValue, outcomeLabel, outcomePastLabel } from './labels';

describe('labels', () => {
  it('names statuses, telling rejected cases apart', () => {
    expect(caseStatusLabel('InProgress')).toBe('In progress');
    expect(caseStatusLabel('Closed', 'Completed')).toBe('Closed');
    expect(caseStatusLabel('Closed', 'Rejected')).toBe('Closed · Rejected');
  });

  it('names outcomes as choices and as results', () => {
    expect(outcomeLabel('RequestInfo')).toBe('Request info');
    expect(outcomePastLabel('Approve')).toBe('Approved');
  });

  it('formats file sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(10 * 1024 * 1024)).toBe('10 MB');
  });

  it('formats custom field values by type', () => {
    expect(formatFieldValue({ dataType: 'Checkbox', value: 'true' })).toBe('Yes');
    expect(formatFieldValue({ dataType: 'Checkbox', value: null })).toBe('No');
    expect(formatFieldValue({ dataType: 'Date', value: '2026-11-17' })).toBe('Nov 17, 2026');
    expect(formatFieldValue({ dataType: 'Number', value: '627000' })).toBe('627,000');
    expect(formatFieldValue({ dataType: 'Text', value: '' })).toBeNull();
    expect(formatFieldValue({ dataType: 'Select', value: 'New Construction' })).toBe('New Construction');
  });
});
