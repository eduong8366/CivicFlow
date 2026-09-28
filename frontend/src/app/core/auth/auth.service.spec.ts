import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { loginResponse, storeSession, testUser } from './auth.testing';

describe('AuthService', () => {
  let http: HttpTestingController;
  let router: Router;

  function setup(): AuthService {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    return TestBed.inject(AuthService);
  }

  beforeEach(() => sessionStorage.clear());
  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('signs in and keeps the session for the tab', () => {
    const auth = setup();
    let signedIn: string | undefined;

    auth.login({ email: 'pz.staff1@civicflow.test', password: 'secret' }).subscribe((u) => (signedIn = u.fullName));
    const request = http.expectOne('/api/auth/login');
    request.flush(loginResponse());

    expect(request.request.body).toEqual({ email: 'pz.staff1@civicflow.test', password: 'secret' });
    expect(signedIn).toBe('Luis Ortega');
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.token).toBe('test-token');
    expect(JSON.parse(sessionStorage.getItem('civicflow.session')!).token).toBe('test-token');
  });

  it('restores a stored session', () => {
    storeSession(testUser('Supervisor'));

    const auth = setup();

    expect(auth.user()?.role).toBe('Supervisor');
    expect(auth.hasRole('Supervisor', 'Admin')).toBe(true);
    expect(auth.hasRole('Admin')).toBe(false);
  });

  it('ignores an expired stored session', () => {
    storeSession(testUser(), -1);

    expect(setup().isAuthenticated()).toBe(false);
  });

  it('refreshes the account from /me on startup', async () => {
    storeSession(testUser('Staff'));
    const auth = setup();

    const refreshed = auth.refresh();
    http.expectOne('/api/auth/me').flush(testUser('Supervisor', { fullName: 'Luis Ortega (promoted)' }));
    await refreshed;

    expect(auth.user()?.role).toBe('Supervisor');
    expect(auth.user()?.fullName).toBe('Luis Ortega (promoted)');
  });

  it('signs out, forgets the token and goes to the sign-in page', () => {
    storeSession();
    const auth = setup();

    auth.logout();

    expect(auth.isAuthenticated()).toBe(false);
    expect(sessionStorage.getItem('civicflow.session')).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { reason: undefined, returnUrl: undefined } });
  });

  it('signs out when the token expires', () => {
    vi.useFakeTimers();
    const auth = setup();
    auth.login({ email: 'a@b.c', password: 'p' }).subscribe();
    http.expectOne('/api/auth/login').flush(loginResponse(testUser(), 1));
    TestBed.tick();

    vi.advanceTimersByTime(61_000);

    expect(auth.isAuthenticated()).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login'], expect.objectContaining({
      queryParams: expect.objectContaining({ reason: 'expired' }),
    }));
  });
});
