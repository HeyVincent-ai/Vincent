import { describe, it, expect, vi } from 'vitest';

// Mock prisma to prevent initialization error
vi.mock('../db/client', () => ({
  default: {},
}));

import { SecretType } from '@prisma/client';
import { serializeSecretValue } from './secret.service';

describe('serializeSecretValue', () => {
  it('accepts non-empty strings for API_KEY', () => {
    expect(serializeSecretValue(SecretType.API_KEY, 'abc123')).toBe('abc123');
  });

  it('rejects empty strings for API_KEY', () => {
    expect(() => serializeSecretValue(SecretType.API_KEY, '')).toThrow();
  });

  it('accepts credentials with password field', () => {
    const value = { username: 'alice', password: 'hunter2' };
    expect(serializeSecretValue(SecretType.CREDENTIALS, value)).toBe(JSON.stringify(value));
  });

  it('accepts credentials with secret field', () => {
    const value = { accountId: 'acct-1', secret: 'top-secret' };
    expect(serializeSecretValue(SecretType.CREDENTIALS, value)).toBe(JSON.stringify(value));
  });

  it('rejects credentials without password or secret', () => {
    expect(() => serializeSecretValue(SecretType.CREDENTIALS, { username: 'alice' })).toThrow();
  });

  it('rejects oversized values', () => {
    const oversized = 'a'.repeat(16 * 1024 + 1);
    expect(() => serializeSecretValue(SecretType.API_KEY, oversized)).toThrow();
  });
});
