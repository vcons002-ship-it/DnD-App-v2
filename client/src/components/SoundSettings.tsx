import { useState } from 'react';
import { useStore } from '../state/socket';
import {
  getSfxVolume, isDiceSfxPreferred, isSfxMuted, playHit, setDiceSfxOn, setSfxMuted, setSfxVolume,
} from '../lib/sfx';
import { previewDiceClack } from '../lib/diceSfx';

/**
 * Per-device sound + animation options — the ONE block both roles see: the DM's
 * Settings modal and the player's Interface panel. Everything here is this
 * browser only (localStorage); nothing reaches the server or other players.
 */
export function SoundSettings() {
  const [muted, setMuted] = useState(isSfxMuted());
  const [volume, setVolume] = useState(getSfxVolume());
  // The saved dice choice, never derived from the master mute (muted + dice off
  // must still read as off when reopened, and stay off when sound returns).
  const [dice, setDice] = useState(isDiceSfxPreferred());
  const showRollAnim = useStore((s) => s.showRollAnim);
  const toggleRollAnim = useStore((s) => s.toggleRollAnim);
  return (
    <div className="sound-settings">
      <label className="settings-field settings-check">
        <input
          type="checkbox"
          checked={!muted}
          onChange={(e) => {
            const on = e.target.checked;
            setSfxMuted(!on);
            setMuted(!on);
            if (on) playHit(); // preview when turning sound on
          }}
        />
        Sound <span className="muted">(combat cues and dice — this device only)</span>
      </label>
      <label className="settings-field sound-volume">
        <span>Volume</span>
        <input
          type="range" min={0} max={100} step={5}
          aria-label="Sound volume"
          disabled={muted}
          value={Math.round(volume * 100)}
          onChange={(e) => { const v = Number(e.target.value) / 100; setVolume(v); setSfxVolume(v); }}
          onPointerUp={() => playHit()}
          onKeyUp={() => playHit()}
        />
        <span className="sound-volume-value" aria-hidden="true">{Math.round(volume * 100)}%</span>
      </label>
      <label className="settings-field settings-check">
        <input
          type="checkbox"
          disabled={muted}
          checked={dice}
          onChange={(e) => {
            setDiceSfxOn(e.target.checked);
            setDice(e.target.checked);
            if (e.target.checked) previewDiceClack();
          }}
        />
        Dice sounds <span className="muted">(each die clacks and rolls as it really moves)</span>
      </label>
      <label className="settings-field settings-check">
        <input type="checkbox" checked={showRollAnim} onChange={toggleRollAnim} />
        Roll animations <span className="muted">(3D dice tray and reveals — off shows results instantly)</span>
      </label>
    </div>
  );
}
