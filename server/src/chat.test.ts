import { describe, it, expect } from 'vitest';
import { createSession, addChatMessage, listChat } from './sessions.js';
import { buildSnapshot } from './visibility.js';

describe('in-session chat', () => {
  it('stores messages oldest-first and exposes them in the snapshot', () => {
    const s = createSession('Chat');
    addChatMessage(s.id, 'DM', 'dm', 'Welcome');
    addChatMessage(s.id, 'Varis', 'player', 'Hi all');
    const log = listChat(s.id);
    expect(log.map((m) => m.text)).toEqual(['Welcome', 'Hi all']);
    expect(log[0].role).toBe('dm');

    // Visible to players in the role-shaped snapshot.
    const snap = buildSnapshot(s.id, 'player');
    expect(snap!.chat.map((m) => m.text)).toEqual(['Welcome', 'Hi all']);
  });

  it('trims overly long messages', () => {
    const s = createSession('Chat2');
    addChatMessage(s.id, 'Varis', 'player', 'x'.repeat(5000));
    expect(listChat(s.id)[0].text.length).toBe(4000);
  });
});
