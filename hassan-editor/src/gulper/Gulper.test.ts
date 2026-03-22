import { describe, expect, it } from 'vitest';
import { buildGulperErrorMessage, shouldSubmitThoughtOnKeydown } from './Gulper';

describe('shouldSubmitThoughtOnKeydown', () => {
  it('submits on Cmd+Enter', () => {
    expect(shouldSubmitThoughtOnKeydown({ key: 'Enter', metaKey: true, ctrlKey: false, shiftKey: false })).toBe(true);
  });

  it('submits on Ctrl+Enter', () => {
    expect(shouldSubmitThoughtOnKeydown({ key: 'Enter', metaKey: false, ctrlKey: true, shiftKey: false })).toBe(true);
  });

  it('does not submit on plain Enter', () => {
    expect(shouldSubmitThoughtOnKeydown({ key: 'Enter', metaKey: false, ctrlKey: false, shiftKey: false })).toBe(false);
  });

  it('does not submit on Shift+Enter', () => {
    expect(shouldSubmitThoughtOnKeydown({ key: 'Enter', metaKey: false, ctrlKey: false, shiftKey: true })).toBe(false);
  });
});

describe('buildGulperErrorMessage', () => {
  it('uses API error field when present', () => {
    expect(buildGulperErrorMessage(500, { error: 'database is locked' })).toBe('database is locked');
  });

  it('falls back to status code when error is missing', () => {
    expect(buildGulperErrorMessage(503, { message: 'upstream failed' })).toBe('request failed (503)');
  });
});
