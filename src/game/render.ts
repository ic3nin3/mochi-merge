// Canvas rendering for Mochi Merge — everything is drawn by hand (no
// matter.js debug renderer, no image assets).

import { TIERS, MAX_TIER, type TierDef } from './tiers';

export interface JarRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  wall: number; // wall thickness
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // remaining ms
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
}

export interface FloatText {
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

const PASTEL_PARTICLES = ['#ff9eb5', '#b8a9f2', '#ffc39e', '#ffdf8a', '#a9e7c6', '#9ed8f2', '#ffb3d9'];

export function pastelParticleColor(i: number): string {
  return PASTEL_PARTICLES[i % PASTEL_PARTICLES.length];
}

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

export function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#fff6ec'); // cream
  g.addColorStop(0.55, '#ffeef2'); // blush
  g.addColorStop(1, '#ffe4ec');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Soft floating sparkles — deterministic positions animated by time.
  ctx.save();
  for (let i = 0; i < 18; i++) {
    const seed = i * 137.51;
    const x = ((seed * 7.13) % 1) * w + Math.sin(time / 2400 + i) * 14;
    const y = ((seed * 3.77) % 1) * h + Math.cos(time / 3100 + i * 2) * 12;
    const tw = 0.35 + 0.3 * Math.sin(time / 500 + i * 1.7);
    ctx.globalAlpha = Math.max(0, tw);
    ctx.fillStyle = i % 3 === 0 ? '#ffd9e6' : i % 3 === 1 ? '#e6dcff' : '#fff3c9';
    const s = 2.2 + (i % 3);
    ctx.beginPath();
    ctx.arc(((x % w) + w) % w, ((y % h) + h) % h, s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Jar
// ---------------------------------------------------------------------------

export function drawJar(ctx: CanvasRenderingContext2D, jar: JarRect): void {
  const { left, right, top, bottom, wall } = jar;
  ctx.save();

  // Glass interior tint
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  roundRect(ctx, left, top - 6, right - left, bottom - top + 6, 18);
  ctx.fill();

  // Walls + floor as soft rounded glass bars
  const wallGrad = ctx.createLinearGradient(left, 0, right, 0);
  wallGrad.addColorStop(0, 'rgba(255,255,255,0.9)');
  wallGrad.addColorStop(0.5, 'rgba(255,240,246,0.75)');
  wallGrad.addColorStop(1, 'rgba(255,255,255,0.9)');
  ctx.fillStyle = wallGrad;
  ctx.strokeStyle = 'rgba(233, 160, 185, 0.55)';
  ctx.lineWidth = 2;

  // left wall
  roundRect(ctx, left - wall, top - 14, wall, bottom - top + 14, wall / 2);
  ctx.fill();
  ctx.stroke();
  // right wall
  roundRect(ctx, right, top - 14, wall, bottom - top + 14, wall / 2);
  ctx.fill();
  ctx.stroke();
  // floor
  roundRect(ctx, left - wall, bottom, right - left + wall * 2, wall, wall / 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

export function drawWarningLine(
  ctx: CanvasRenderingContext2D,
  jar: JarRect,
  y: number,
  danger: boolean,
  time: number,
): void {
  ctx.save();
  const pulse = danger ? 0.55 + 0.45 * Math.sin(time / 120) : 1;
  ctx.globalAlpha = (danger ? 0.95 : 0.55) * pulse;
  ctx.strokeStyle = danger ? '#ff5f8f' : '#f0a8c0';
  ctx.lineWidth = danger ? 3 : 2;
  ctx.setLineDash([10, 8]);
  ctx.lineDashOffset = -time / 40;
  ctx.beginPath();
  ctx.moveTo(jar.left + 4, y);
  ctx.lineTo(jar.right - 4, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

export function drawGuideLine(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number): void {
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = '#d48aa5';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 9]);
  ctx.beginPath();
  ctx.moveTo(x, y0);
  ctx.lineTo(x, y1);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Mochi drawing
// ---------------------------------------------------------------------------

export interface MochiDrawOpts {
  scaleX?: number;
  scaleY?: number;
  angle?: number;
  alpha?: number;
}

export function drawMochi(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  tier: number,
  opts: MochiDrawOpts = {},
): void {
  const def = TIERS[tier];
  const sx = opts.scaleX ?? 1;
  const sy = opts.scaleY ?? 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(opts.angle ?? 0);
  ctx.scale(sx, sy);
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;

  // Body
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.15, 0, 0, r * 1.05);
  if (tier === MAX_TIER) {
    // Rainbow mochi: dreamy multi-stop gradient
    g.addColorStop(0, '#fff0fa');
    g.addColorStop(0.35, '#ffd3ec');
    g.addColorStop(0.6, '#d9ccff');
    g.addColorStop(0.85, '#c0ecff');
    g.addColorStop(1, '#a8e0d0');
  } else {
    g.addColorStop(0, def.light);
    g.addColorStop(0.65, def.color);
    g.addColorStop(1, def.dark);
  }
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  // Soft outline
  ctx.strokeStyle = 'rgba(180, 110, 140, 0.28)';
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.stroke();

  // Glossy highlight
  ctx.save();
  ctx.globalAlpha *= 0.55;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(-r * 0.34, -r * 0.44, r * 0.3, r * 0.17, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawFace(ctx, r, def, tier === MAX_TIER);
  ctx.restore();
}

function drawFace(ctx: CanvasRenderingContext2D, r: number, def: TierDef, rainbow: boolean): void {
  const eyeY = -r * 0.08;
  const eyeDX = r * 0.36;
  const eyeR = Math.max(1.4, r * 0.095);
  const ink = '#5b3a45';

  // Blush
  ctx.save();
  ctx.globalAlpha *= 0.5;
  ctx.fillStyle = rainbow ? '#ff9ec7' : '#ff8fab';
  ctx.beginPath();
  ctx.ellipse(-r * 0.52, r * 0.2, r * 0.16, r * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(r * 0.52, r * 0.2, r * 0.16, r * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = Math.max(1.2, r * 0.05);
  ctx.lineCap = 'round';

  const drawEye = (cx: number, style: TierDef['eyes'], mirror: boolean) => {
    switch (style) {
      case 'open':
        ctx.beginPath();
        ctx.arc(cx, eyeY, eyeR, 0, Math.PI * 2);
        ctx.fill();
        // catchlight
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx - eyeR * 0.3, eyeY - eyeR * 0.3, eyeR * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      case 'happy':
        ctx.beginPath();
        ctx.arc(cx, eyeY + eyeR * 0.4, eyeR * 1.15, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
        break;
      case 'sleepy':
        ctx.beginPath();
        ctx.arc(cx, eyeY - eyeR * 0.4, eyeR * 1.15, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
        break;
      case 'sparkle': {
        // four-point star
        const s = eyeR * 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, eyeY - s);
        ctx.quadraticCurveTo(cx, eyeY, cx + s, eyeY);
        ctx.quadraticCurveTo(cx, eyeY, cx, eyeY + s);
        ctx.quadraticCurveTo(cx, eyeY, cx - s, eyeY);
        ctx.quadraticCurveTo(cx, eyeY, cx, eyeY - s);
        ctx.fill();
        break;
      }
      case 'wink':
        if (mirror) {
          // winking eye: curved lash
          ctx.beginPath();
          ctx.arc(cx, eyeY, eyeR * 1.1, Math.PI * 0.15, Math.PI * 0.85);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(cx, eyeY, eyeR, 0, Math.PI * 2);
          ctx.fill();
          ctx.save();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(cx - eyeR * 0.3, eyeY - eyeR * 0.3, eyeR * 0.35, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        break;
    }
  };

  drawEye(-eyeDX, def.eyes, false);
  drawEye(eyeDX, def.eyes, true);

  // Mouth
  const mY = r * 0.24;
  ctx.beginPath();
  switch (def.mouth) {
    case 'smile':
      ctx.arc(0, mY - r * 0.06, r * 0.16, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
      break;
    case 'tiny':
      ctx.arc(0, mY, r * 0.06, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'open': {
      ctx.save();
      ctx.fillStyle = '#8c4a5a';
      ctx.ellipse(0, mY + r * 0.04, r * 0.13, r * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff9eb0';
      ctx.ellipse(0, mY + r * 0.1, r * 0.08, r * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'cat':
      // little ω mouth
      ctx.arc(-r * 0.08, mY, r * 0.08, Math.PI * 0.1, Math.PI * 0.95);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(r * 0.08, mY, r * 0.08, Math.PI * 0.05, Math.PI * 0.9);
      ctx.stroke();
      break;
    case 'grin': {
      ctx.save();
      ctx.fillStyle = '#8c4a5a';
      ctx.beginPath();
      ctx.arc(0, mY - r * 0.02, r * 0.2, Math.PI * 0.08, Math.PI * 0.92);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-r * 0.18, mY - r * 0.04, r * 0.36, r * 0.05);
      ctx.restore();
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

export function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]): void {
  ctx.save();
  for (const p of particles) {
    const t = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = t;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.5 + 0.5 * t), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawFloatTexts(ctx: CanvasRenderingContext2D, texts: FloatText[]): void {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const t of texts) {
    const k = Math.max(0, t.life / t.maxLife);
    const rise = (1 - k) * 46;
    ctx.globalAlpha = Math.min(1, k * 1.6);
    ctx.font = `700 ${t.size}px "Baloo 2", "Comic Sans MS", system-ui, sans-serif`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeText(t.text, t.x, t.y - rise);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y - rise);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** easeOutBack — used for merge pop-in animation. */
export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
