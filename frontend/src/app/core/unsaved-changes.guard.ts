import { CanDeactivateFn } from '@angular/router';

/** A page that may hold unsaved work, and asks before it's left behind. */
export interface HasUnsavedChanges {
  canLeave(): boolean;
}

/** Lets a page with unsaved changes ask before the router leaves it. */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (page) => page?.canLeave() ?? true;
