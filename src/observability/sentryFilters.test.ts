import { describe, expect, it } from 'vitest';
import { shouldIgnoreSentryEvent } from './sentryFilters.js';

describe('shouldIgnoreSentryEvent', () => {
  it('ignores expected user errors', () => {
    expect(
      shouldIgnoreSentryEvent({
        exception: { values: [{ type: 'Error', value: 'Insufficient funds for gas * price + value' }] },
      }),
    ).toBe(true);
  });

  it('ignores known browser noise', () => {
    expect(
      shouldIgnoreSentryEvent({
        message: 'ChunkLoadError: Loading chunk 4 failed.',
      }),
    ).toBe(true);
  });

  it('keeps real server bugs', () => {
    expect(
      shouldIgnoreSentryEvent({
        exception: { values: [{ type: 'TypeError', value: "Cannot read properties of undefined (reading 'id')" }] },
      }),
    ).toBe(false);
  });
});
