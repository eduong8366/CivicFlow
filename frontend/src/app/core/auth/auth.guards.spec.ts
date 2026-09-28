import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, CanActivateFn, provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { UserRole } from './auth.models';
import { authGuard, guestGuard, roleGuard } from './auth.guards';
import { storeSession, testUser } from './auth.testing';

describe('route guards', () => {
  // AuthService reads the stored session when first injected, so tests store one before running a guard.
  function run(guard: CanActivateFn, url = '/cases/42'): boolean | UrlTree {
    return TestBed.runInInjectionContext(
      () => guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot) as boolean | UrlTree,
    );
  }

  const serialize = (result: boolean | UrlTree) =>
    result instanceof UrlTree ? TestBed.inject(Router).serializeUrl(result) : result;

  function signInAs(role: UserRole): void {
    storeSession(testUser(role));
  }

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  it('sends signed-out users to sign in, remembering where they were going', () => {
    expect(serialize(run(authGuard))).toBe('/login?returnUrl=%2Fcases%2F42');
  });

  it('lets signed-in users through', () => {
    signInAs('Staff');

    expect(run(authGuard)).toBe(true);
  });

  it('keeps signed-in users off the sign-in page', () => {
    signInAs('Staff');

    expect(serialize(run(guestGuard))).toBe('/dashboard');
  });

  it('turns away roles a page is not for', () => {
    signInAs('Supervisor');

    expect(serialize(run(roleGuard('Admin')))).toBe('/forbidden');
    expect(run(roleGuard('Supervisor', 'Admin'))).toBe(true);
  });
});
