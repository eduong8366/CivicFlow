import {
  caseTypeForm,
  dropReturnFromFirstStep,
  fieldForm,
  fieldKeyFrom,
  moveControl,
  parseOptions,
  saveRequest,
  stepForm,
  totalSlaDays,
} from './case-type-form';
import { testAdminCaseType } from './case-types.testing';

describe('case type form', () => {
  it('makes camelCase keys from labels', () => {
    expect(fieldKeyFrom('Parcel Number')).toBe('parcelNumber');
    expect(fieldKeyFrom('  Owner-occupied? ')).toBe('ownerOccupied');
    expect(fieldKeyFrom('ESTIMATED VALUE ($)')).toBe('estimatedValue');
    expect(fieldKeyFrom('2nd inspector')).toBe('field2ndInspector');
    expect(fieldKeyFrom('Café')).toBe('cafe');
    expect(fieldKeyFrom('?!')).toBe('');
  });

  it('reads options one per line', () => {
    expect(parseOptions(' Residential \n\nCommercial\r\n  ')).toEqual(['Residential', 'Commercial']);
  });

  it('keeps a new field’s key in step with its label until the key is edited', () => {
    const field = fieldForm();
    field.controls.label.setValue('Square Footage');
    expect(field.controls.key.value).toBe('squareFootage');

    field.controls.key.setValue('sqft');
    field.controls.key.markAsDirty();
    field.controls.label.setValue('Floor area');
    expect(field.controls.key.value).toBe('sqft');

    // Existing fields keep their key.
    const existing = fieldForm(testAdminCaseType().fields[0]);
    existing.controls.label.setValue('Parcel ID');
    expect(existing.controls.key.value).toBe('parcelNumber');
  });

  it('checks a select field’s options, and only for select fields', () => {
    const field = fieldForm();
    field.patchValue({ label: 'Use', dataType: 'Select' });
    expect(field.controls.options.errors).toEqual({ options: 'A select field needs at least one option.' });

    field.controls.options.setValue('Residential\nresidential');
    expect(field.controls.options.errors).toEqual({ options: 'Each option must be different.' });

    field.controls.options.setValue('Residential\nCommercial');
    expect(field.controls.options.valid).toBe(true);

    field.patchValue({ options: '', dataType: 'Text' });
    expect(field.controls.options.valid).toBe(true);
  });

  it('won’t let a used field change type', () => {
    const type = testAdminCaseType();
    expect(fieldForm(type.fields[0]).controls.dataType.disabled).toBe(true);
    expect(fieldForm(type.fields[1]).controls.dataType.enabled).toBe(true);
  });

  it('requires each step to allow Complete or Approve', () => {
    const step = stepForm();
    step.patchValue({ name: 'Review', departmentId: 1 });
    expect(step.valid).toBe(true);

    step.controls.allowedOutcomes.setValue(['Reject']);
    expect(step.controls.allowedOutcomes.errors).toEqual({
      outcomes: 'Each step must allow Complete or Approve, so work can move forward.',
    });
    step.controls.allowedOutcomes.setValue([]);
    expect(step.controls.allowedOutcomes.errors).toEqual({ outcomes: 'Choose the outcomes this step allows.' });

    step.patchValue({ allowedOutcomes: ['Approve'], slaDays: 400 });
    expect(step.controls.slaDays.errors).toEqual({ max: { max: 365, actual: 400 } });
  });

  it('finds duplicate keys and step names, ignoring case', () => {
    const form = caseTypeForm(testAdminCaseType());
    expect(form.controls.fields.valid).toBe(true);

    form.controls.fields.at(1).controls.key.setValue('parcelnumber');
    expect(form.controls.fields.errors).toEqual({ duplicate: 'Each field needs a different key.' });

    form.controls.steps.at(1).controls.name.setValue('intake');
    expect(form.controls.steps.errors).toEqual({ duplicate: 'Each step needs a different name.' });
  });

  it('starts a new case type with one step', () => {
    const form = caseTypeForm();
    expect(form.controls.fields.length).toBe(0);
    expect(form.controls.steps.getRawValue()).toEqual([
      { id: null, inUse: false, name: 'Intake', departmentId: null, slaDays: 5, allowedOutcomes: ['Complete'] },
    ]);
  });

  it('builds the whole definition, in the order shown', () => {
    const form = caseTypeForm(testAdminCaseType());
    form.controls.prefix.setValue(' bld ');
    form.controls.description.setValue('  ');
    form.controls.fields.push(fieldForm());
    form.controls.fields.at(2).patchValue({ label: 'Zone', dataType: 'Select', options: 'R1\nC2\n' });
    moveControl(form.controls.fields, 2, 0);

    const request = saveRequest(form);
    expect(request.prefix).toBe('BLD');
    expect(request.description).toBeNull();
    expect(request.fields.map((f) => f.key)).toEqual(['zone', 'parcelNumber', 'occupancy']);
    expect(request.fields[0]).toEqual({ id: null, key: 'zone', label: 'Zone', dataType: 'Select', isRequired: false, options: ['R1', 'C2'] });
    // Options are sent only for select fields.
    expect(request.fields[1].options).toEqual([]);
    expect(request.steps.map((s) => [s.id, s.name])).toEqual([
      [31, 'Intake'],
      [32, 'Plan Review'],
    ]);
    expect(form.dirty).toBe(true);
  });

  it('moves rows and takes Return off whichever step comes first', () => {
    const form = caseTypeForm(testAdminCaseType());
    const steps = form.controls.steps;
    const review = steps.at(1);
    moveControl(steps, 1, 0);
    expect(steps.at(0)).toBe(review);

    expect(dropReturnFromFirstStep(steps)).toBe(true);
    expect(steps.at(0).controls.allowedOutcomes.value).toEqual(['Approve', 'Reject']);
    expect(dropReturnFromFirstStep(steps)).toBe(false);

    // Out of range does nothing.
    moveControl(steps, 0, 5);
    expect(steps.at(0)).toBe(review);
  });

  it('adds up the SLA', () => {
    const form = caseTypeForm(testAdminCaseType());
    expect(totalSlaDays(form.controls.steps)).toBe(12);
    form.controls.steps.at(0).controls.slaDays.setValue(null);
    expect(totalSlaDays(form.controls.steps)).toBe(10);
  });
});
