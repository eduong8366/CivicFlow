import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';
import { applyServerErrors, controlForError, errorMessage, errorPath } from './form-errors';

describe('form errors', () => {
  function form() {
    return new FormGroup({
      name: new FormControl(''),
      fields: new FormArray([
        new FormGroup({
          id: new FormControl({ value: 4, disabled: true }),
          key: new FormControl('parcel'),
          options: new FormControl(''),
        }),
      ]),
    });
  }

  it('turns API keys into control paths', () => {
    expect(errorPath('Name')).toEqual(['name']);
    expect(errorPath('Fields[0].Key')).toEqual(['fields', 0, 'key']);
    expect(errorPath('Fields[1].Options[2]')).toEqual(['fields', 1, 'options', 2]);
    expect(errorPath('Steps')).toEqual(['steps']);
  });

  it('finds the enabled control an error is about', () => {
    const f = form();
    expect(controlForError(f, 'Name')).toBe(f.controls.name);
    expect(controlForError(f, 'Fields[0].Key')).toBe(f.controls.fields.at(0).controls.key);
    // Deeper than a control: the option list is one text control.
    expect(controlForError(f, 'Fields[0].Options[2]')).toBe(f.controls.fields.at(0).controls.options);
    // The array itself, a hidden id, and rows that don't exist show no message.
    expect(controlForError(f, 'Fields')).toBeNull();
    expect(controlForError(f, 'Fields[0].Id')).toBeNull();
    expect(controlForError(f, 'Fields[3].Key')).toBeNull();
    expect(controlForError(f, 'Nope')).toBeNull();
  });

  it('puts server messages on controls and returns the rest', () => {
    const f = form();
    const unmatched = applyServerErrors(f, {
      Name: ['Another case type already has this name.'],
      Fields: ["'Parcel' has values on existing cases, so it can't be removed."],
    });

    expect(f.controls.name.errors).toEqual({ server: 'Another case type already has this name.' });
    expect(f.controls.name.touched).toBe(true);
    expect(unmatched).toEqual(["'Parcel' has values on existing cases, so it can't be removed."]);
  });

  it('words messages from the control’s first problem', () => {
    const control = new FormControl('', [Validators.required, Validators.minLength(12)]);
    expect(errorMessage(control, 'Password')).toBe('Password is required.');
    control.setValue('short');
    expect(errorMessage(control, 'Password')).toBe('Password must be at least 12 characters.');

    const sla = new FormControl(400, Validators.max(365));
    expect(errorMessage(sla, 'SLA days')).toBe('SLA days must be at most 365.');

    const code = new FormControl('1x', Validators.pattern(/^[A-Za-z]/));
    expect(errorMessage(code, 'Code', { pattern: 'Start the code with a letter.' })).toBe('Start the code with a letter.');

    const named = new FormControl('');
    named.setErrors({ duplicate: 'Each step needs a different name.' });
    expect(errorMessage(named, 'Name')).toBe('Each step needs a different name.');
    expect(errorMessage(new FormControl('ok'), 'Name')).toBeNull();
  });
});
