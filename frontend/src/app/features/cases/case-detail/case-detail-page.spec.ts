import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { Attachment, AuditEntry, Comment } from '../../../core/api/activity.models';
import { pageOf, settle } from '../../../core/api/api.testing';
import { CaseDetail } from '../../../core/api/cases.models';
import { testCase } from './case-detail.testing';
import { CaseDetailPage } from './case-detail-page';

const comment: Comment = {
  id: 1,
  caseId: 20,
  body: 'Spoke with the neighbour.',
  isInternal: true,
  author: { id: 7, fullName: 'Luis Ortega' },
  createdAt: '2026-09-26T21:45:00+00:00',
};

const approved: AuditEntry = {
  id: 5,
  timestamp: '2026-09-20T19:32:00+00:00',
  entityType: 'WorkflowTask',
  entityId: '11',
  action: 'Approved',
  caseId: 20,
  caseNumber: 'BLD-2026-000020',
  userId: 7,
  userName: 'Luis Ortega',
  changes: { Notes: { old: null, new: 'All documents received.' } },
};

describe('CaseDetailPage', () => {
  let fixture: ComponentFixture<CaseDetailPage>;
  let page: HTMLElement;
  let http: HttpTestingController;

  async function render(response: CaseDetail | { status: number } = testCase()): Promise<void> {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CaseDetailPage);
    fixture.componentRef.setInput('id', '20');
    page = fixture.nativeElement;
    await settle();

    const request = http.expectOne('/api/cases/20');
    if ('caseNumber' in response) {
      request.flush(response);
    } else {
      request.flush({ status: response.status }, { status: response.status, statusText: 'Error' });
    }
    await settle();
  }

  async function flushActivity(activity: { comments?: Comment[]; attachments?: Attachment[]; audit?: AuditEntry[] } = {}) {
    http.expectOne((r) => r.url === '/api/cases/20/comments').flush(pageOf(activity.comments ?? []));
    http.expectOne((r) => r.url === '/api/cases/20/attachments').flush(pageOf(activity.attachments ?? []));
    http.expectOne((r) => r.url === '/api/cases/20/audit').flush(pageOf(activity.audit ?? []));
    http.expectOne((r) => r.url === '/api/users').flush([{ id: 7, fullName: 'Luis Ortega', role: 'Staff', departmentId: 1, departmentName: 'Planning & Zoning', isActive: true }]);
    await settle();
  }

  afterEach(() => http.verify());

  it('shows the case header, workflow and current step', async () => {
    await render();
    await flushActivity();

    expect(page.querySelector('h1')?.textContent).toBe('New Construction at 2599 Birch Ct');
    expect(page.querySelector('.tags')?.textContent).toContain('BLD-2026-000020');
    expect(page.querySelector('.tags')?.textContent).toContain('In progress');
    expect(page.querySelector('.dates')?.textContent).toContain('Opened Sep 18, 2026 by Priya Raman');

    const steps = [...page.querySelectorAll('app-workflow-stepper li')];
    expect(steps.map((li) => li.querySelector('.name')?.textContent)).toEqual(['Intake', 'Plan Review', 'Inspection']);
    expect(steps[0].textContent).toContain('Approved');
    expect(steps[1].getAttribute('aria-current')).toBe('step');
    expect(steps[1].textContent).toContain('Step 2 of 3');
    expect(steps[2].textContent).toContain('Not started');

    expect(page.querySelector('#current-heading')?.textContent).toBe('Current step: Plan Review');
    expect(TestBed.inject(Title).getTitle()).toBe('BLD-2026-000020 · CivicFlow');
  });

  it('shows custom fields formatted, with blanks marked', async () => {
    await render();
    await flushActivity();

    const values = Object.fromEntries(
      [...page.querySelectorAll('.fields div')].map((d) => [d.querySelector('dt')?.textContent, d.querySelector('dd')?.textContent]),
    );
    expect(values).toEqual({
      'Parcel number': '493-11-2774',
      'Estimated valuation': '627,000',
      'Square footage': 'Not provided',
      'Owner-occupied': 'No',
    });
    expect(page.querySelector('address a[href^="mailto:"]')?.textContent).toBe('rachel@example.com');
  });

  it('shows comments and the history in plain words', async () => {
    await render();
    await flushActivity({ comments: [comment], audit: [approved] });

    expect(page.querySelector('app-case-comments li')?.textContent).toContain('Spoke with the neighbour.');
    expect(page.querySelector('app-case-comments li')?.textContent).toContain('Internal');
    const history = page.querySelector('app-audit-timeline')!.textContent;
    expect(history).toContain('Approved Intake');
    expect(history).toContain('All documents received.');
  });

  it('posts a comment and refreshes the history', async () => {
    await render();
    await flushActivity();
    const textarea = page.querySelector<HTMLTextAreaElement>('app-case-comments textarea')!;
    textarea.value = 'Called the owner.';
    textarea.dispatchEvent(new Event('input'));
    page.querySelector('app-case-comments form')!.dispatchEvent(new Event('submit'));
    await settle();

    const post = http.expectOne((r) => r.method === 'POST' && r.url === '/api/cases/20/comments');
    expect(post.request.body).toEqual({ body: 'Called the owner.', isInternal: true });
    post.flush({ ...comment, id: 2, body: 'Called the owner.' });
    await settle();

    expect(page.querySelector('app-case-comments ol')?.textContent).toContain('Called the owner.');
    expect(page.querySelector('app-case-comments [role="status"]')?.textContent).toBe('Comment posted.');
    expect(textarea.value).toBe('');
    // The emptied box is ready for the next comment, not flagged as an error.
    expect(page.querySelector('app-case-comments mat-error')).toBeNull();
    http.expectOne((r) => r.url === '/api/cases/20/audit').flush(pageOf([approved]));
  });

  it('uploads a file and lists it', async () => {
    await render();
    await flushActivity();
    const input = page.querySelector<HTMLInputElement>('app-case-attachments input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [new File(['%PDF'], 'site-plan.pdf')] });
    input.dispatchEvent(new Event('change'));
    await settle();

    const upload = http.expectOne((r) => r.method === 'POST' && r.url === '/api/cases/20/attachments');
    expect((upload.request.body as FormData).get('file')).toBeInstanceOf(File);
    upload.flush({
      id: 3,
      caseId: 20,
      fileName: 'site-plan.pdf',
      contentType: 'application/pdf',
      size: 2048,
      uploadedBy: { id: 7, fullName: 'Luis Ortega' },
      uploadedAt: '2026-09-28T10:00:00+00:00',
    });
    await settle();

    expect(page.querySelector('app-case-attachments li')?.textContent).toContain('site-plan.pdf');
    expect(page.querySelector('app-case-attachments li')?.textContent).toContain('2.0 KB');
    http.expectOne((r) => r.url === '/api/cases/20/audit').flush(pageOf([]));
  });

  it('says when the case does not exist', async () => {
    await render({ status: 404 });

    expect(page.querySelector('h1')?.textContent).toBe('Case not found');
  });

  it('says when the case is outside the user’s access', async () => {
    await render({ status: 403 });

    expect(page.querySelector('h1')?.textContent).toBe('Access denied');
    expect(page.querySelector('[role="alert"]')?.textContent).toContain("isn't routed to your department");
  });
});
