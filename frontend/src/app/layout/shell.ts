import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, DestroyRef, ElementRef, inject, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map, pairwise } from 'rxjs';
import { AuthService } from '../core/auth/auth.service';
import { AgencyBanner } from './agency-banner';
import { navigationFor } from './navigation';

/** The signed-in frame: banner, header, sidebar navigation and the page in `<main>`. */
@Component({
  selector: 'app-shell',
  imports: [AgencyBanner, MatButtonModule, MatMenuModule, MatSidenavModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly sidenav = viewChild.required(MatSidenav);
  private readonly main = viewChild.required<ElementRef<HTMLElement>>('main');

  protected readonly user = this.auth.user;
  protected readonly sections = computed(() => {
    const user = this.user();
    return user ? navigationFor(user) : [];
  });
  protected readonly roleLine = computed(() => {
    const user = this.user();
    return user ? [user.role, user.departmentName].filter(Boolean).join(' · ') : '';
  });

  /** Below 960px the sidebar becomes a drawer opened from the header. */
  protected readonly compact = toSignal(
    inject(BreakpointObserver).observe('(max-width: 959.98px)').pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  constructor() {
    // A route change in a single-page app doesn't move focus; move it to the new page so
    // keyboard and screen reader users start at its content (the title is announced too). A
    // change of query only (sorting, paging, filtering a list) stays on the same page, so focus
    // stays on the control that made it.
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        map((event) => event.urlAfterRedirects.split(/[?#]/)[0]),
        pairwise(),
        filter(([previous, current]) => previous !== current),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => this.main().nativeElement.focus({ preventScroll: false }));
  }

  protected focusMain(event: Event): void {
    event.preventDefault();
    this.main().nativeElement.focus();
  }

  protected search(event: Event, query: string): void {
    event.preventDefault();
    const search = query.trim();
    void this.router.navigate(['/cases'], { queryParams: search ? { search } : {} });
  }

  protected closeIfCompact(): void {
    if (this.compact()) {
      void this.sidenav().close();
    }
  }

  protected signOut(): void {
    this.auth.logout();
  }
}
