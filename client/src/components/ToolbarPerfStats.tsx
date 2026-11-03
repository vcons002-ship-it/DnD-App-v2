import { useEffect, useState } from 'react';
import { useStore } from '../state/socket';
import { safeSetItem } from '../lib/storage';

declare const __APP_VERSION__: string | undefined;
declare const __APP_COMMIT__: string | undefined;
declare const __APP_BUILD_TIME__: string | undefined;

const STORAGE_KEY = 'dnd.showPerfStats';
const CHANGE_EVENT = 'dnd:perf-stats-change';

export const APP_BUILD_INFO = {
  version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'v2.0',
  commit: typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : 'dev',
  buildTime: typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : '',
};

function formatBuildTime(iso: string): string {
  if (!iso) return 'dev';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function readPerfStatsEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setPerfStatsEnabled(enabled: boolean): void {
  safeSetItem(STORAGE_KEY, enabled ? '1' : '0');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: enabled }));
  }
}

export function usePerfStatsEnabled(): [boolean, (next: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean>(() => readPerfStatsEnabled());
  useEffect(() => {
    const sync = () => setEnabled(readPerfStatsEnabled());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return [enabled, setPerfStatsEnabled];
}

export function PerfStatsSettingControl() {
  const [enabled, setEnabled] = usePerfStatsEnabled();
  return (
    <label className="settings-field settings-check">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => setEnabled(e.target.checked)}
      />
      Show FPS, latency &amp; network stats in toolbar{' '}
      <span className="muted">(top-right monitor — this device only)</span>
    </label>
  );
}

export function BuildVersionNote() {
  const [serverInfo, setServerInfo] = useState<{ version?: string; commit?: string } | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/health', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { version?: string; commit?: string }) => {
        if (active) setServerInfo(d);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const formattedDate = formatBuildTime(APP_BUILD_INFO.buildTime);
  const serverLabel =
    serverInfo?.version || serverInfo?.commit
      ? ` · Server ${serverInfo.version ?? 'v2.0'}${serverInfo.commit ? ` (${serverInfo.commit})` : ''}`
      : '';

  return (
    <div
      className="build-version-note"
      data-testid="build-version-note"
      style={{
        fontSize: '11px',
        color: '#a39b8b',
        padding: '6px 8px',
        marginTop: '8px',
        borderRadius: '4px',
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <strong style={{ color: '#dfc490' }}>DnD-App {APP_BUILD_INFO.version}</strong> · Client build{' '}
      <code>{APP_BUILD_INFO.commit}</code> ({formattedDate}){serverLabel}
    </div>
  );
}

function packetBytes(pkt: { data?: unknown } | undefined): number {
  if (!pkt || pkt.data == null) return 4;
  if (typeof pkt.data === 'string') return pkt.data.length;
  if (pkt.data instanceof ArrayBuffer) return pkt.data.byteLength;
  if (ArrayBuffer.isView(pkt.data)) return pkt.data.byteLength;
  return 16;
}

function formatRate(bytesPerSec: number): string {
  const kb = bytesPerSec / 1024;
  if (kb < 0.1) return '0.0';
  if (kb < 10) return kb.toFixed(1);
  return String(Math.round(kb));
}

export function ToolbarPerfStats() {
  const [enabled] = usePerfStatsEnabled();
  const socket = useStore((s) => s.socket);
  const status = useStore((s) => s.status);
  const [stats, setStats] = useState<{
    fps: number;
    frameMs: number;
    pingMs: number | null;
    rxBps: number;
    txBps: number;
    rxPkts: number;
    txPkts: number;
    totalRxBytes: number;
    totalTxBytes: number;
    heapMb: number | null;
    transport: string;
    serverCommit: string;
  }>({
    fps: 60,
    frameMs: 16.7,
    pingMs: null,
    rxBps: 0,
    txBps: 0,
    rxPkts: 0,
    txPkts: 0,
    totalRxBytes: 0,
    totalTxBytes: 0,
    heapMb: null,
    transport: 'ws',
    serverCommit: APP_BUILD_INFO.commit,
  });

  useEffect(() => {
    if (!enabled) return;

    let rafId = 0;
    let frames = 0;
    let lastWindow = performance.now();
    let lastFrame = lastWindow;
    let maxFrameDelta = 0;

    let rxWindowBytes = 0;
    let txWindowBytes = 0;
    let rxWindowPkts = 0;
    let txWindowPkts = 0;
    let totalRx = 0;
    let totalTx = 0;

    const onPacket = (pkt: { data?: unknown }) => {
      const b = packetBytes(pkt);
      rxWindowBytes += b;
      totalRx += b;
      rxWindowPkts++;
    };
    const onPacketCreate = (pkt: { data?: unknown }) => {
      const b = packetBytes(pkt);
      txWindowBytes += b;
      totalTx += b;
      txWindowPkts++;
    };

    type EngineLike = {
      transport?: { name?: string };
      on?: (ev: string, fn: (pkt: { data?: unknown }) => void) => void;
      off?: (ev: string, fn: (pkt: { data?: unknown }) => void) => void;
    };

    let attachedEngine: EngineLike | null = null;
    const attachEngine = () => {
      const eng = (socket?.io as unknown as { engine?: EngineLike } | undefined)?.engine ?? null;
      if (eng === attachedEngine) return;
      if (attachedEngine) {
        attachedEngine.off?.('packet', onPacket);
        attachedEngine.off?.('packetCreate', onPacketCreate);
      }
      attachedEngine = eng;
      if (attachedEngine) {
        attachedEngine.on?.('packet', onPacket);
        attachedEngine.on?.('packetCreate', onPacketCreate);
      }
    };
    attachEngine();

    let perfObs: PerformanceObserver | null = null;
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        perfObs = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const res = entry as PerformanceResourceTiming;
            const bytes = res.transferSize || res.encodedBodySize || 0;
            if (bytes > 0 && !res.name.includes('/api/health')) {
              rxWindowBytes += bytes;
              totalRx += bytes;
            }
          }
        });
        perfObs.observe({ type: 'resource', buffered: false });
      } catch {
        perfObs = null;
      }
    }

    const tick = (now: number) => {
      frames++;
      const dt = now - lastFrame;
      lastFrame = now;
      if (dt > maxFrameDelta) maxFrameDelta = dt;

      const elapsed = now - lastWindow;
      if (elapsed >= 1000) {
        attachEngine();
        const scale = 1000 / elapsed;
        const fps = Math.round(frames * scale);
        const frameMs = frames > 0 ? Math.round((elapsed / frames) * 10) / 10 : 0;
        const rxBps = rxWindowBytes * scale;
        const txBps = txWindowBytes * scale;
        const rxPkts = Math.round(rxWindowPkts * scale);
        const txPkts = Math.round(txWindowPkts * scale);
        const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        const heapMb = mem ? Math.round((mem.usedJSHeapSize / (1024 * 1024)) * 10) / 10 : null;
        const transport = attachedEngine?.transport?.name === 'websocket' ? 'WS' : (attachedEngine?.transport?.name ?? 'HTTP');

        setStats((prev) => ({
          ...prev,
          fps,
          frameMs,
          rxBps,
          txBps,
          rxPkts,
          txPkts,
          totalRxBytes: totalRx,
          totalTxBytes: totalTx,
          heapMb,
          transport,
        }));

        frames = 0;
        maxFrameDelta = 0;
        rxWindowBytes = 0;
        txWindowBytes = 0;
        rxWindowPkts = 0;
        txWindowPkts = 0;
        lastWindow = now;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    let active = true;
    const measurePing = () => {
      const t0 = performance.now();
      fetch('/api/health', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d: { commit?: string }) => {
          if (!active) return;
          const rtt = Math.max(1, Math.round(performance.now() - t0));
          setStats((prev) => ({
            ...prev,
            pingMs: rtt,
            serverCommit: d.commit ?? prev.serverCommit,
          }));
        })
        .catch(() => {
          if (active) setStats((prev) => ({ ...prev, pingMs: null }));
        });
    };
    measurePing();
    const pingTimer = setInterval(measurePing, 2500);

    return () => {
      active = false;
      cancelAnimationFrame(rafId);
      clearInterval(pingTimer);
      perfObs?.disconnect();
      if (attachedEngine) {
        attachedEngine.off?.('packet', onPacket);
        attachedEngine.off?.('packetCreate', onPacketCreate);
      }
    };
  }, [enabled, socket]);

  if (!enabled) return null;

  const fpsColor = stats.fps >= 50 ? '#7be08a' : stats.fps >= 30 ? '#f2c166' : '#f07171';
  const pingColor =
    stats.pingMs === null
      ? '#a39b8b'
      : stats.pingMs <= 60
        ? '#7be08a'
        : stats.pingMs <= 150
          ? '#f2c166'
          : '#f07171';

  const tooltip = [
    `DnD-App ${APP_BUILD_INFO.version} · Client ${APP_BUILD_INFO.commit} (${formatBuildTime(APP_BUILD_INFO.buildTime)})`,
    `Server commit: ${stats.serverCommit} · Socket: ${status} (${stats.transport})`,
    `FPS: ${stats.fps} (${stats.frameMs} ms/frame)`,
    `Latency (RTT): ${stats.pingMs !== null ? `${stats.pingMs} ms` : 'measuring…'}`,
    `Network: ↓ ${formatRate(stats.rxBps)} KB/s (${stats.rxPkts} pkt/s) · ↑ ${formatRate(stats.txBps)} KB/s (${stats.txPkts} pkt/s)`,
    `Session total: ↓ ${(stats.totalRxBytes / (1024 * 1024)).toFixed(2)} MB · ↑ ${(stats.totalTxBytes / (1024 * 1024)).toFixed(2)} MB`,
    ...(stats.heapMb !== null ? [`JS Heap: ${stats.heapMb} MB`] : []),
  ].join('\n');

  return (
    <div
      className="toolbar-perf-stats"
      data-testid="toolbar-perf-stats"
      title={tooltip}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '7px',
        padding: '3px 8px',
        borderRadius: '4px',
        background: 'rgba(10, 13, 18, 0.78)',
        border: '1px solid rgba(140, 116, 77, 0.45)',
        fontSize: '11px',
        lineHeight: 1.2,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        color: '#d6cfc2',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      <span style={{ color: '#dfc490', fontWeight: 700 }}>{APP_BUILD_INFO.version}</span>
      <span style={{ color: fpsColor, fontWeight: 600 }}>{stats.fps} FPS</span>
      <span style={{ color: pingColor }}>
        {stats.pingMs !== null ? `${stats.pingMs}ms` : '—'}
      </span>
      <span className="toolbar-perf-net" style={{ color: '#a8b5c4' }}>
        ↓{formatRate(stats.rxBps)} ↑{formatRate(stats.txBps)} KB/s
      </span>
    </div>
  );
}
