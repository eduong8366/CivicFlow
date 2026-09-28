import { afterNextRender, Component, ElementRef, inject, Injector, input, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { problemMessage } from '../../core/api/problem-details';
import { AuthService } from '../../core/auth/auth.service';
import { safeReturnUrl } from '../../core/auth/return-url';
import { AgencyBanner } from '../../layout/agency-banner';

export const demoPassword = 'CivicFlow!2026';

/** Seeded in Development only (see the backend's DevDataSeeder). */
const demoAccounts = [
  { email: 'admin@civicflow.test', description: 'Admin · agency-wide' },
  { email: 'pz.supervisor@civicflow.test', description: 'Supervisor · Planning & Zoning' },
  { email: 'pz.staff1@civicflow.test', description: 'Staff · Planning & Zoning' },
  { email: 'pw.staff1@civicflow.test', description: 'Staff · Public Works' },
];

@Component({
  selector: 'app-login-page',
  imports: [AgencyBanner, MatButtonModule, MatFormFieldModule, MatInputModule, ReactiveFormsModule],
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly errorBox = viewChild<ElementRef<HTMLElement>>('errorBox');

  /** Query parameters (component input binding). */
  readonly returnUrl = input<string>();
  readonly reason = input<string>();

  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showPassword = signal(false);
  protected readonly demoAccounts = environment.showDemoAccounts ? demoAccounts : [];
  protected readonly demoPassword = demoPassword;

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    this.auth.login(this.form.getRawValue()).subscribe({
      next: () => void this.router.navigateByUrl(safeReturnUrl(this.returnUrl())),
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(problemMessage(error, 'Sign-in failed. Please try again.'));
        // Move focus to the message so screen reader and keyboard users hear it.
        afterNextRender(() => this.errorBox()?.nativeElement.focus(), { injector: this.injector });
      },
    });
  }

  protected useDemoAccount(email: string): void {
    this.form.setValue({ email, password: demoPassword });
  }
}
