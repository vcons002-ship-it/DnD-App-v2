import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { config } from './config.js';
import { extractJson, generateJson, generateText, aiAvailable } from './ai/gateway.js';
import { refreshOllama, ollamaReachable } from './ai/ollama.js';
import { clearResolvedModel } from './creatures/gemini.js';

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

/** Stub fetch so Ollama and Gemini return distinguishable payloads. */
function stub(geminiText: string, localText: string) {
  return vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/api/tags')) return new Response('{"models":[]}', { status: 200 });
    if (u.includes('generativelanguage'))
      return new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: geminiText }] } }] }),
        { status: 200 },
      );
    // Ollama /api/chat
    const body = JSON.parse(String(init?.body ?? '{}'));
    return new Response(
      JSON.stringify({ message: { content: body.format === 'json' ? localText : localText } }),
      { status: 200 },
    );
  });
}

describe('AI gateway — backend selection', () => {
  const realKey = config.geminiApiKey;
  const realModel = config.geminiModel;
  const realMode = config.aiMode;
  beforeEach(() => {
    config.ollamaUrl = 'http://localhost:11434';
    config.ollamaModel = 'test-model';
    config.geminiModel = 'gemini-test'; // skip model discovery
    config.aiMode = 'gemini';
    clearResolvedModel();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    config.geminiApiKey = realKey;
    config.geminiModel = realModel;
    config.aiMode = realMode;
    clearResolvedModel();
  });

  it('gemini mode + key: prefers Gemini', async () => {
    config.geminiApiKey = 'k';
    vi.stubGlobal('fetch', stub('{"src":"gemini"}', '{"src":"local"}'));
    expect(JSON.parse((await generateJson('x'))!).src).toBe('gemini');
  });

  it('gemini mode, no key: falls back to local Ollama', async () => {
    config.geminiApiKey = '';
    vi.stubGlobal('fetch', stub('{"src":"gemini"}', '{"src":"local"}'));
    expect(JSON.parse((await generateJson('x'))!).src).toBe('local');
  });

  it("prefer:'local' uses Ollama even when a Gemini key is set", async () => {
    config.geminiApiKey = 'k';
    vi.stubGlobal('fetch', stub('{"src":"gemini"}', '{"src":"local"}'));
    const out = await generateJson('x', { prefer: 'local', ollamaModel: 'pick-me' });
    expect(JSON.parse(out!).src).toBe('local');
  });

  it("aiMode 'local' is a lockdown — forces local even with prefer:'gemini'", async () => {
    config.aiMode = 'local';
    config.geminiApiKey = 'k';
    vi.stubGlobal('fetch', stub('GEMINI', 'LOCAL'));
    expect(await generateText('s', 'u', { prefer: 'gemini' })).toBe('LOCAL');
  });

  it('aiAvailable reflects mode: local needs Ollama up; gemini accepts a key', async () => {
    config.geminiApiKey = 'k';
    config.aiMode = 'gemini';
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    await refreshOllama();
    expect(ollamaReachable()).toBe(false);
    expect(aiAvailable()).toBe(true); // gemini key counts in gemini mode
    config.aiMode = 'local';
    expect(aiAvailable()).toBe(false); // local mode needs Ollama reachable
  });

  it('fails safe to null when nothing is usable', async () => {
    config.geminiApiKey = '';
    config.aiMode = 'gemini';
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    expect(await generateJson('anything')).toBeNull();
    expect(await generateText('a', 'b')).toBeNull();
  });
});
