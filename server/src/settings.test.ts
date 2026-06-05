import { describe, it, expect } from 'vitest';
import { publicSettings } from './settings.js';

describe('settings', () => {
  it('never exposes the raw API key, only whether one is set', () => {
    const s = publicSettings() as Record<string, unknown>;
    expect(typeof s.hasKey).toBe('boolean');
    expect(typeof s.geminiModel).toBe('string');
    expect('geminiApiKey' in s).toBe(false);
    expect('apiKey' in s).toBe(false);
  });
});
