import { Component, inject, input } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

/** Stands in for a screen a later milestone builds, so the navigation works end to end now. */
@Component({
  selector: 'app-planned-page',
  template: `
    <h1>{{ title }}</h1>
    <div class="cf-alert cf-alert--info planned">
      This screen is planned for milestone {{ milestone() }}. The API behind it is ready.
    </div>
  `,
  styles: `
    .planned {
      margin-top: 20px;
      max-width: 640px;
    }
  `,
})
export class PlannedPage {
  protected readonly title = inject(ActivatedRoute).snapshot.title ?? '';

  /** From the route's `data`. */
  readonly milestone = input.required<string>();
}

@Component({
  selector: 'app-forbidden-page',
  imports: [RouterLink],
  template: `
    <h1>Access denied</h1>
    <p>Your role doesn't include this page. If you need it, ask an administrator.</p>
    <a routerLink="/dashboard">Go to your dashboard</a>
  `,
})
export class ForbiddenPage {}

@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink],
  template: `
    <h1>Page not found</h1>
    <p>Check the address, or start again from your dashboard.</p>
    <a routerLink="/dashboard">Go to your dashboard</a>
  `,
})
export class NotFoundPage {}
