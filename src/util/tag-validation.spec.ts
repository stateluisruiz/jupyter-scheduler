import { emailTagErrors, isEmailTag, MAX_EMAIL_TAGS } from './tag-validation';

describe('email tags', () => {
  it('accepts a single address and rejects malformed ones', () => {
    expect(isEmailTag('user@state.co.us')).toBe(true);
    expect(isEmailTag('  user@state.co.us  ')).toBe(true);
    expect(isEmailTag('not-an-email')).toBe(false);
    expect(isEmailTag('user@')).toBe(false);
    expect(isEmailTag('a b@state.co.us')).toBe(false);
    expect(isEmailTag('')).toBe(false);
  });

  it('requires 1 to 5 addresses when a job is scheduled', () => {
    expect(emailTagErrors(undefined, true).list).toBe('required');
    expect(emailTagErrors([], true).list).toBe('required');
    expect(emailTagErrors([' '], true).list).toBe('required');
    expect(emailTagErrors(['user@state.co.us'], true).list).toBe(null);
    expect(
      emailTagErrors(
        Array.from({ length: MAX_EMAIL_TAGS }, (_, i) => `u${i}@state.co.us`),
        true
      ).list
    ).toBe(null);
    expect(
      emailTagErrors(
        Array.from(
          { length: MAX_EMAIL_TAGS + 1 },
          (_, i) => `u${i}@state.co.us`
        ),
        true
      ).list
    ).toBe('max');
  });

  it('flags a bad address without requiring tags on a run-now job', () => {
    expect(emailTagErrors(undefined, false).list).toBe(null);
    expect(emailTagErrors(['not-an-email'], false).fields[0]).toBe('format');
    expect(emailTagErrors([''], true).fields[0]).toBe('blank');
  });
});
