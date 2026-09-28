import { TestBed } from '@angular/core/testing';
import { PagedResult } from './paging';

/** A single page holding all of `items`, as a list endpoint returns it. */
export function pageOf<T>(items: T[], overrides: Partial<PagedResult<T>> = {}): PagedResult<T> {
  return { items, page: 1, pageSize: 25, totalCount: items.length, totalPages: 1, ...overrides };
}

/**
 * Runs change detection and lets effects, resources and navigations take their next step.
 * `fixture.whenStable()` would wait for every HTTP request to finish, so it hangs while a test
 * still has requests to flush; use this until they're all flushed.
 */
export async function settle(): Promise<void> {
  TestBed.tick();
  await new Promise((resolve) => setTimeout(resolve));
  TestBed.tick();
}
