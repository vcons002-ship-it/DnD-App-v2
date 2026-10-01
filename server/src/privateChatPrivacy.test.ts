import { describe, expect, it } from 'vitest';
import { db, newId } from './db.js';
import { claimCharacter, createCharacter, createSession, getSessionByCode, updateCharacter } from './sessions.js';
import { exportSession, importSession } from './backup.js';
import { buildSnapshot, createSnapshotBuilder } from './visibility.js';
import type { ChatParticipant } from './privateChat.js';

function fixture() {
  const session = createSession('Private audiences');
  const alice = createCharacter(session.id, { name: 'Whisper Alice' });
  const bob = createCharacter(session.id, { name: 'Whisper Bob' });
  const cleo = createCharacter(session.id, { name: 'Whisper Cleo' });
  claimCharacter(alice.id, 'socket-a', 'audience-owner-a');
  claimCharacter(bob.id, 'socket-b', 'audience-owner-b');
  claimCharacter(cleo.id, 'socket-c', 'audience-owner-c');
  const participant = (c: typeof alice): ChatParticipant => ({ characterId: c.id, characterName: c.name });
  const add = (text: string, channel: 'whisper' | 'party' | null, audience: string[] = [], includesDm = false, participants: ChatParticipant[] = [], dmOnly = false) => {
    db.prepare('INSERT INTO chat_messages (id, session_id, sender, role, text, created_at, dm_only, chat_channel, chat_audience, chat_includes_dm, chat_participants) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(newId(), session.id, 'Speaker', 'player', text, Date.now(), dmOnly ? 1 : 0, channel, JSON.stringify(audience), includesDm ? 1 : 0, JSON.stringify(participants));
  };
  add('Public table talk', null);
  add('DM and Alice', 'whisper', ['audience-owner-a'], true, [participant(alice)]);
  add('DM and Bob', 'whisper', ['audience-owner-b'], true, [participant(bob)]);
  add('Alice and Bob', 'whisper', ['audience-owner-a', 'audience-owner-b'], false, [participant(alice), participant(bob)]);
  add('Party plans', 'party');
  add('DM assistant notes', null, [], false, [], true);
  return { session, alice, bob, cleo, add };
}

describe('private chat snapshot boundaries', () => {
  it.each([['a', 'b'], ['b', 'a']])('keeps individual whispers separate when the shared snapshot builder runs in %s then %s order', (first, second) => {
    const f = fixture(), build = createSnapshotBuilder(f.session.id)!;
    const snapshots = new Map([first, second].map((id) => [id, build('player', null, `socket-${id}`, `audience-owner-${id}`)]));
    expect(snapshots.get('a')!.chat.map((m) => m.text)).toEqual(['Public table talk', 'DM and Alice', 'Alice and Bob', 'Party plans']);
    expect(snapshots.get('b')!.chat.map((m) => m.text)).toEqual(['Public table talk', 'DM and Bob', 'Alice and Bob', 'Party plans']);
    expect(build('player', null, 'socket-c', 'audience-owner-c').chat.map((m) => m.text)).toEqual(['Public table talk', 'Party plans']);
    expect(build('dm').chat.map((m) => m.text)).toEqual(['Public table talk', 'DM and Alice', 'DM and Bob', 'DM assistant notes']);
    expect(build('player', null, 'anonymous', null).chat.map((m) => m.text)).toEqual(['Public table talk']);
  });

  it('keeps DM, player-to-player and Party audiences separate when DM is shaped first', () => {
    const f = fixture(), build = createSnapshotBuilder(f.session.id)!;
    const dm = build('dm');
    expect(dm.chat.map((m) => m.text)).not.toContain('Party plans');
    expect(dm.chat.map((m) => m.text)).not.toContain('Alice and Bob');
    expect(build('player', null, 'socket-a', 'audience-owner-a').chat.map((m) => m.text)).toContain('Alice and Bob');
    expect(build('player', null, 'socket-b', 'audience-owner-b').chat.map((m) => m.text)).not.toContain('DM and Alice');
  });

  it('binds whisper history to the original browser audience across reconnect, character reassignment and rename', () => {
    const f = fixture();
    claimCharacter(f.alice.id, 'new-owner-socket', 'replacement-owner');
    updateCharacter(f.alice.id, { name: 'A different character name' });
    const oldOwner = buildSnapshot(f.session.id, 'player', null, 'reconnected-socket', 'audience-owner-a')!;
    const newOwner = buildSnapshot(f.session.id, 'player', null, 'new-owner-socket', 'replacement-owner')!;
    expect(oldOwner.chat.map((m) => m.text)).toContain('DM and Alice');
    expect(oldOwner.chat.map((m) => m.text)).toContain('Alice and Bob');
    expect(newOwner.chat.map((m) => m.text)).toEqual(['Public table talk', 'Party plans']);
    expect(oldOwner.chat.find((m) => m.text === 'DM and Alice')!.whisper?.characterName).toBe('Whisper Alice');
    const otherSession = createSession('Other private campaign');
    expect(buildSnapshot(otherSession.id, 'player', null, 'foreign', 'audience-owner-a')!.chat).toEqual([]);
  });

  it('removes server-only audience metadata and other players browser keys before serialization', () => {
    const f = fixture(), build = createSnapshotBuilder(f.session.id)!;
    for (const chat of [build('dm').chat, build('player', null, 'socket-a', 'audience-owner-a').chat, build('player', null, 'socket-c', 'audience-owner-c').chat]) {
      const serialized = JSON.stringify(chat);
      expect(serialized).not.toContain('audience-owner-');
      for (const message of chat) {
        expect(message).not.toHaveProperty('privacy');
        expect(message).not.toHaveProperty('chat_audience');
        expect(message).not.toHaveProperty('whisper_owner_id');
      }
    }
  });

  it('keeps older DM whispers private and hides malformed image-only records instead of exposing them as public chat', () => {
    const f = fixture();
    db.prepare('INSERT INTO chat_messages (id, session_id, sender, role, text, created_at, whisper_character_id, whisper_character_name, whisper_owner_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(newId(), f.session.id, 'DM', 'dm', 'Legacy private note', Date.now(), f.alice.id, f.alice.name, 'audience-owner-a');
    db.prepare('INSERT INTO chat_messages (id, session_id, sender, role, text, created_at, image_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(newId(), f.session.id, 'DM', 'dm', 'Attachment without audience', Date.now(), newId());
    const build = createSnapshotBuilder(f.session.id)!;
    expect(build('dm').chat.map((m) => m.text)).toContain('Legacy private note');
    expect(build('player', null, 'socket-a', 'audience-owner-a').chat.map((m) => m.text)).toContain('Legacy private note');
    expect(build('player', null, 'socket-b', 'audience-owner-b').chat.map((m) => m.text)).not.toContain('Legacy private note');
    for (const snapshot of [build('dm'), build('player', null, 'socket-a', 'audience-owner-a'), build('player', null, 'socket-b', 'audience-owner-b')])
      expect(snapshot.chat.map((m) => m.text)).not.toContain('Attachment without audience');
  });

  it('hides malformed private channels from the DM and public feed before and after import', () => {
    const f = fixture();
    f.add('Malformed private plans', 'party');
    db.prepare("UPDATE chat_messages SET chat_channel = 'partyy', chat_audience = 'not JSON' WHERE session_id = ? AND text = 'Malformed private plans'")
      .run(f.session.id);
    const restored = getSessionByCode(importSession(exportSession(f.session.code)!).code)!;
    for (const sessionId of [f.session.id, restored.id]) {
      const build = createSnapshotBuilder(sessionId)!;
      expect(build('dm').chat.map((m) => m.text)).not.toContain('Malformed private plans');
      expect(build('player', null, 'socket-a', 'audience-owner-a').chat.map((m) => m.text)).not.toContain('Malformed private plans');
    }
  });
});
