import { PagedResult } from '../../core/api/paging';

export const taskPageSizes = [25, 50, 100];

export interface ResultState<T> {
  value: PagedResult<T> | null;
  failed: boolean;
}

/**
 * A `linkedSignal` computation that keeps the last page on screen while the next one loads, so
 * paging or refreshing doesn't rebuild the table (which would drop keyboard focus). A failure
 * clears it.
 */
export function keepPrevious<T>(state: ResultState<T>, previous?: { value: PagedResult<T> | null }): PagedResult<T> | null {
  return state.value ?? (state.failed ? null : (previous?.value ?? null));
}
