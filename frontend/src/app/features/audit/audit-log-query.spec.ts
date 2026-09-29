import { convertToParamMap } from '@angular/router';
import { actionLabel, entityTypeLabel, parseAuditParams, toAuditParams } from './audit-log-query';

describe('audit log filters', () => {
  it('reads the filters from the URL, dropping malformed values', () => {
    expect(
      parseAuditParams(
        convertToParamMap({ entityType: 'Department', entityId: '3', userId: '5', action: 'Updated', from: '2026-09-01', to: '2026-09-30' }),
      ),
    ).toEqual({
      entityType: 'Department',
      entityId: '3',
      caseId: undefined,
      userId: 5,
      action: 'Updated',
      from: '2026-09-01',
      to: '2026-09-30',
      page: undefined,
      pageSize: undefined,
    });

    const bad = parseAuditParams(convertToParamMap({ entityType: 'Secrets', entityId: '1', action: 'Hacked', from: 'yesterday', userId: 'x' }));
    expect(Object.values(bad).every((value) => value === undefined)).toBe(true);
  });

  it('writes only the filters that are set, without defaults', () => {
    expect(toAuditParams({ userId: 5, action: undefined, page: 1, pageSize: 25 })).toEqual({ userId: '5' });
    expect(toAuditParams({ action: 'Claimed', page: 3, pageSize: 100 })).toEqual({ action: 'Claimed', page: '3', pageSize: '100' });
  });

  it('names actions and record types as people say them', () => {
    expect(actionLabel('PutOnHold')).toBe('Put on hold');
    expect(actionLabel('InfoRequested')).toBe('Info requested');
    expect(actionLabel('Created')).toBe('Created');
    expect(entityTypeLabel('WorkflowTask')).toBe('Workflow step');
    expect(entityTypeLabel('Something')).toBe('Something');
  });
});
