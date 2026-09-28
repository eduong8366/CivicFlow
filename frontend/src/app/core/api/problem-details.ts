import { HttpErrorResponse } from '@angular/common/http';

/** An RFC 9457 error body, as the API returns for every failure. */
export interface ProblemDetails {
  title?: string;
  detail?: string;
  status?: number;
  /** Validation problems (400): messages keyed by property path, e.g. `Fields[0].Key`. */
  errors?: Record<string, string[]>;
}

/** The API's problem body, if the error carries one. */
export function problemOf(error: unknown): ProblemDetails | null {
  return error instanceof HttpErrorResponse && error.error && typeof error.error === 'object'
    ? (error.error as ProblemDetails)
    : null;
}

/** One sentence to show someone for a failed request. */
export function problemMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof HttpErrorResponse && error.status === 0) {
    return "Can't reach the server. Check your connection and try again.";
  }

  const problem = problemOf(error);
  const firstError = problem?.errors ? Object.values(problem.errors).flat()[0] : undefined;
  return problem?.detail ?? firstError ?? problem?.title ?? fallback;
}
