import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';
import { storeSession } from './auth.testing';

describe('authInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    sessionStorage.clear();
    storeSession();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    vi.spyOn(auth, 'logout').mockImplementation(() => undefined);
  });

  afterEach(() => backend.verify());

  it('sends the token to the API', () => {
    http.get('/api/cases').subscribe();

    expect(backend.expectOne('/api/cases').request.headers.get('Authorization')).toBe('Bearer stored-token');
  });

  it('never sends the token elsewhere', () => {
    http.get('https://example.com/api/cases').subscribe();
    http.get('/assets/logo.svg').subscribe();

    expect(backend.expectOne('https://example.com/api/cases').request.headers.has('Authorization')).toBe(false);
    expect(backend.expectOne('/assets/logo.svg').request.headers.has('Authorization')).toBe(false);
  });

  it('signs out when the API rejects the token', () => {
    http.get('/api/tasks/mine').subscribe({ error: () => undefined });

    backend.expectOne('/api/tasks/mine').flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(auth.logout).toHaveBeenCalledWith(expect.objectContaining({ reason: 'expired' }));
  });

  it('leaves a 403 to the page', () => {
    http.get('/api/admin/users').subscribe({ error: () => undefined });

    backend.expectOne('/api/admin/users').flush(null, { status: 403, statusText: 'Forbidden' });

    expect(auth.logout).not.toHaveBeenCalled();
  });
});
