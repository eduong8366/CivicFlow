import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

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
