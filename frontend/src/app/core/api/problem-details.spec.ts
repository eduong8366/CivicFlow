import { HttpErrorResponse } from '@angular/common/http';
import { problemMessage } from './problem-details';

describe('problemMessage', () => {
  it('uses the problem detail', () => {
    const error = new HttpErrorResponse({ status: 401, error: { detail: 'The email or password is incorrect.' } });

    expect(problemMessage(error)).toBe('The email or password is incorrect.');
  });

  it('uses the first validation message when there is no detail', () => {
    const error = new HttpErrorResponse({
      status: 400,
      error: { title: 'One or more validation errors occurred.', errors: { Email: ["'Email' is not a valid email address."] } },
    });

    expect(problemMessage(error)).toBe("'Email' is not a valid email address.");
  });

  it('explains a network failure', () => {
    expect(problemMessage(new HttpErrorResponse({ status: 0 }))).toContain("Can't reach the server");
  });

  it('falls back for anything else', () => {
    expect(problemMessage(new Error('boom'), 'Try again.')).toBe('Try again.');
  });
});
