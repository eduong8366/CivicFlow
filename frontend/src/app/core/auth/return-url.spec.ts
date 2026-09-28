import { safeReturnUrl } from './return-url';

describe('safeReturnUrl', () => {
  it('keeps in-app paths', () => {
    expect(safeReturnUrl('/cases/42?tab=history')).toBe('/cases/42?tab=history');
  });

  it.each([
    ['empty', ''],
    ['missing', undefined],
    ['absolute URL', 'https://evil.example/phish'],
    ['protocol-relative URL', '//evil.example'],
    ['backslash trick', '/\\evil.example'],
    ['relative path', 'cases/42'],
    ['the sign-in page', '/login?returnUrl=/x'],
  ])('falls back for %s', (_name, value) => {
    expect(safeReturnUrl(value)).toBe('/dashboard');
  });
});
