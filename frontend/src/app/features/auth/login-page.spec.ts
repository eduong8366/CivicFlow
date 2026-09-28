import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { loginResponse } from '../../core/auth/auth.testing';
import { LoginPage } from './login-page';

describe('LoginPage', () => {
  let fixture: ComponentFixture<LoginPage>;
  let page: HTMLElement;
  let http: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(LoginPage);
    page = fixture.nativeElement;
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  function type(label: string, value: string): void {
    const input = [...page.querySelectorAll('input')].find((i) => i.labels?.[0]?.textContent?.includes(label))!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  async function submit(): Promise<void> {
    page.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  it('has labelled fields and a heading', () => {
    expect(page.querySelector('h1')?.textContent).toBe('Sign in');
    expect([...page.querySelectorAll('input')].map((i) => i.labels?.[0]?.textContent?.trim())).toEqual([
      'Email',
      'Password',
    ]);
  });

  it('does not call the API with an empty form', async () => {
    await submit();

    http.expectNone('/api/auth/login');
    expect(page.textContent).toContain('Enter your email address.');
  });

  it('shows the API message when sign-in fails', async () => {
    type('Email', 'pz.staff1@civicflow.test');
    type('Password', 'wrong');
    await submit();

    http
      .expectOne('/api/auth/login')
      .flush({ status: 401, detail: 'The email or password is incorrect.' }, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();

    const alert = page.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('The email or password is incorrect.');
    expect(document.activeElement).toBe(alert);
  });

  it('goes to the requested page after signing in', async () => {
    fixture.componentRef.setInput('returnUrl', '/cases/42');
    type('Email', 'pz.staff1@civicflow.test');
    type('Password', 'CivicFlow!2026');
    await submit();

    http.expectOne('/api/auth/login').flush(loginResponse());

    expect(router.navigateByUrl).toHaveBeenCalledWith('/cases/42');
  });

  it('refuses to redirect off-site after signing in', async () => {
    fixture.componentRef.setInput('returnUrl', 'https://evil.example');
    type('Email', 'pz.staff1@civicflow.test');
    type('Password', 'CivicFlow!2026');
    await submit();

    http.expectOne('/api/auth/login').flush(loginResponse());

    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it('explains why a session ended', async () => {
    fixture.componentRef.setInput('reason', 'expired');
    await fixture.whenStable();

    expect(page.querySelector('[role="status"]')?.textContent).toContain('Your session has ended');
  });
});
