import { memo, useEffect, useRef, useState } from 'react';
import { liquidImpact, stepLiquidFill } from '../../../shared/liquidOrbMotion';
import { LIQUID_ORB_FRAGMENT } from './liquid-orb-shader';
import './liquid-orb-effects.css';

const VERTEX = `attribute vec2 p; varying vec2 uv; void main(){uv=p;gl_Position=vec4(p,0.,1.);}`;

export const LiquidOrb = memo(function LiquidOrb({
  fraction,
  amount,
  maxAmount,
  temporary = false,
}: {
  fraction: number;
  /** Actual current HP, not maximum or fraction: cosmetic feedback only. */
  amount?: number;
  /** Used only to scale cosmetic impacts consistently at high and low HP. */
  maxAmount?: number;
  temporary?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const value = useRef(fraction);
  value.current = Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 0;
  const previousAmount = useRef(amount);
  const capacity = useRef(maxAmount);
  capacity.current = maxAmount;
  const impulse = useRef({ started: 0, strength: 0, priorFill: value.current });
  const requestStaticDraw = useRef<(() => void) | null>(null);
  const [effect, setEffect] = useState<'idle' | 'damage' | 'healing'>('idle');
  const [fallback, setFallback] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [paused, setPaused] = useState(() => document.hidden);

  useEffect(() => {
    const before = previousAmount.current;
    previousAmount.current = amount;
    if (amount === undefined || before === undefined || !Number.isFinite(amount) || !Number.isFinite(before) || amount === before) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden) {
      impulse.current.strength = 0;
      setEffect('idle');
      return;
    }
    const delta = amount - before;
    const maximum = capacity.current ?? (value.current > 0 ? amount / value.current : Math.max(1, before, amount));
    impulse.current = {
      started: performance.now(),
      ...liquidImpact(before, amount, maximum),
    };
    setEffect(delta < 0 ? 'damage' : 'healing');
    const timer = window.setTimeout(() => {
      impulse.current.strength = 0;
      setEffect('idle');
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [amount]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const gl = el.getContext('webgl', {
      alpha: true,
      antialias: false,
      powerPreference: 'low-power',
      premultipliedAlpha: false,
    });
    if (!gl) {
      setFallback(true);
      return;
    }
    const make = (kind: number, source: string) => {
      const s = gl.createShader(kind)!;
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        gl.deleteShader(s);
        return null;
      }
      return s;
    };
    const vertex = make(gl.VERTEX_SHADER, VERTEX),
      fragment = make(gl.FRAGMENT_SHADER, LIQUID_ORB_FRAGMENT);
    if (!vertex || !fragment) {
      if (vertex) gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
      setFallback(true);
      return;
    }
    const program = gl.createProgram()!;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setFallback(true);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      return;
    }
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const pos = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    const timer = gl.getUniformLocation(program, 'time'),
      level = gl.getUniformLocation(program, 'fill'),
      impact = gl.getUniformLocation(program, 'impact'),
      impactAge = gl.getUniformLocation(program, 'impactAge'),
      priorFill = gl.getUniformLocation(program, 'priorFill');
    const tint = temporary ? [0.06, 0.69, 0.9] : [0.82, 0.035, 0.075];
    gl.uniform3f(
      gl.getUniformLocation(program, 'tint'),
      tint[0],
      tint[1],
      tint[2],
    );
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(motion.matches);
    let frame = 0,
      previous = 0,
      shown = value.current,
      stopped = false;
    const draw = (now: number) => {
      if (stopped || document.hidden) return;
      if (now - previous >= 32 || motion.matches) {
        const elapsed = Math.min(.1, (now - previous) / 1000);
        previous = now;
        const size = Math.min(
          384,
          Math.max(
            96,
            Math.round(el.clientWidth * Math.min(devicePixelRatio, 2)),
          ),
        );
        if (el.width !== size) {
          el.width = size;
          el.height = size;
        }
        gl.viewport(0, 0, size, size);
        shown = stepLiquidFill(shown, value.current, elapsed, motion.matches);
        // Bound the value before conversion to mediump, so hours-long campaign
        // tabs do not lose all fine animation timing in the fragment shader.
        gl.uniform1f(timer, motion.matches ? 0 : (now / 1000) % 480);
        gl.uniform1f(level, shown);
        gl.uniform1f(impact, motion.matches ? 0 : impulse.current.strength);
        gl.uniform1f(impactAge, Math.max(0, (now - impulse.current.started) / 1000));
        gl.uniform1f(priorFill, impulse.current.priorFill);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      // Reduced motion redraws only after input, resize or visibility changes:
      // no wave animation, tween, polling or requestAnimationFrame loop.
      if (!motion.matches) frame = requestAnimationFrame(draw);
    };
    const restart = () => {
      cancelAnimationFrame(frame);
      setReducedMotion(motion.matches);
      setPaused(document.hidden);
      if (motion.matches) {
        impulse.current.strength = 0;
        setEffect('idle');
      }
      if (!document.hidden) draw(performance.now());
    };
    requestStaticDraw.current = () => {
      if (motion.matches) restart();
    };
    const resize = new ResizeObserver(() => requestStaticDraw.current?.());
    resize.observe(el);
    const lost = (e: Event) => {
      e.preventDefault();
      stopped = true;
      cancelAnimationFrame(frame);
      setFallback(true);
    };
    el.addEventListener('webglcontextlost', lost);
    document.addEventListener('visibilitychange', restart);
    motion.addEventListener('change', restart);
    restart();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      requestStaticDraw.current = null;
      resize.disconnect();
      document.removeEventListener('visibilitychange', restart);
      motion.removeEventListener('change', restart);
      el.removeEventListener('webglcontextlost', lost);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, [temporary]);
  useEffect(() => requestStaticDraw.current?.(), [fraction]);
  return (
    <span
      className={`liquid-orb liquid-orb-effects${temporary ? ' temporary' : ''}${fallback ? ' fallback' : ''}`}
      aria-hidden="true"
      data-liquid-renderer={fallback ? 'fallback' : 'webgl'}
      data-liquid-motion={paused ? 'paused' : reducedMotion ? 'reduced' : 'animated'}
      data-liquid-effect={effect}
      data-liquid-translucent="true"
      data-liquid-empty={value.current === 0 ? 'true' : undefined}
      data-liquid-full={value.current === 1 ? 'true' : undefined}
    >
      <span
        className="orb-fallback-fill"
        style={{ height: `${value.current * 100}%` }}
      />
      <canvas ref={canvas} />
    </span>
  );
});
