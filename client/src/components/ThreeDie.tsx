import { createContext, memo, useContext, useEffect, useRef } from 'react';
import {
  add,
  center,
  cross,
  dieMesh,
  dot,
  faceForwardMesh,
  normal,
  percentileFaces,
  scale,
  type V3,
} from '../../../shared/diceGeometry';
import './three-die.css';
import { DICE_THEMES } from '../../../shared/diceThemes';
export const DiceThemeContext = createContext(DICE_THEMES.neutral);

function rotate(v: V3, x: number, y: number, z: number): V3 {
  const a: V3 = [
    v[0],
    v[1] * Math.cos(x) - v[2] * Math.sin(x),
    v[1] * Math.sin(x) + v[2] * Math.cos(x),
  ];
  const b: V3 = [
    a[0] * Math.cos(y) + a[2] * Math.sin(y),
    a[1],
    -a[0] * Math.sin(y) + a[2] * Math.cos(y),
  ];
  return [
    b[0] * Math.cos(z) - b[1] * Math.sin(z),
    b[0] * Math.sin(z) + b[1] * Math.cos(z),
    b[2],
  ];
}

/** Projected, lit 3D meshes on Canvas2D keep many dice lightweight and avoid
 * creating a WebGL context per die. Orientation is cosmetic; value is supplied
 * by the existing server-result reveal. No roll/spend/damage calls live here. */
const MeshDie = memo(function MeshDie({
  sides,
  value,
  big,
  rolling,
  crit,
  tens,
  percentileOnes,
  onSettled,
}: {
  sides: number;
  value: number;
  big?: boolean;
  rolling?: boolean;
  crit?: boolean;
  tens?: boolean;
  percentileOnes?: boolean;
  onSettled?: () => void;
}) {
  const theme = useContext(DiceThemeContext);
  const ref = useRef<HTMLCanvasElement>(null);
  const state = useRef({ value, rolling });
  state.current = { value, rolling };
  const settledCallback = useRef(onSettled);
  settledCallback.current = onSettled;
  const repaint = useRef<() => void>();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const mesh = faceForwardMesh(dieMesh(sides)),
      reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const oriented = mesh.vertices;
    const textAxes = mesh.faces.map((f) => {
      const a = oriented[f[0]],
        b = oriented[f[1]],
        c = oriented[f[2]];
      const fn = normal(cross(add(b, scale(a, -1)), add(c, scale(a, -1))));
      const horizontal: V3 = Math.abs(fn[0]) > 0.95 ? [0, 1, 0] : [1, 0, 0];
      return normal(add(horizontal, scale(fn, -dot(horizontal, fn))));
    });
    let frame = 0,
      prev = -100,
      phase = 0,
      wasRolling = !!state.current.rolling,
      settledAt = 0;
    let lastAngles: V3 = [0, 0, 0];
    let landingAngles: V3 = [0, 0, 0];
    let stopped = false;
    let reportedSettled = false;
    const size = big ? 116 : 68;
    const dpr = Math.min(Math.max(devicePixelRatio, 2), 3);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const draw = (now: number) => {
      if (stopped || document.hidden) return;
      if (now - prev < 32) {
        frame = requestAnimationFrame(draw);
        return;
      }
      prev = now;
      const rolling = !!state.current.rolling && !reduced.matches;
      if (wasRolling && !rolling) {
        settledAt = now;
        // Take the short rotation home instead of unwinding every full tumble.
        landingAngles = lastAngles.map((a) => Math.atan2(Math.sin(a), Math.cos(a))) as V3;
      }
      wasRolling = rolling;
      if (rolling) { phase = now * 0.011; reportedSettled = false; }
      const ease = rolling
        ? 1
        : reduced.matches
          ? 0
          : Math.pow(Math.max(0, 1 - (now - settledAt) / 220), 3);
      // Exactly zero final tilt: the engraved authoritative result is the
      // front face, upright and parallel to the screen on every polyhedron.
      const angles: V3 = rolling
        ? [phase * 0.83, phase * 0.67, phase * 0.31]
        : landingAngles.map((a) => a * ease) as V3;
      lastAngles = angles;
      canvas.dataset.orientation = rolling ? 'rolling' : ease > 0 ? 'settling' : 'face-forward';
      const vs = oriented.map((v) => rotate(v, ...angles));
      const project = (v: V3): [number, number] => {
        const f = 3.8 / (3.8 - v[2]);
        return [
          size / 2 + v[0] * size * 0.35 * f,
          size / 2 - v[1] * size * 0.35 * f,
        ];
      };
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = '#0005';
      ctx.beginPath();
      ctx.ellipse(
        size * 0.5,
        size * 0.86,
        size * 0.27,
        size * 0.055,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      const faces = mesh.faces
        .map((f, id) => ({
          id,
          pts: f.map((i) => vs[i]),
          c: center(f.map((i) => vs[i])),
        }))
        .sort((a, b) => a.c[2] - b.c[2]);
      for (const face of faces) {
        let norm = normal(
          cross(
            add(face.pts[1], scale(face.pts[0], -1)),
            add(face.pts[2], scale(face.pts[0], -1)),
          ),
        );
        if (dot(norm, face.c) < 0) norm = scale(norm, -1);
        if (norm[2] < -0.05) continue;
        const light = Math.max(0, dot(norm, normal([-0.5, 0.8, 1])));
        const points = face.pts.map(project);
        ctx.beginPath();
        points.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, 0, size, size);
        const hue = crit ? 38 : theme.hue;
        const saturation = crit ? 65 : theme.saturation;
        grad.addColorStop(0, `hsl(${hue} ${saturation}% ${15 + light * 42}%)`);
        grad.addColorStop(0.45, `hsl(${hue} ${saturation}% ${12 + light * 22}%)`);
        grad.addColorStop(1, `hsl(${hue} ${saturation}% ${6 + light * 13}%)`);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = crit ? '#f6d680' : theme.metal;
        ctx.lineJoin = 'round';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        const inset = project(face.c);
        ctx.beginPath();
        points.forEach((p, i) => {
          const x = inset[0] + (p[0] - inset[0]) * 0.89,
            y = inset[1] + (p[1] - inset[1]) * 0.89;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
        ctx.closePath();
        ctx.strokeStyle = `rgba(250,221,166,${light * 0.23})`;
        ctx.lineWidth = 0.6;
        ctx.stroke();
        // Face-local basis gives glyphs the same 3D foreshortening as the mesh.
        const c = project(face.c),
          u = rotate(textAxes[face.id], ...angles),
          v = normal(cross(norm, u));
        const pu = project(add(face.c, scale(u, 0.15))),
          pv = project(add(face.c, scale(v, 0.15)));
        const basis = size * 0.35 * 0.15;
        let faceValue =
          face.id === 0
            ? state.current.value
            : ((Math.max(1, state.current.value) + face.id - 1) % sides) + 1;
        if (tens)
          faceValue =
            ((Math.floor(state.current.value / 10) + face.id) % 10) * 10;
        if (percentileOnes) faceValue = (state.current.value + face.id) % 10;
        const label = tens
          ? String(faceValue).padStart(2, '0')
          : String(faceValue);
        ctx.save();
        ctx.beginPath();
        points.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
        ctx.closePath();
        ctx.clip();
        // A broad polished reflection, clipped to the physical facet.
        const sheen = ctx.createRadialGradient(c[0] - size * .12, c[1] - size * .18, 0, c[0], c[1], size * .48);
        sheen.addColorStop(0, `rgba(255,255,255,${.08 + Math.pow(light, 8) * .32})`);
        sheen.addColorStop(.35, 'rgba(255,255,255,.025)');
        sheen.addColorStop(1, 'rgba(0,0,0,.12)');
        ctx.fillStyle = sheen;
        ctx.fillRect(0, 0, size, size);
        ctx.translate(...c);
        ctx.transform(
          (pu[0] - c[0]) / basis,
          (pu[1] - c[1]) / basis,
          -(pv[0] - c[0]) / basis,
          -(pv[1] - c[1]) / basis,
          0,
          0,
        );
        // Engraving is in the face's local plane, so it tumbles with the die.
        const radius = size * (sides >= 12 ? .095 : .13);
        ctx.strokeStyle = crit ? '#ffe5a1' : theme.metal;
        ctx.globalAlpha = .48;
        ctx.lineWidth = .55;
        for (let j = 0; j < 6; j++) {
          ctx.save(); ctx.rotate(j * Math.PI / 3);
          ctx.beginPath();
          if (theme.motif === 'leaf') {
            ctx.moveTo(radius, 0);
            ctx.quadraticCurveTo(radius * 1.7, -radius * .5, radius * 1.8, 0);
            ctx.quadraticCurveTo(radius * 1.3, radius * .35, radius, 0);
          } else if (theme.motif === 'arcane') {
            ctx.moveTo(radius, -.5); ctx.lineTo(radius * 1.35, -radius * .3);
            ctx.lineTo(radius * 1.3, radius * .2); ctx.lineTo(radius * 1.9, 0);
          } else if (theme.motif === 'sun') {
            ctx.moveTo(radius * 1.35, 0); ctx.lineTo(radius * 1.9, 0);
            ctx.arc(radius * 1.2, 0, 1, 0, Math.PI * 2);
          } else {
            ctx.moveTo(radius * 1.3, -radius * .25);
            ctx.lineTo(radius * 1.6, 0); ctx.lineTo(radius * 1.3, radius * .25);
          }
          ctx.stroke(); ctx.restore();
        }
        // Fine machining/stone grain stays attached to each facet.
        ctx.globalAlpha = .09;
        for (let j = 0; j < 24; j++) {
          const x = Math.sin(j * 17 + face.id) * size * .3;
          const y = Math.cos(j * 29 + face.id) * size * .3;
          ctx.fillStyle = j % 2 ? '#fff' : '#000';
          ctx.fillRect(x, y, .6, .6);
        }
        ctx.globalAlpha = 1;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${size * (tens ? 0.15 : sides === 10 ? 0.17 : sides >= 12 ? 0.17 : 0.19)}px Georgia`;
        ctx.fillStyle = face.id === 0 ? theme.ink : '#ddd2bd';
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 2;
        ctx.strokeStyle = '#090b13';
        ctx.lineWidth = 2.2;
        ctx.strokeText(label, 0, .6);
        ctx.fillText(label, 0, 0);
        ctx.restore();
      }
      if (rolling || ease > 0) frame = requestAnimationFrame(draw);
      else if (!reportedSettled) {
        reportedSettled = true;
        // Report only after the authoritative face has actually been painted.
        settledCallback.current?.();
      }
    };
    const restart = () => {
      cancelAnimationFrame(frame);
      prev = -100;
      draw(performance.now());
    };
    repaint.current = restart;
    document.addEventListener('visibilitychange', restart);
    reduced.addEventListener('change', restart);
    restart();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      repaint.current = undefined;
      document.removeEventListener('visibilitychange', restart);
      reduced.removeEventListener('change', restart);
    };
  }, [sides, big, crit, tens, percentileOnes, theme]);
  // Start landing on the prop update, not on a separate 100ms polling clock.
  useEffect(() => { repaint.current?.(); }, [value, rolling]);
  return (
    <canvas
      ref={ref}
      className={`three-die${big ? ' big' : ''}`}
      role="img"
      aria-label={`${tens ? 'Percentile tens' : `d${sides}`}: ${rolling ? 'rolling' : value}`}
      data-theme={theme.id}
      data-critical={!!crit}
      data-sides={sides}
      data-value={value}
    />
  );
});

export function ThreeDie(props: {
  sides: number;
  value: number;
  big?: boolean;
  rolling?: boolean;
  crit?: boolean;
  onSettled?: () => void;
}) {
  const landed = useRef(new Set<string>());
  if (props.rolling) landed.current.clear();
  const percentileSettled = (part: string) => {
    landed.current.add(part);
    if (landed.current.size === 2) props.onSettled?.();
  };
  if (props.sides === 100) {
    const [tens, ones] = percentileFaces(props.value);
    return (
      <span
        className="percentile-pair"
        aria-label={`Percentile roll: ${props.rolling ? 'rolling' : props.value}`}
      >
        <MeshDie {...props} sides={10} value={tens} tens onSettled={() => percentileSettled('tens')} />
        <MeshDie {...props} sides={10} value={ones} percentileOnes onSettled={() => percentileSettled('ones')} />
      </span>
    );
  }
  return <MeshDie {...props} />;
}
