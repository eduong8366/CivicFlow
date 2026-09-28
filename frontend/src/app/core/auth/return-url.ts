/**
 * Only an in-app path may be a post-sign-in destination, so a crafted `?returnUrl=` can't send
 * someone to another site (an open redirect).
 */
export function safeReturnUrl(value: string | null | undefined, fallback = '/dashboard'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return fallback;
  }

  return value.startsWith('/login') ? fallback : value;
}
