import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { UserRole } from '../core/auth/auth.models';
import { storeSession, testUser } from '../core/auth/auth.testing';
import { Shell } from './shell';

@Component({ template: '' })
class Blank {}

describe('Shell', () => {
  async function render(role: UserRole): Promise<HTMLElement> {
    sessionStorage.clear();
    storeSession(testUser(role));
    TestBed.configureTestingModule({
      imports: [Shell],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([{ path: '**', component: Blank }])],
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

  it('moves focus to the new page, but not when only the query changes', async () => {
    const el = await render('Staff');
    const router = TestBed.inject(Router);
    const main = el.querySelector<HTMLElement>('main')!;
    const search = el.querySelector<HTMLInputElement>('#global-search')!;
    await router.navigateByUrl('/cases');

    search.focus();
    await router.navigateByUrl('/cases?status=Open&page=2');
    expect(document.activeElement).toBe(search);

    await router.navigateByUrl('/cases/20');
    expect(document.activeElement).toBe(main);
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
