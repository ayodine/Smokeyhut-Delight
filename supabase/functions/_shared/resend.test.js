import { describe, it, expect } from 'vitest';
import { personalizeForResend } from './resend.ts';

describe('personalizeForResend', () => {
  it('rewrites {customer_name} to the Resend merge tag', () => {
    expect(personalizeForResend('Hi {customer_name}, welcome'))
      .toBe('Hi {{{FIRST_NAME}}}, welcome');
  });
  it('rewrites every occurrence', () => {
    expect(personalizeForResend('{customer_name} {customer_name}'))
      .toBe('{{{FIRST_NAME}}} {{{FIRST_NAME}}}');
  });
  it('converts newlines to <br>', () => {
    expect(personalizeForResend('line1\nline2')).toBe('line1<br>line2');
  });
});
