import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter } from '@angular/router';
import { Attachment, AuditEntry, Comment } from '../../../core/api/activity.models';
import { pageOf, settle } from '../../../core/api/api.testing';
import { CaseDetail, WorkflowTask } from '../../../core/api/cases.models';
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
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
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

  describe('actions', () => {
    /** The test case with its active step, Plan Review (task 12), changed. */
    function withCurrent(task: Partial<WorkflowTask>, overrides: Partial<CaseDetail> = {}): CaseDetail {
      const base = testCase();
      return { ...base, tasks: base.tasks.map((t) => (t.id === 12 ? { ...t, ...task } : t)), ...overrides };
    }

    const button = (label: string, root: ParentNode = page) =>
      [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);

    const flushHistoryRefresh = () => http.expectOne((r) => r.url === '/api/cases/20/audit').flush(pageOf([]));

    it('shows no actions the user may not take', async () => {
      await render();
      await flushActivity();

      expect(page.querySelector('app-task-actions')).toBeNull();
      expect(page.querySelector('.case-actions')).toBeNull();
    });

    it('claims the current step and says so', async () => {
      await render(withCurrent({ assigneeId: null, assigneeName: null, actions: { canClaim: true, canAssign: false, canComplete: false } }));
      await flushActivity();

      button('Claim this step')!.click();
      await settle();
      http
        .expectOne((r) => r.method === 'POST' && r.url === '/api/tasks/12/claim')
        .flush(withCurrent({ actions: { canClaim: false, canAssign: false, canComplete: true } }));
      await settle();
      flushHistoryRefresh();
      await settle();

      const notice = page.querySelector<HTMLElement>('.cf-alert--success')!;
      expect(notice.textContent).toContain("You claimed Plan Review. It's in your work list.");
      expect(document.activeElement).toBe(notice);
      // The new permissions come from the API's response: now the decision form shows.
      expect(page.querySelector('app-task-actions form')).not.toBeNull();
    });

    it('requires notes to reject, then records the decision', async () => {
      await render(withCurrent({ allowedOutcomes: ['Approve', 'Reject'], actions: { canClaim: false, canAssign: false, canComplete: true } }));
      await flushActivity();

      const labels = [...page.querySelectorAll('app-task-actions mat-radio-button')].map((r) => r.textContent?.trim());
      expect(labels).toEqual(['Approve', 'Reject']);

      page.querySelector<HTMLInputElement>('.outcome--Reject input')!.click();
      await settle();
      expect(page.querySelector('app-task-actions .effect')?.textContent).toBe('Closes the case as rejected.');

      const form = page.querySelector('app-task-actions form')!;
      form.dispatchEvent(new Event('submit'));
      await settle();
      expect(page.querySelector('app-task-actions mat-error')?.textContent).toContain('Notes are required');

      const notes = page.querySelector<HTMLTextAreaElement>('app-task-actions textarea')!;
      notes.value = '  Setback does not meet code.  ';
      notes.dispatchEvent(new Event('input'));
      form.dispatchEvent(new Event('submit'));
      await settle();

      const post = http.expectOne((r) => r.method === 'POST' && r.url === '/api/tasks/12/complete');
      expect(post.request.body).toEqual({ outcome: 'Reject', notes: 'Setback does not meet code.' });
      post.flush(
        withCurrent(
          { status: 'Completed', outcome: 'Reject', actions: { canClaim: false, canAssign: false, canComplete: false } },
          { status: 'Closed', resolution: 'Rejected' },
        ),
      );
      await settle();
      flushHistoryRefresh();
      await settle();

      expect(page.querySelector('.cf-alert--success')?.textContent).toContain('Plan Review rejected. The case is closed as rejected.');
      expect(page.querySelector('.tags')?.textContent).toContain('Closed · Rejected');
      expect(page.querySelector('#current-heading')).toBeNull();
    });

    it('refreshes the case when someone else acted first', async () => {
      await render(withCurrent({ allowedOutcomes: ['Approve'], actions: { canClaim: false, canAssign: false, canComplete: true } }));
      await flushActivity();

      page.querySelector<HTMLInputElement>('.outcome--Approve input')!.click();
      await settle();
      page.querySelector('app-task-actions form')!.dispatchEvent(new Event('submit'));
      await settle();
      http
        .expectOne('/api/tasks/12/complete')
        .flush({ status: 409, detail: 'The record was changed by someone else.' }, { status: 409, statusText: 'Conflict' });
      await settle();

      http.expectOne('/api/cases/20').flush(testCase());
      flushHistoryRefresh();
      await settle();

      expect(page.querySelector('.cf-alert--error[role="alert"]')?.textContent).toContain('someone else may have acted first');
    });

    it('assigns the step to someone in its department', async () => {
      await render(withCurrent({ actions: { canClaim: false, canAssign: true, canComplete: true } }));
      await flushActivity();

      button('Reassign…')!.click();
      await settle();
      http.expectOne((r) => r.url === '/api/users' && r.params.get('departmentId') === '1').flush([
        { id: 7, fullName: 'Luis Ortega', role: 'Staff', departmentId: 1, departmentName: 'Planning & Zoning', isActive: true },
        { id: 8, fullName: 'Mia Chen', role: 'Staff', departmentId: 1, departmentName: 'Planning & Zoning', isActive: true },
      ]);
      await settle();

      const dialog = document.querySelector<HTMLElement>('mat-dialog-container')!;
      expect(dialog.querySelector('h2')?.textContent).toBe('Assign Plan Review');
      dialog.querySelector<HTMLElement>('.mat-mdc-select-trigger')!.click();
      await settle();
      const options = [...document.querySelectorAll<HTMLElement>('mat-option')];
      expect(options.map((o) => o.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
        'Nobody: return it to the Planning & Zoning queue',
        'Luis Ortega · assigned now',
        'Mia Chen',
      ]);
      options[2].click();
      await settle();
      dialog.querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle();

      const post = http.expectOne((r) => r.method === 'POST' && r.url === '/api/tasks/12/assign');
      expect(post.request.body).toEqual({ assigneeId: 8 });
      post.flush(withCurrent({ assigneeId: 8, assigneeName: 'Mia Chen' }));
      await settle();
      flushHistoryRefresh();
      await settle();

      expect(page.querySelector('.cf-alert--success')?.textContent).toContain('Plan Review is assigned to Mia Chen.');
      expect(page.querySelector('.current')?.textContent).toContain('Mia Chen');
    });

    it('puts the case on hold with a reason', async () => {
      await render(testCase({ actions: { canHold: true, canCancel: true, canReopen: false } }));
      await flushActivity();

      expect([...page.querySelectorAll('.case-actions button')].map((b) => b.textContent?.trim())).toEqual(['Put on hold', 'Cancel case']);
      button('Put on hold')!.click();
      await settle();

      const dialog = document.querySelector<HTMLElement>('mat-dialog-container')!;
      expect(dialog.querySelector('h2')?.textContent).toBe('Put the case on hold');
      const reason = dialog.querySelector<HTMLTextAreaElement>('textarea')!;
      reason.value = 'Waiting on the owner.';
      reason.dispatchEvent(new Event('input'));
      dialog.querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle();

      const post = http.expectOne((r) => r.method === 'POST' && r.url === '/api/cases/20/hold');
      expect(post.request.body).toEqual({ reason: 'Waiting on the owner.' });
      post.flush(testCase({ status: 'OnHold', actions: { canHold: false, canCancel: true, canReopen: true } }));
      await settle();
      flushHistoryRefresh();
      // The reason was kept as an internal comment, so the comments are fetched again.
      http
        .expectOne((r) => r.url === '/api/cases/20/comments')
        .flush(pageOf([{ ...comment, id: 2, body: 'Put on hold: Waiting on the owner.' }]));
      await settle();

      expect(page.querySelector('.cf-alert--success')?.textContent).toContain('The case is on hold.');
      expect(page.querySelector('app-case-comments ol')?.textContent).toContain('Put on hold: Waiting on the owner.');
      expect(button('Resume case')).toBeDefined();
    });

    it('lets the worker who asked for information resume the case', async () => {
      await render(withCurrent({ notes: 'Need the survey.' }, { status: 'OnHold', actions: { canHold: false, canCancel: false, canReopen: true } }));
      await flushActivity();

      expect(page.querySelector('.current .cf-alert--warning')?.textContent).toContain('Resume the case when it can go ahead.');
      button('Resume case')!.click();
      await settle();

      expect(document.querySelector('mat-dialog-container h2')?.textContent).toBe('Resume the case');
      document.querySelector('mat-dialog-container form')!.dispatchEvent(new Event('submit'));
      await settle();
      const post = http.expectOne('/api/cases/20/reopen');
      expect(post.request.body).toEqual({ reason: null });
      post.flush(testCase());
      await settle();
      flushHistoryRefresh();
      http.expectOne((r) => r.url === '/api/cases/20/comments').flush(pageOf([]));
      await settle();

      expect(page.querySelector('.cf-alert--success')?.textContent).toContain('The case was resumed.');
    });
  });
});
