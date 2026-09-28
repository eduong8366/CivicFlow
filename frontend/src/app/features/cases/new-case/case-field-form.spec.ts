import { FormControl, FormGroup, Validators } from '@angular/forms';
import { CaseTypeField } from '../../../core/api/cases.models';
import { applyServerErrors, controlMessage, fieldControls, fieldValues } from './case-field-form';

function field(key: string, dataType: CaseTypeField['dataType'], isRequired = false): CaseTypeField {
  return { id: 1, key, label: key, dataType, isRequired, options: [], sortOrder: 0 };
}

describe('case field form', () => {
  const fields = [
    field('parcel', 'Text', true),
    field('valuation', 'Number'),
    field('start', 'Date'),
    field('kind', 'Select'),
    field('confirmed', 'Checkbox', true),
  ];

  it('makes a control per field with its rules', () => {
    const controls = fieldControls(fields);

    expect(Object.keys(controls.controls)).toEqual(['parcel', 'valuation', 'start', 'kind', 'confirmed']);
    expect(controls.get('parcel')?.hasError('required')).toBe(true);
    expect(controls.get('valuation')?.valid).toBe(true);
    // A required checkbox must be ticked, not merely present.
    expect(controls.get('confirmed')?.value).toBe(false);
    expect(controls.get('confirmed')?.hasError('required')).toBe(true);
  });

  it('turns values into the text the API stores', () => {
    const controls = fieldControls(fields);
    controls.setValue({ parcel: ' 493-11 ', valuation: '627000.50', start: '2026-11-17', kind: null, confirmed: true });

    expect(fieldValues(fields, controls)).toEqual({
      parcel: '493-11',
      valuation: '627000.5',
      start: '2026-11-17',
      kind: null,
      confirmed: 'true',
    });
  });

  it('sends blanks as null and an unticked checkbox as false', () => {
    const controls = fieldControls(fields);
    controls.patchValue({ parcel: '  ', valuation: '' });

    expect(fieldValues(fields, controls)).toMatchObject({ parcel: null, valuation: null, confirmed: 'false' });
  });

  it('accepts numbers as numbers too', () => {
    const controls = fieldControls(fields);
    controls.patchValue({ valuation: 12.5 });

    expect(fieldValues(fields, controls)['valuation']).toBe('12.5');
  });

  it('puts server messages on their controls and returns the rest', () => {
    const form = new FormGroup({
      title: new FormControl(''),
      requesterEmail: new FormControl(''),
      fields: fieldControls([field('parcelNumber', 'Text')]),
    });

    const unmatched = applyServerErrors(form, {
      Title: ['Title is too long.'],
      RequesterEmail: ['Not an email.'],
      'Fields.ParcelNumber': ['Bad parcel.'],
      'Fields.unknown': ['Unknown field.'],
      CaseTypeId: ['Unknown case type.'],
    });

    expect(form.get('title')?.errors).toEqual({ server: 'Title is too long.' });
    expect(form.get('requesterEmail')?.errors).toEqual({ server: 'Not an email.' });
    expect(form.get('fields.parcelNumber')?.errors).toEqual({ server: 'Bad parcel.' });
    expect(unmatched).toEqual(['Unknown field.', 'Unknown case type.']);
  });

  it('words each problem for its field', () => {
    const required = new FormControl('', { validators: (c) => (c.value ? null : { required: true }) });
    required.updateValueAndValidity();

    expect(controlMessage(required, 'Parcel Number')).toBe('Parcel Number is required.');
    expect(controlMessage(required, 'Plans attached', 'checkbox')).toBe('Tick “Plans attached” to continue.');
    const long = new FormControl('abcdef', { validators: Validators.maxLength(3) });
    expect(controlMessage(long, 'Title')).toBe('Title can be at most 3 characters.');
    expect(controlMessage(new FormControl('x'), 'Title')).toBeNull();
  });
});
