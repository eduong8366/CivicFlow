import { AdminCaseType, AdminCaseTypeListItem } from '../../../core/api/admin.models';

/** A building permit type: the parcel field and the intake step are used by existing cases. */
export function testAdminCaseType(overrides: Partial<AdminCaseType> = {}): AdminCaseType {
  return {
    id: 1,
    name: 'Building Permit Application',
    prefix: 'BLD',
    description: 'New construction, additions and alterations.',
    isActive: true,
    caseCount: 12,
    fields: [
      { id: 11, key: 'parcelNumber', label: 'Parcel Number', dataType: 'Text', isRequired: true, options: [], sortOrder: 1, inUse: true },
      {
        id: 12,
        key: 'occupancy',
        label: 'Occupancy',
        dataType: 'Select',
        isRequired: false,
        options: ['Residential', 'Commercial'],
        sortOrder: 2,
        inUse: false,
      },
    ],
    steps: [
      {
        id: 31,
        name: 'Intake',
        sortOrder: 1,
        departmentId: 1,
        departmentName: 'Planning & Zoning',
        departmentIsActive: true,
        slaDays: 2,
        allowedOutcomes: ['Complete', 'RequestInfo'],
        inUse: true,
      },
      {
        id: 32,
        name: 'Plan Review',
        sortOrder: 2,
        departmentId: 1,
        departmentName: 'Planning & Zoning',
        departmentIsActive: true,
        slaDays: 10,
        allowedOutcomes: ['Approve', 'Reject', 'Return'],
        inUse: false,
      },
    ],
    ...overrides,
  };
}

export function testCaseTypeListItem(overrides: Partial<AdminCaseTypeListItem> = {}): AdminCaseTypeListItem {
  return {
    id: 1,
    name: 'Building Permit Application',
    prefix: 'BLD',
    description: 'New construction, additions and alterations.',
    isActive: true,
    fieldCount: 2,
    stepCount: 2,
    caseCount: 12,
    openCaseCount: 5,
    ...overrides,
  };
}
