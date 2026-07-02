import { useEffect, useRef, useState } from 'react';
import type { StateSnapshot } from '../../../shared/types';
import { useStore } from '../state/socket';
import { rollCategory, rollerColor } from '../lib/rollStyle';
import { renderRollDetail } from '../lib/rollDetail';
import { linkify } from '../lib/linkify';
import { mergeFeed } from '../lib/feed';
import { resolveToken } from '../lib/entities';
import { AdvantageToggle } from './AdvantageToggle';

const QUICK = ['d20', 'd12', 'd10', 'd8', 'd6', 'd4', 'd100'];

/** Dice roller + shared feed of rolls AND chat (visible to everyone), with a
 *  chat input. Rolls and chat are interleaved chronologically (newest at the
 *  bottom) so they share one log. */
export function DicePanel({
  snapshot,
  speakAsTokenId,
}: {
  snapshot: StateSnapshot;
  /** DM only: the currently-selected token, so a chat message can be "spoken as"
   *  that NPC/monster (bubble + sender name). */
  speakAsTokenId?: string | null;
}) {
  const rollDice = useStore((s) => s.rollDice);
  const clearRollLog = useStore((s) => s.clearRollLog);
  const sendChat = useStore((s) => s.sendChat);
  const chatTyping = useStore((s) => s.chatTyping);
  const askAssistant = useStore((s) => s.askAssistant);
  const assistantThinking = useStore((s) => s.assistantThinking);
  const cancelAssistant = useStore((s) => s.cancelAssistant);
  const openRulebook = useStore((s) => s.openRulebook);
  const requestRecap = useStore((s) => s.requestRecap);
  const showRollOverlay = useStore((s) => s.showRollOverlay);
  const toggleRollOverlay = useStore((s) => s.toggleRollOverlay);
  const showDiceButton = useStore((s) => s.showDiceButton);
  const setHideDmRolls = useStore((s) => s.setHideDmRolls);
  const toggleDiceButton = useStore((s) => s.toggleDiceButton);
  const showCursors = useStore((s) => s.showCursors);
  const toggleCursors = useStore((s) => s.toggleCursors);
  const shareCursor = useStore((s) => s.shareCursor);
  const toggleShareCursor = useStore((s) => s.toggleShareCursor);
  const saveResolve = useStore((s) => s.saveResolve);
  const armSaveResolve = useStore((s) => s.armSaveResolve);
  const isDm = snapshot.role === 'dm';
  // A player's dice toggle is keyed to THEIR character (so it's the same switch
  // shown above their skill list); the DM's generic roller gets its own key.
  const mySocketId = useStore((s) => s.socket?.id);
  const myChar = !isDm
    ? snapshot.characters.find((c) => c.claimedBy === mySocketId)
    : undefined;
  const advKey = myChar?.id ?? 'dm-dice';
  const consumeAdvantage = useStore((s) => s.consumeAdvantage);
  const [expr, setExpr] = useState('1d20');
  const [label, setLabel] = useState('');
  const [chatText, setChatText] = useState('');
  // DM "speak as the selected token" — on by default so picking an NPC and
  // typing voices it; toggle off to speak as plain DM. Only relevant when a
  // token is selected.
  const [speakAs, setSpeakAs] = useState(true);
  const speakToken =
    isDm && speakAsTokenId
      ? snapshot.tokens.find((t) => t.id === speakAsTokenId)
      : undefined;
  const speakName = speakToken ? resolveToken(snapshot, speakToken).name : null;
  // The DM's quick AI-backend choice for /ask: 'gemini' or 'local:<model>'.
  // Defaults to local; persisted per browser. Options come from /api/ai/models.
  const [aiBackends, setAiBackends] = useState<{
    ollamaModels: string[];
    defaultOllamaModel: string;
    geminiAvailable: boolean;
    aiMode: 'gemini' | 'local';
  } | null>(null);
  const [aiChoice, setAiChoice] = useState<string>(
    () => localStorage.getItem('dnd.aiBackend') ?? '',
  );
  useEffect(() => {
    if (!isDm) return;
    fetch('/api/ai/models')
      .then((r) => r.json())
      .then((d) => {
        setAiBackends(d);
        setAiChoice((prev) => {
          // Keep a still-valid saved choice; else default to LOCAL.
          const valid =
            prev === 'gemini'
              ? d.geminiAvailable && d.aiMode !== 'local'
              : prev.startsWith('local:') && d.ollamaModels.includes(prev.slice(6));
          if (valid) return prev;
          const localPick = d.ollamaModels.includes(d.defaultOllamaModel)
            ? d.defaultOllamaModel
            : d.ollamaModels[0];
          if (localPick) return `local:${localPick}`;
          return d.geminiAvailable && d.aiMode !== 'local'
            ? 'gemini'
            : `local:${d.defaultOllamaModel}`;
        });
      })
      .catch(() => setAiBackends(null));
  }, [isDm]);
  const pickBackend = (choice: string) => {
    setAiChoice(choice);
    localStorage.setItem('dnd.aiBackend', choice);
  };
  const choiceToBackend = (
    choice: string,
  ): { prefer: 'gemini' | 'local'; ollamaModel?: string } =>
    choice === 'gemini'
      ? { prefer: 'gemini' }
      : { prefer: 'local', ollamaModel: choice.replace(/^local:/, '') };
  const logRef = useRef<HTMLDivElement>(null);
  // Only auto-scroll when the user is already at the bottom, so scrolling up to
  // read history isn't interrupted by new entries.
  const stickRef = useRef(true);

  const feed = mergeFeed(snapshot.rollLog, snapshot.chat);

  const onLogScroll = () => {
    const el = logRef.current;
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  // Keep the newest entry in view as the feed grows — but only scroll the log
  // container itself (never the page), and only when already at the bottom.
  useEffect(() => {
    if (stickRef.current && logRef.current)
      logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [feed.length]);

  const roll = (e: string) =>
    rollDice({
      expr: e,
      label: label.trim() || undefined,
      advantage: consumeAdvantage(advKey),
    });

  // Typing indicator: emit `true` at most once until we've gone idle, and clear
  // it on send/blur/idle. A "/roll" command isn't speech, so it never types.
  const typingRef = useRef(false);
  const idleRef = useRef<ReturnType<typeof setTimeout>>();
  const setTyping = (on: boolean) => {
    if (typingRef.current === on) return;
    typingRef.current = on;
    chatTyping(on);
  };
  useEffect(() => () => setTyping(false), []); // stop typing on unmount
  const onType = (text: string) => {
    setChatText(text);
    const speaking = text.trim().length > 0 && !text.trim().startsWith('/');
    if (idleRef.current) clearTimeout(idleRef.current);
    if (speaking) {
      setTyping(true);
      idleRef.current = setTimeout(() => setTyping(false), 3000);
    } else {
      setTyping(false);
    }
  };

  const send = () => {
    if (idleRef.current) clearTimeout(idleRef.current);
    setTyping(false);
    const body = chatText.trim();
    if (!body) return;
    // DM-only: "/ask <question>" (or "/rules …") routes to the rules assistant
    // instead of posting public chat; the Q&A appears as DM-only messages.
    const ask = isDm && body.match(/^\/(ask|rules?)\s+(.+)/is);
    if (ask) askAssistant(ask[2].trim(), choiceToBackend(aiChoice));
    // Speak as the selected token when the DM has the toggle on (NPC voice).
    else sendChat(body, speakAs && speakToken ? speakToken.id : undefined);
    setChatText('');
  };

  return (
    <div className="panel-section dice-panel">
      <h3>Dice</h3>
      <div className="dice-quick">
        {QUICK.map((q) => (
          <button key={q} className="btn tiny" onClick={() => roll(`1${q}`)}>
            {q}
          </button>
        ))}
      </div>
      <div className="dice-row">
        <input
          value={expr}
          onChange={(e) => setExpr(e.target.value)}
          placeholder="2d6+3"
          onKeyDown={(e) => e.key === 'Enter' && roll(expr)}
        />
        <button className="btn" onClick={() => roll(expr)}>
          Roll
        </button>
      </div>
      <div className="dice-row">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (optional)"
        />
        <AdvantageToggle entityId={advKey} />
      </div>

      <div className="roll-log-header">
        <span className="muted">Log &amp; chat</span>
        <button
          className={`btn tiny ${showRollOverlay ? 'on' : ''}`}
          onClick={toggleRollOverlay}
          title="Show the log as a transparent overlay on the map"
        >
          ⤢ Overlay
        </button>
        <button
          className={`btn tiny ${showDiceButton ? 'on' : ''}`}
          onClick={toggleDiceButton}
          title="Show a quick-roll d20 button in the corner of the map"
        >
          🎲 Dice
        </button>
        <button
          className={`btn tiny ${showCursors ? 'on' : ''}`}
          onClick={toggleCursors}
          title="Show other people's live cursor pointers on the map"
        >
          {showCursors ? '👆 See pointers' : '🚫 See pointers'}
        </button>
        <button
          className={`btn tiny ${shareCursor ? 'on' : ''}`}
          onClick={toggleShareCursor}
          title="Broadcast your own pointer to others — turn off to point privately (e.g. at hidden tokens / unrevealed fog)"
        >
          {shareCursor ? '📡 Share mine' : '🙈 Pointer private'}
        </button>
        {snapshot.role === 'dm' && (
          <button
            className={`btn tiny ${snapshot.hideDmRolls ? 'on' : ''}`}
            onClick={() => setHideDmRolls(!snapshot.hideDmRolls)}
            title="Hide YOUR rolls (attacks/saves/checks) from players' logs — damage still applies and ±HP numbers still pop"
          >
            {snapshot.hideDmRolls ? '🙈 DM rolls hidden' : '👁 DM rolls shown'}
          </button>
        )}
        {isDm && (
          <button
            className="btn tiny"
            onClick={requestRecap}
            title="AI recap of recent rolls + chat, posted to chat for everyone"
          >
            📜 Recap
          </button>
        )}
        {isDm && snapshot.rollLog.length > 0 && (
          <button
            className="btn tiny danger"
            onClick={() => {
              if (window.confirm('Clear the roll log for everyone?')) clearRollLog();
            }}
            title="Remove all roll entries from the shared log (chat is kept)"
          >
            Clear rolls
          </button>
        )}
      </div>
      <div className="roll-log" ref={logRef} onScroll={onLogScroll}>
        {feed.length === 0 && <p className="muted">No rolls or messages yet.</p>}
        {feed.map((item) => {
          if (item.kind === 'chat') {
            const m = item.chat;
            return (
              <div key={item.id} className={`chat-msg ${m.role}`}>
                <span className="chat-sender">{m.sender}</span>
                <span className="chat-text">{linkify(m.text)}</span>
                {m.pages && m.pages.length > 0 && (
                  <span className="chat-cites">
                    📖 Sources:{' '}
                    {m.pages.map((p) => (
                      <button
                        key={p}
                        className="cite-chip"
                        title={`Open the rulebook at page ${p}`}
                        onClick={() => openRulebook(p)}
                      >
                        p.{p}
                      </button>
                    ))}
                  </span>
                )}
              </div>
            );
          }
          const r = item.roll;
          const color = rollerColor(r.roller);
          return (
            <div
              key={item.id}
              className={`roll-entry cat-${rollCategory(r)}`}
              style={{ borderLeftColor: color }}
            >
              <span className="roll-total">{r.total}</span>
              <span className="roll-meta">
                <strong style={{ color }}>{r.roller}</strong>
                {r.label ? ` · ${r.label}` : ''}{' '}
                <span className="muted">{renderRollDetail(r.detail)}</span>
                {r.hpNote && <span className="roll-hp-note">{r.hpNote.text}</span>}
                {r.description && (
                  <span className="roll-desc muted">{r.description}</span>
                )}
                {isDm && (
                  <button
                    className="ask-roll"
                    title="Ask the rules assistant about this roll"
                    onClick={() =>
                      askAssistant(
                        `Explain this D&D 5e roll in rules terms: ${
                          r.label ? r.label + ' — ' : ''
                        }${r.detail}${r.description ? ' — ' + r.description : ''}`,
                        choiceToBackend(aiChoice),
                      )
                    }
                  >
                    ❓
                  </button>
                )}
                {/* The apply payload only reaches a player on their OWN entries
                    (visibility strips it otherwise), so its presence is the gate —
                    the DM sees it on everything, a player only on what they cast. */}
                {r.apply && (() => {
                  // Darts (Magic Missile): roll-on-click, capped at the dart count.
                  // New entries use `darts`; legacy entries used a pre-rolled `split`.
                  const dartCount = r.apply.darts ?? r.apply.split?.length;
                  return (
                  <button
                    className={`btn tiny apply-dmg ${saveResolve?.rollId === r.id ? 'on' : ''}`}
                    onClick={() =>
                      armSaveResolve({
                        rollId: r.id,
                        dc: r.apply!.dc,
                        save: r.apply!.save,
                        label: r.expr,
                        splitTotal: dartCount,
                      })
                    }
                    title={
                      dartCount
                        ? `Click ${dartCount} target(s) to assign each dart (rolls on each hit)`
                        : r.apply!.save
                          ? `Click targets on the map to roll DC ${r.apply!.dc} ${r.apply!.save} saves and auto-apply full/half`
                          : `Click targets on the map to apply ${r.apply!.amount} damage`
                    }
                  >
                    {saveResolve?.rollId === r.id
                      ? dartCount
                        ? `🎯 Dart ${(saveResolve.splitUsed ?? 0) + 1}/${dartCount}… (Esc)`
                        : '🎯 Targeting… (Esc)'
                      : dartCount
                        ? `🎯 Assign darts`
                        : '🎯 Apply damage'}
                  </button>
                  );
                })()}
              </span>
            </div>
          );
        })}
      </div>
      {isDm && assistantThinking && (
        <div className="assistant-thinking" title="The rules assistant is composing an answer">
          <span className="thinking-dots">📖 Rules Assistant is thinking…</span>
          <button className="btn tiny" onClick={cancelAssistant}>
            ⏹ Stop
          </button>
        </div>
      )}
      {isDm && aiBackends && (aiBackends.ollamaModels.length > 0 || aiBackends.geminiAvailable) && (
        <div className="ai-backend-row" title="Which AI answers /ask rules questions">
          <span className="muted">/ask uses:</span>
          <select value={aiChoice} onChange={(e) => pickBackend(e.target.value)}>
            {aiBackends.ollamaModels.map((m) => (
              <option key={m} value={`local:${m}`}>
                {m} (local)
              </option>
            ))}
            {aiBackends.aiMode !== 'local' && aiBackends.geminiAvailable && (
              <option value="gemini">Gemini (cloud)</option>
            )}
            {/* If the configured default model isn't pulled yet, still offer it. */}
            {!aiBackends.ollamaModels.includes(aiBackends.defaultOllamaModel) && (
              <option value={`local:${aiBackends.defaultOllamaModel}`}>
                {aiBackends.defaultOllamaModel} (local)
              </option>
            )}
          </select>
        </div>
      )}
      {speakName && (
        <button
          className={`btn tiny speak-as ${speakAs ? 'on' : ''}`}
          onClick={() => setSpeakAs((v) => !v)}
          title={
            speakAs
              ? `Speaking as ${speakName} — messages show its name and bubble over its token. Click to speak as the DM.`
              : `Speaking as the DM. Click to speak as ${speakName}.`
          }
        >
          🗣 {speakAs ? `As ${speakName}` : 'As DM'}
        </button>
      )}
      <div className="chat-input">
        <input
          placeholder={
            speakAs && speakName
              ? `Speak as ${speakName}…`
              : isDm
                ? 'Message… (/roll 2d6+3 · /ask a rule or DC)'
                : 'Message… (/roll 2d6+3)'
          }
          title={
            isDm
              ? 'Chat · /roll 2d6+3 (optionally adv/dis) to roll · /ask <question> for the DM-only rules assistant — ask a rule or "what DC for …" to get a suggested DC + skill'
              : 'Chat — or type /roll 2d6+3 (optionally adv/dis) to roll dice'
          }
          value={chatText}
          maxLength={2000}
          onChange={(e) => onType(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          onBlur={() => setTyping(false)}
        />
        <button className="btn tiny" disabled={!chatText.trim()} onClick={send}>
          Send
        </button>
      </div>
    </div>
  );
}
