import { useLoadingProgress } from '../lib/loadingProgress';

interface MapLoadingBarProps {
  /**
   * 'overlay' renders floating over the map canvas when loading tasks are active.
   * 'screen' renders centered in the viewport for initial campaign/session startup.
   */
  mode?: 'overlay' | 'screen';
  /** Optional label override (used in 'screen' mode). */
  label?: string;
}

export function RollingD20Icon({ className = 'map-loading-d20' }: { className?: string }) {
  return (
    <span className={className} aria-hidden="true">
      <svg viewBox="0 0 48 48" width="28" height="28" fill="none">
        <defs>
          <linearGradient id="d20-face-grad" x1="8" y1="4" x2="40" y2="44" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#32291c" />
            <stop offset="50%" stopColor="#1c1813" />
            <stop offset="100%" stopColor="#100e0c" />
          </linearGradient>
          <linearGradient id="d20-center-grad" x1="14" y1="12" x2="34" y2="36" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#4a381d" />
            <stop offset="100%" stopColor="#221a10" />
          </linearGradient>
          <linearGradient id="d20-edge-grad" x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#f8e1a6" />
            <stop offset="55%" stopColor="#d8a657" />
            <stop offset="100%" stopColor="#8c6836" />
          </linearGradient>
        </defs>
        {/* Outer arcane orbit ring */}
        <circle
          className="map-loading-d20-orbit"
          cx="24"
          cy="24"
          r="22"
          stroke="url(#d20-edge-grad)"
          strokeWidth="1"
          strokeDasharray="5 4"
          opacity="0.55"
        />
        {/* Tumbling icosahedron body */}
        <g className="map-loading-d20-die">
          {/* Outer hexagonal hull */}
          <polygon
            points="24,3 42,13.5 42,34.5 24,45 6,34.5 6,13.5"
            fill="url(#d20-face-grad)"
            stroke="url(#d20-edge-grad)"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          {/* Inner central triangle */}
          <polygon
            points="24,11 35.5,31 12.5,31"
            fill="url(#d20-center-grad)"
            stroke="url(#d20-edge-grad)"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          {/* Facet ridges connecting outer vertices to inner triangle */}
          <line x1="24" y1="3" x2="24" y2="11" stroke="url(#d20-edge-grad)" strokeWidth="1.2" />
          <line x1="24" y1="3" x2="12.5" y2="31" stroke="url(#d20-edge-grad)" strokeWidth="1" opacity="0.75" />
          <line x1="24" y1="3" x2="35.5" y2="31" stroke="url(#d20-edge-grad)" strokeWidth="1" opacity="0.75" />
          <line x1="6" y1="13.5" x2="24" y2="11" stroke="url(#d20-edge-grad)" strokeWidth="1.1" />
          <line x1="42" y1="13.5" x2="24" y2="11" stroke="url(#d20-edge-grad)" strokeWidth="1.1" />
          <line x1="6" y1="13.5" x2="12.5" y2="31" stroke="url(#d20-edge-grad)" strokeWidth="1.1" />
          <line x1="42" y1="13.5" x2="35.5" y2="31" stroke="url(#d20-edge-grad)" strokeWidth="1.1" />
          <line x1="6" y1="34.5" x2="12.5" y2="31" stroke="url(#d20-edge-grad)" strokeWidth="1.2" />
          <line x1="42" y1="34.5" x2="35.5" y2="31" stroke="url(#d20-edge-grad)" strokeWidth="1.2" />
          <line x1="24" y1="45" x2="12.5" y2="31" stroke="url(#d20-edge-grad)" strokeWidth="1.1" />
          <line x1="24" y1="45" x2="35.5" y2="31" stroke="url(#d20-edge-grad)" strokeWidth="1.1" />
          <line x1="6" y1="34.5" x2="24" y2="45" stroke="url(#d20-edge-grad)" strokeWidth="1.2" />
          <line x1="42" y1="34.5" x2="24" y2="45" stroke="url(#d20-edge-grad)" strokeWidth="1.2" />
          {/* Center "20" glyph */}
          <text
            x="24"
            y="27.5"
            textAnchor="middle"
            fill="#f7e2aa"
            fontSize="9.5"
            fontWeight="700"
            fontFamily="Cinzel HUD, Georgia, serif"
          >
            20
          </text>
        </g>
      </svg>
    </span>
  );
}

export function MapLoadingBar({ mode = 'overlay', label: customLabel }: MapLoadingBarProps) {
  const state = useLoadingProgress();

  const isScreen = mode === 'screen';
  const visible = isScreen ? true : state.visible;
  if (!visible) return null;

  const indeterminate = isScreen ? true : state.indeterminate || state.percent === null;
  const percent = !indeterminate && state.percent !== null ? state.percent : null;
  const displayLabel = customLabel ?? state.label;
  const isCorner = !isScreen && state.variant === 'corner';

  return (
    <div
      className={`map-loading-bar-wrap ${isScreen ? 'is-screen' : 'is-overlay'}${isCorner ? ' is-corner' : ''} ${
        state.phase === 'completing' ? 'is-completing' : ''
      }`}
      data-testid={isScreen ? 'session-loading-bar' : 'map-loading-bar'}
      data-loading-category={isScreen ? 'session' : state.category}
      data-loading-variant={isCorner ? 'corner' : 'bar'}
      title={isCorner ? displayLabel : undefined}
      role="status"
      aria-live="polite"
      aria-busy={state.phase !== 'completing'}
    >
      {isCorner ? (
        <div className="map-loading-corner-badge" aria-label={displayLabel}>
          <RollingD20Icon />
        </div>
      ) : (
        <div className="map-loading-card">
          <span className="map-loading-corner tl" aria-hidden="true" />
          <span className="map-loading-corner tr" aria-hidden="true" />
          <span className="map-loading-corner bl" aria-hidden="true" />
          <span className="map-loading-corner br" aria-hidden="true" />
          <div className="map-loading-header">
            <RollingD20Icon />
            <span className="map-loading-label">{displayLabel}</span>
            {percent !== null && (
              <span className="map-loading-percent" data-testid="map-loading-percent">
                {percent}%
              </span>
            )}
          </div>
          <div
            className={`map-loading-track ${indeterminate ? 'is-indeterminate' : 'is-determinate'}`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent ?? undefined}
            aria-label={displayLabel}
          >
            <div
              className="map-loading-fill"
              style={percent !== null ? { width: `${percent}%` } : undefined}
            />
          </div>
        </div>
      )}
    </div>
  );
}
