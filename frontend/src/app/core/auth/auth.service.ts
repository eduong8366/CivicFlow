import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom, map, Observable, tap } from 'rxjs';
import { CurrentUser, LoginRequest, LoginResponse, UserRole } from './auth.models';

interface Session {
  token: string;
  expiresAt: number;
  user: CurrentUser;
}

export type SignOutReason = 'signed-out' | 'expired';

const storageKey = 'civicflow.session';

/**
 * The signed-in session. The access token lives in sessionStorage: it survives a reload but not
 * closing the tab, and it isn't shared with other tabs. The API has no refresh tokens, so the
 * session ends when the token expires (60 minutes by default).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly session = signal<Session | null>(readStoredSession());

  readonly user = computed(() => this.session()?.user ?? null);
  readonly isAuthenticated = computed(() => this.session() !== null);

  constructor() {
    // Sign out when the token expires, rather than at the next failed request.
    effect((onCleanup) => {
      const session = this.session();
      if (!session) {
        return;
      }

      const timer = setTimeout(
        () => this.logout({ reason: 'expired', returnUrl: this.router.url }),
        Math.max(session.expiresAt - Date.now(), 0),
      );
      onCleanup(() => clearTimeout(timer));
    });
  }

  /** The bearer token for API calls, or null when signed out or expired. */
  get token(): string | null {
    const session = this.session();
    return session && session.expiresAt > Date.now() ? session.token : null;
  }

  hasRole(...roles: UserRole[]): boolean {
    const user = this.user();
    return user !== null && roles.includes(user.role);
  }

  login(request: LoginRequest): Observable<CurrentUser> {
    return this.http.post<LoginResponse>('/api/auth/login', request).pipe(
      tap((response) =>
        this.setSession({
          token: response.accessToken,
          expiresAt: Date.parse(response.expiresAt),
          user: response.user,
        }),
      ),
      map((response) => response.user),
    );
  }

  /**
   * Re-reads the account on startup, so a changed name, role or department shows at once. A
   * deactivated account gets a 401, which the interceptor turns into a sign-out.
   */
  async refresh(): Promise<void> {
    const session = this.session();
    if (!session || !this.token) {
      this.clear();
      return;
    }

    try {
      const user = await firstValueFrom(this.http.get<CurrentUser>('/api/auth/me'));
      this.setSession({ ...session, user });
    } catch {
      // Offline or the API is down: keep the stored session; requests will fail visibly.
    }
  }

  logout(options: { reason?: SignOutReason; returnUrl?: string } = {}): void {
    this.clear();
    const returnUrl = options.returnUrl && !options.returnUrl.startsWith('/login') ? options.returnUrl : undefined;
    void this.router.navigate(['/login'], {
      queryParams: { reason: options.reason === 'expired' ? 'expired' : undefined, returnUrl },
    });
  }

  private setSession(session: Session): void {
    this.session.set(session);
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(session));
    } catch {
      // Storage can be unavailable (private mode, policy); the session then lasts until reload.
    }
  }

  private clear(): void {
    this.session.set(null);
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // See setSession.
    }
  }
}

function readStoredSession(): Session | null {
  try {
    const stored = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') as Partial<Session> | null;
    if (
      typeof stored?.token === 'string' &&
      typeof stored.expiresAt === 'number' &&
      stored.expiresAt > Date.now() &&
      typeof stored.user?.id === 'number'
    ) {
      return stored as Session;
    }
  } catch {
    // Unreadable or malformed: start signed out.
  }

  return null;
}
