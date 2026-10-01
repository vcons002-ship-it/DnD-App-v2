import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { db, newId } from './db.js';
import { config } from './config.js';
import { exportSession, importSession } from './backup.js';
import { addChatMessage, claimCharacter, createCharacter, createSession, getSessionByCode, listCharacters } from './sessions.js';
import { buildSnapshot } from './visibility.js';

const privateDir = () => path.join(config.dataDir, 'private-chat-images');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');

function fixture() {
  const session = createSession('Private backup');
  const character = createCharacter(session.id, { name: 'Whisper Varis' });
  claimCharacter(character.id, 'source-socket', 'source-owner');
  const imageId = newId(), fileName = `${imageId}.png`;
  fs.mkdirSync(privateDir(), { recursive: true });
  fs.writeFileSync(path.join(privateDir(), fileName), png);
  db.prepare('INSERT INTO chat_images (id, session_id, uploader_owner_id, name, file_name, mime, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(imageId, session.id, 'source-owner', 'Secret map.png', fileName, 'image/png', Date.now());
  db.prepare('INSERT INTO chat_messages (id, session_id, sender, role, text, created_at, whisper_character_id, whisper_character_name, whisper_owner_id, image_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(newId(), session.id, 'DM', 'dm', 'The hidden passage', Date.now(), character.id, character.name, 'source-owner', imageId);
  db.prepare("UPDATE chat_messages SET chat_channel = 'whisper', chat_audience = ?, chat_participants = ?, chat_includes_dm = 1 WHERE session_id = ?")
    .run(JSON.stringify(['source-owner']), JSON.stringify([{ characterId: character.id, characterName: character.name }]), session.id);
  addChatMessage(session.id, 'DM', 'dm', 'Welcome everyone');
  return { session, character, imageId, fileName };
}

describe('private chat backup and restore', () => {
  it('restores private attachment bytes under fresh IDs outside public uploads and keeps whispers as DM archives', () => {
    const f = fixture(), bundle = exportSession(f.session.code)!;
    expect(bundle.chatImages).toHaveLength(1);
    expect(bundle.privateChatAssets?.[f.imageId]).toBe(png.toString('base64'));
    expect(bundle.assets).toEqual({});
    expect(bundle.assetWarnings).toBeUndefined();

    const restored = getSessionByCode(importSession(bundle).code)!;
    const character = listCharacters(restored.id).find((c) => c.name === f.character.name)!;
    const message = db.prepare("SELECT * FROM chat_messages WHERE session_id = ? AND text = 'The hidden passage'")
      .get(restored.id) as Record<string, unknown>;
    const image = db.prepare('SELECT * FROM chat_images WHERE id = ?').get(message.image_id) as Record<string, unknown>;
    expect(message).toMatchObject({ whisper_character_id: character.id, whisper_character_name: f.character.name, whisper_owner_id: null, dm_only: 1, chat_channel: 'whisper', chat_audience: '[]', chat_includes_dm: 1 });
    expect(JSON.parse(message.chat_participants as string)).toEqual([{ characterId: character.id, characterName: character.name }]);
    expect(character.ownerId).toBeNull();
    expect(image).toMatchObject({ session_id: restored.id, uploader_owner_id: null, name: 'Secret map.png', mime: 'image/png' });
    expect(image.id).not.toBe(f.imageId);
    expect(image.file_name).not.toBe(f.fileName);
    expect(fs.readFileSync(path.join(privateDir(), image.file_name as string))).toEqual(png);
    expect(fs.existsSync(path.join(config.uploadsDir, image.file_name as string))).toBe(false);
    // A new character claim, even with the source browser key, cannot inherit it.
    claimCharacter(character.id, 'new-socket', 'source-owner');
    expect(buildSnapshot(restored.id, 'player', null, 'new-socket', 'source-owner')!.chat.map((m) => m.text)).toEqual(['Welcome everyone']);
    expect(buildSnapshot(restored.id, 'dm')!.chat.map((m) => m.text)).toContain('The hidden passage');

    const second = getSessionByCode(importSession(bundle).code)!;
    const secondImage = db.prepare('SELECT * FROM chat_images WHERE session_id = ?').get(second.id) as Record<string, unknown>;
    expect(secondImage.id).not.toBe(image.id);
    expect(secondImage.file_name).not.toBe(image.file_name);
    expect(fs.readFileSync(path.join(privateDir(), f.fileName))).toEqual(png);
  });

  it('imports older version-one bundles without private image fields or whisper columns', () => {
    const session = createSession('Old backup');
    addChatMessage(session.id, 'Player', 'player', 'An ordinary old message');
    const bundle = exportSession(session.code)!;
    delete bundle.chatImages;
    delete bundle.privateChatAssets;
    for (const message of bundle.chat) {
      delete message.whisper_character_id;
      delete message.whisper_character_name;
      delete message.whisper_owner_id;
      delete message.image_id;
      delete message.chat_channel;
      delete message.chat_audience;
      delete message.chat_participants;
      delete message.chat_includes_dm;
    }
    const restored = getSessionByCode(importSession(bundle).code)!;
    expect(buildSnapshot(restored.id, 'player')!.chat.map((m) => m.text)).toEqual(['An ordinary old message']);
    expect(db.prepare('SELECT * FROM chat_images WHERE session_id = ?').all(restored.id)).toEqual([]);
  });

  it('retains older DM whisper labels while converting their copied history to a private DM archive', () => {
    const f = fixture(), bundle = exportSession(f.session.code)!;
    const original = bundle.chat.find((message) => message.text === 'The hidden passage')!;
    delete original.chat_channel;
    delete original.chat_audience;
    delete original.chat_participants;
    delete original.chat_includes_dm;
    const restored = getSessionByCode(importSession(bundle).code)!;
    const character = listCharacters(restored.id).find((c) => c.name === f.character.name)!;
    const dmMessage = buildSnapshot(restored.id, 'dm')!.chat.find((m) => m.text === 'The hidden passage')!;
    expect(dmMessage.whisper).toMatchObject({ characterId: character.id, characterName: f.character.name });
    expect(buildSnapshot(restored.id, 'player', null, 'new-socket', 'source-owner')!.chat.map((m) => m.text)).toEqual(['Welcome everyone']);
  });

  it('reports missing private files and restores text without linking to the original attachment', () => {
    const f = fixture();
    fs.unlinkSync(path.join(privateDir(), f.fileName));
    const bundle = exportSession(f.session.code)!;
    expect(bundle.assetWarnings).toContain(`Unreadable private chat image: ${f.imageId}`);
    expect(bundle.privateChatAssets).toEqual({});
    const restored = getSessionByCode(importSession(bundle).code)!;
    const message = db.prepare("SELECT * FROM chat_messages WHERE session_id = ? AND text = 'The hidden passage'")
      .get(restored.id) as Record<string, unknown>;
    expect(message).toMatchObject({ dm_only: 1, image_id: null, whisper_owner_id: null });
  });

  it('reports unsafe private filenames and rejects traversal in restored metadata', () => {
    const f = fixture();
    db.prepare('UPDATE chat_images SET file_name = ? WHERE id = ?').run('../outside.png', f.imageId);
    const bundle = exportSession(f.session.code)!;
    expect(bundle.assetWarnings).toContain(`Unsafe private chat image: ${f.imageId}`);
    expect(bundle.privateChatAssets).toEqual({});
    expect(() => importSession(bundle)).toThrow('Invalid private chat image metadata');
  });

  it('shares the export capacity limit between public artwork and private attachments', () => {
    const f = fixture(), publicName = `${newId()}.png`;
    fs.writeFileSync(path.join(config.uploadsDir, publicName), png);
    createCharacter(f.session.id, { name: 'Public artwork', icon: `/uploads/${publicName}` });
    // A claimed size exactly at the cap permits the first read. The actual
    // public PNG bytes then leave insufficient capacity for the private image.
    const stat = vi.spyOn(fs, 'statSync').mockReturnValue({ size: 300 * 1024 * 1024 } as ReturnType<typeof fs.statSync>);
    try {
      const bundle = exportSession(f.session.code)!;
      expect(bundle.assets[publicName]).toBe(png.toString('base64'));
      expect(bundle.privateChatAssets).toEqual({});
      expect(bundle.assetWarnings).toContain(`Asset capacity exceeded: private chat image ${f.imageId}`);
    } finally {
      stat.mockRestore();
    }
  });

  it('rolls back imported private files if a later attachment is invalid', () => {
    const f = fixture(), bundle = exportSession(f.session.code)!;
    const badId = newId();
    bundle.chatImages!.push({ ...bundle.chatImages![0], id: badId, file_name: `${badId}.png` });
    bundle.privateChatAssets![badId] = 'invalid data';
    bundle.chat.push({ ...bundle.chat[0], id: newId(), image_id: badId });
    const before = fs.readdirSync(privateDir()).sort();
    expect(() => importSession(bundle)).toThrow('Invalid private chat image contents');
    expect(fs.readdirSync(privateDir()).sort()).toEqual(before);
  });

  it('scrubs player-only audiences without making their imported conversations available to the DM or new owners', () => {
    const f = fixture();
    for (const channel of ['whisper', 'party']) {
      db.prepare('INSERT INTO chat_messages (id, session_id, sender, role, text, created_at, chat_channel, chat_audience, chat_participants, chat_includes_dm) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(newId(), f.session.id, f.character.name, 'player', `Players only ${channel}`, Date.now(), channel,
          JSON.stringify(['source-owner', 'other-owner']), JSON.stringify([{ characterId: f.character.id, characterName: f.character.name }]), 0);
    }
    const restored = getSessionByCode(importSession(exportSession(f.session.code)!).code)!;
    const character = listCharacters(restored.id).find((c) => c.name === f.character.name)!;
    claimCharacter(character.id, 'new-player-socket', 'source-owner');
    const rows = db.prepare("SELECT * FROM chat_messages WHERE session_id = ? AND text LIKE 'Players only %'")
      .all(restored.id) as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.chat_audience === '[]' && r.chat_includes_dm === 0)).toBe(true);
    expect(rows.every((r) => JSON.parse(r.chat_participants as string)[0].characterId === character.id)).toBe(true);
    const dmText = buildSnapshot(restored.id, 'dm')!.chat.map((m) => m.text);
    const playerText = buildSnapshot(restored.id, 'player', null, 'new-player-socket', 'source-owner')!.chat.map((m) => m.text);
    expect(dmText).not.toContain('Players only whisper');
    expect(dmText).not.toContain('Players only party');
    expect(playerText).toEqual(['Welcome everyone']);
  });
});
