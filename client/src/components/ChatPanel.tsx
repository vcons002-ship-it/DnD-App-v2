import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/socket';

/** Shared in-session chat: a scrolling message list + send box. Messages persist
 *  with the session and are visible to the DM and all players. */
export function ChatPanel() {
  const chat = useStore((s) => s.snapshot?.chat ?? []);
  const sendChat = useStore((s) => s.sendChat);
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  // Keep the latest message in view as chat grows.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [chat.length]);

  const send = () => {
    const body = text.trim();
    if (!body) return;
    sendChat(body);
    setText('');
  };

  return (
    <div className="chat-panel">
      <h4>Chat</h4>
      <div className="chat-log">
        {chat.length === 0 && <p className="muted">No messages yet.</p>}
        {chat.map((m) => (
          <div key={m.id} className={`chat-msg ${m.role}`}>
            <span className="chat-sender">{m.sender}</span>
            <span className="chat-text">{m.text}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="chat-input">
        <input
          placeholder="Message…"
          value={text}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button className="btn tiny" disabled={!text.trim()} onClick={send}>
          Send
        </button>
      </div>
    </div>
  );
}
