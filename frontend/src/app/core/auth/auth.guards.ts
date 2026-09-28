import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { UserRole } from './auth.models';
import { AuthService } from './auth.service';

/** Signed-in users only; everyone else goes to sign in and comes back afterwards. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  return auth.isAuthenticated() || inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** The sign-in page is for signed-out users; a signed-in one goes to their dashboard. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return !auth.isAuthenticated() || inject(Router).createUrlTree(['/dashboard']);
};

/**
 * Hides screens a role can't use. The API enforces the same rules; this only keeps people from
 * landing on a page that would fail.
 */
export function roleGuard(...roles: UserRole[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    return auth.hasRole(...roles) || inject(Router).createUrlTree(['/forbidden']);
  };
}
