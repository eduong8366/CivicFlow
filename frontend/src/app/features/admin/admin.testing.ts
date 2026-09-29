import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter, Routes, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Department } from '../../core/api/activity.models';
import { AdminDepartment, AdminUser } from '../../core/api/admin.models';
import { settle } from '../../core/api/api.testing';
import { UserRole } from '../../core/auth/auth.models';
import { storeSession, testUser } from '../../core/auth/auth.testing';

export interface Rendered {
  http: HttpTestingController;
  harness: RouterTestingHarness;
  page: HTMLElement;
}

/** Signs in as `role` (an admin has no department) and opens `url` on a router with `routes`. */
export async function renderPage(routes: Routes, url: string, role: UserRole = 'Admin'): Promise<Rendered> {
  sessionStorage.clear();
  storeSession(testUser(role, role === 'Admin' ? { id: 1, fullName: 'Avery Admin', departmentId: null, departmentName: null } : {}));
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter(routes, withComponentInputBinding()),
      { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  await settle();
  return { http, harness, page: harness.routeNativeElement! };
}

/** A route for a page under test, plus a stub for wherever it links. */
export function routesFor(path: string, component: Type<unknown>): Routes {
  return [{ path, component }];
}

export function buttonIn(root: ParentNode, label: string): HTMLButtonElement | undefined {
  return [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label);
}

export function dialog(): HTMLElement {
  return document.querySelector<HTMLElement>('mat-dialog-container')!;
}

/** Types into an input or textarea as a person would. */
export function type(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input'));
  input.dispatchEvent(new Event('blur'));
}

/** Opens a mat-select and picks the option with this text. */
export async function choose(select: HTMLElement, optionText: string): Promise<void> {
  select.querySelector<HTMLElement>('.mat-mdc-select-trigger')!.click();
  await settle();
  const option = [...document.querySelectorAll<HTMLElement>('mat-option')].find((o) => o.textContent?.trim().startsWith(optionText));
  if (!option) {
    throw new Error(`No option "${optionText}"`);
  }

  option.click();
  await settle();
}

export function submit(form: HTMLFormElement): void {
  form.dispatchEvent(new Event('submit'));
}

export const testDepartments: Department[] = [
  { id: 1, name: 'Planning & Zoning', code: 'PZ', isActive: true },
  { id: 2, name: 'Code Enforcement', code: 'CE', isActive: true },
  { id: 6, name: 'Records Archive', code: 'RA', isActive: false },
];

export function testAdminDepartment(overrides: Partial<AdminDepartment> = {}): AdminDepartment {
  return {
    id: 1,
    name: 'Planning & Zoning',
    code: 'PZ',
    isActive: true,
    activeUserCount: 3,
    activeStepCount: 2,
    activeTaskCount: 0,
    ...overrides,
  };
}

export function testAdminUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 7,
    email: 'pz.staff1@civicflow.test',
    fullName: 'Luis Ortega',
    role: 'Staff',
    departmentId: 1,
    departmentName: 'Planning & Zoning',
    isActive: true,
    activeTaskCount: 2,
    ...overrides,
  };
}
