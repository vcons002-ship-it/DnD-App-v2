import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { config } from './config.js';
import { extractJson, generateJson, generateText, aiAvailable } from './ai/gateway.js';
import { refreshOllama, ollamaReachable } from './ai/ollama.js';

describe('AI gateway — extractJson', () => {
  it('strips ```json fences', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
  it('trims surrounding prose to the JSON object', () => {
    expect(extractJson('Sure! {"a":1} hope that helps')).toBe('{"a":1}');
  });
  it('leaves clean JSON untouched', () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });
});

describe('AI gateway — Ollama-first routing', () => {
  const realKey = config.geminiApiKey;
  beforeEach(() => {
    config.ollamaUrl = 'http://localhost:11434';
    config.ollamaModel = 'test-model';
    config.geminiApiKey = ''; // isolate the local path (no Gemini fallback)
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    config.geminiApiKey = realKey;
  });

  it('probes health and routes JSON + text through Ollama', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).endsWith('/api/tags')) return new Response('{"models":[]}', { status: 200 });
        const body = JSON.parse(String(init?.body ?? '{}'));
        const content = body.format === 'json' ? '{"name":"Goblin"}' : 'prose reply';
        return new Response(JSON.stringify({ message: { content } }), { status: 200 });
      }),
    );
    expect(await refreshOllama()).toBe(true);
    expect(ollamaReachable()).toBe(true);
    expect(aiAvailable()).toBe(true);

    const json = await generateJson('make a goblin');
    expect(JSON.parse(json!).name).toBe('Goblin');
    expect(await generateText('sys', 'user')).toBe('prose reply');
  });

  it('fails safe to null when Ollama is down and no Gemini key', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    expect(await refreshOllama()).toBe(false);
    expect(aiAvailable()).toBe(false);
    expect(await generateJson('anything')).toBeNull();
    expect(await generateText('a', 'b')).toBeNull();
  });
});
