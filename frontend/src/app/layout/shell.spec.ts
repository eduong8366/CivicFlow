import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { UserRole } from '../core/auth/auth.models';
import { storeSession, testUser } from '../core/auth/auth.testing';
import { Shell } from './shell';

describe('Shell', () => {
  async function render(role: UserRole): Promise<HTMLElement> {
    sessionStorage.clear();
    storeSession(testUser(role));
    TestBed.configureTestingModule({
      imports: [Shell],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(Shell);
    await fixture.whenStable();
    return fixture.nativeElement;
  }

  const navLabels = (el: HTMLElement) => [...el.querySelectorAll('nav a')].map((a) => a.textContent?.trim());

  it('starts with a skip link to the main content', async () => {
    const el = await render('Staff');

    const skip = el.querySelector('a');
    expect(skip?.textContent).toBe('Skip to main content');
    expect(skip?.getAttribute('href')).toBe('#main');
    expect(el.querySelector('main#main')).not.toBeNull();
  });

  it('shows who is signed in', async () => {
    const el = await render('Staff');

    expect(el.querySelector('.user')?.textContent).toContain('Luis Ortega');
    expect(el.querySelector('.user')?.textContent).toContain('Staff · Planning & Zoning');
  });

  it('shows staff no administration links', async () => {
    const el = await render('Staff');

    expect(navLabels(el)).toEqual(['Dashboard', 'My work', 'Department queue', 'Case search', 'New case']);
  });

  it('shows admins the administration section', async () => {
    const el = await render('Admin');

    expect(el.querySelector('nav h2')?.textContent).toBe('Administration');
    expect(navLabels(el)).toContain('Case types');
  });

  it('searches cases from the header', async () => {
    const el = await render('Staff');
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const input = el.querySelector<HTMLInputElement>('#global-search')!;

    input.value = '  BLD-2026-000020 ';
    el.querySelector('form[role="search"]')!.dispatchEvent(new Event('submit'));

    expect(router.navigate).toHaveBeenCalledWith(['/cases'], { queryParams: { search: 'BLD-2026-000020' } });
  });
});
