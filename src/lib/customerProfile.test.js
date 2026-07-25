import { describe, it, expect } from 'vitest';
import { profileToPrefill } from './customerProfile';

describe('profileToPrefill', () => {
  it('uses given_name / family_name / email when present', () => {
    const u = { email: 'a@b.com', user_metadata: { given_name: 'Ada', family_name: 'Obi', email: 'a@b.com' } };
    expect(profileToPrefill(u)).toEqual({ firstName: 'Ada', lastName: 'Obi', email: 'a@b.com' });
  });
  it('splits full_name when given/family are absent', () => {
    const u = { email: 'x@y.com', user_metadata: { full_name: 'Ada Grace Obi' } };
    expect(profileToPrefill(u)).toEqual({ firstName: 'Ada', lastName: 'Grace Obi', email: 'x@y.com' });
  });
  it('falls back to top-level email and empty names', () => {
    expect(profileToPrefill({ email: 'z@z.com', user_metadata: {} })).toEqual({ firstName: '', lastName: '', email: 'z@z.com' });
  });
  it('returns all-empty for null user', () => {
    expect(profileToPrefill(null)).toEqual({ firstName: '', lastName: '', email: '' });
  });
});
