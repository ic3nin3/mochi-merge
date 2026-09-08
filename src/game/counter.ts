// Counter Service — a calm, physics-free plate puzzle.
// 5 plates on a wooden café counter; tap a plate to stack the current mochi,
// matching tops merge and cascade; tap a ticket to serve a matching plate-top.
// No matter.js world is used in this mode.

import { MAX_TIER, TIERS, tierPoints } from './tiers';
import { sound } from './audio';
import {
  drawBackground,
  drawMochi,
  drawParticles,
  drawFloatTexts,
  roundRect,
  easeOutBack,
  pastelParticleColor,
  type Particle,
  type FloatText,
} from './render';

export interface CounterEvents {
  onScore(score: number): void;
  onNext(tier: number): void;
  onGameOver(score: number): void;
}

interface Ticket {
  id: number;
  animal: string;
  tier: number;
  shakeAt: number;
}

interface SlotAnim {
  plate: number;
  slot: number;
  at: number;
  kind: 'place' | 'merge';
}

interface ServeAnim {
  plate: number;
  tier: number;
  at: number;
}

type Phase = 'idle' | 'playing' | 'over';

const PLATE_COUNT = 5;
const PLATE_CAP = 5;
const TICKET_COUNT = 3;
const SPAWN_WEIGHTS = [34, 28, 22, 16]; // tiers 0..3, weighted small
const ANIMALS = ['🐻', '🐰', '🐱', '🐶', '🐸'];
const RADIUS_FACTOR = 0.75; // counter mochi are drawn smaller than jar mochi

export class CounterGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private events: CounterEvents;

  private phase: Phase = 'idle';
  private active = false;
  private raf = 0;
  private destroyed = false;

  private cssW = 0;
  private cssH = 0;

  // game state
  private plates: number[][] = [];
  private current = 0;
  private tickets: Ticket[] = [];
  private nextTicketId = 1;
  private score = 0;
  private reviveUsed = false;
  private hasServed = false; // hides the "tap to serve" microcopy

  // animations & effects
  private slotAnims: SlotAnim[] = [];
  private serveAnims: ServeAnim[] = [];
  private plateShakeAt: number[] = new Array(PLATE_COUNT).fill(0);
  private particles: Particle[] = [];
  private floatTexts: FloatText[] = [];
  private lastFrame = 0;

  constructor(canvas: HTMLCanvasElement, events: CounterEvents) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
    this.events = events;

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('orientationchange', this.handleResize);
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('touchmove', this.blockTouch, { passive: false });

    this.layout();
    this.raf = requestAnimationFrame(this.loop);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  start(): void {
    sound.ensure();
    this.layout();
    this.plates = Array.from({ length: PLATE_COUNT }, () => []);
    this.tickets = [];
    this.nextTicketId = 1;
    for (let i = 0; i < TICKET_COUNT; i++) this.tickets.push(this.makeTicket());
    this.score = 0;
    this.reviveUsed = false;
    this.hasServed = false;
    this.slotAnims = [];
    this.serveAnims = [];
    this.plateShakeAt = new Array(PLATE_COUNT).fill(0);
    this.particles = [];
    this.floatTexts = [];
    this.current = this.spawnPiece();
    this.phase = 'playing';
    this.active = true;
    this.events.onScore(0);
    this.events.onNext(this.current);
  }

  /** Stop rendering/handling input (another controller owns the canvas). */
  showMenu(): void {
    this.phase = 'idle';
    this.active = false;
  }

  canRevive(): boolean {
    return this.phase === 'over' && !this.reviveUsed;
  }

  /** Revive: the fullest plate is cleared with a sparkle sweep. */
  revive(): void {
    if (!this.canRevive()) return;
    this.reviveUsed = true;
    let fullest = 0;
    for (let i = 1; i < PLATE_COUNT; i++) {
      if (this.plates[i].length > this.plates[fullest].length) fullest = i;
    }
    const positions = this.slotPositions(fullest);
    for (const pos of positions) this.sparkle(pos.x, pos.y, 8);
    this.plates[fullest] = [];
    sound.fanfare();
    this.phase = 'playing';
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('orientationchange', this.handleResize);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('touchmove', this.blockTouch);
  }

  getScore(): number {
    return this.score;
  }

  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------

  private handleResize = (): void => {
    this.layout();
  };

  private layout(): void {
    const parent = this.canvas.parentElement;
    const w = parent ? parent.clientWidth : window.innerWidth;
    const h = parent ? parent.clientHeight : window.innerHeight;
    this.cssW = Math.max(280, w);
    this.cssH = Math.max(420, h);

    const dpr = Math.min(3, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.cssW * dpr);
    this.canvas.height = Math.round(this.cssH * dpr);
    this.canvas.style.width = `${this.cssW}px`;
    this.canvas.style.height = `${this.cssH}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private scale(): number {
    return this.cssW / 480;
  }

  private radius(tier: number): number {
    return TIERS[tier].radius * this.scale() * RADIUS_FACTOR;
  }

  private counterY(): number {
    return this.cssH * 0.6;
  }

  private plateX(i: number): number {
    return (this.cssW * (i + 0.5)) / PLATE_COUNT;
  }

  private plateY(): number {
    return this.counterY() + 52 * this.scale();
  }

  /** Center positions of each stacked mochi on a plate (bottom-up). */
  private slotPositions(plate: number): Array<{ x: number; y: number }> {
    const out: Array<{ x: number; y: number }> = [];
    let y = this.plateY() - 8;
    for (const tier of this.plates[plate]) {
      const r = this.radius(tier);
      y -= r;
      out.push({ x: this.plateX(plate), y });
      y -= r * 0.55;
    }
    return out;
  }

  private ticketRects(): Array<{ x: number; y: number; w: number; h: number }> {
    const gap = 10;
    const w = Math.min(110, (this.cssW - 24 - gap * (TICKET_COUNT - 1)) / TICKET_COUNT);
    const h = 74;
    const totalW = w * TICKET_COUNT + gap * (TICKET_COUNT - 1);
    const x0 = (this.cssW - totalW) / 2;
    const y = 112;
    return this.tickets.map((_, i) => ({ x: x0 + i * (w + gap), y, w, h }));
  }

  // -------------------------------------------------------------------------
  // Game logic
  // -------------------------------------------------------------------------

  private spawnPiece(): number {
    const total = SPAWN_WEIGHTS.reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < SPAWN_WEIGHTS.length; i++) {
      roll -= SPAWN_WEIGHTS[i];
      if (roll < 0) return i;
    }
    return 0;
  }

  private makeTicket(): Ticket {
    // Half the time, ask for a tier that's already on a plate top (keeps the
    // game flowing); otherwise a random low-mid tier.
    const tops = this.plates
      .filter((s) => s.length > 0)
      .map((s) => s[s.length - 1]);
    let tier: number;
    if (tops.length > 0 && Math.random() < 0.5) {
      tier = tops[Math.floor(Math.random() * tops.length)];
    } else {
      tier = 1 + Math.floor(Math.random() * 4); // tiers 1..4
    }
    return {
      id: this.nextTicketId++,
      animal: ANIMALS[Math.floor(Math.random() * ANIMALS.length)],
      tier,
      shakeAt: 0,
    };
  }

  private place(plate: number): void {
    const now = performance.now();
    const stack = this.plates[plate];
    if (stack.length >= PLATE_CAP) {
      this.plateShakeAt[plate] = now;
      sound.thunk();
      return;
    }

    stack.push(this.current);
    this.slotAnims.push({ plate, slot: stack.length - 1, at: now, kind: 'place' });
    sound.plop();

    // cascade merges upward
    while (stack.length >= 2 && stack[stack.length - 1] === stack[stack.length - 2]) {
      const t = stack.pop()!;
      stack.pop();
      const pos = this.slotPositions(plate)[stack.length] ?? {
        x: this.plateX(plate),
        y: this.plateY() - 40,
      };
      if (t >= MAX_TIER) {
        this.score += 200;
        this.sparkle(pos.x, pos.y, 18);
        this.floatText(pos.x, pos.y - 20, '+200', '#b06ad8', 22);
      } else {
        stack.push(t + 1);
        this.slotAnims.push({ plate, slot: stack.length - 1, at: now, kind: 'merge' });
        const pts = tierPoints(t + 1);
        this.score += pts;
        this.sparkle(pos.x, pos.y, 10);
        this.floatText(pos.x, pos.y - 20, `+${pts}`, '#c86a8d', 18);
        sound.pop(t + 1);
      }
      this.events.onScore(this.score);
    }

    this.current = this.spawnPiece();
    this.events.onNext(this.current);

    // game over: no legal moves left
    if (this.plates.every((s) => s.length >= PLATE_CAP)) {
      this.phase = 'over';
      sound.gameOver();
      this.events.onGameOver(this.score);
    }
  }

  private serveTicket(ticketId: number): void {
    const now = performance.now();
    const idx = this.tickets.findIndex((t) => t.id === ticketId);
    if (idx === -1) return;
    const ticket = this.tickets[idx];

    const plate = this.plates.findIndex((s) => s.length > 0 && s[s.length - 1] === ticket.tier);
    if (plate === -1) {
      ticket.shakeAt = now;
      sound.thunk();
      return;
    }

    this.plates[plate].pop();
    this.hasServed = true;
    this.serveAnims.push({ plate, tier: ticket.tier, at: now });
    const pts = tierPoints(ticket.tier) * 4;
    this.score += pts;
    this.events.onScore(this.score);
    sound.serve();
    const pos = this.slotPositions(plate);
    const top = pos[pos.length - 1] ?? { x: this.plateX(plate), y: this.plateY() - 20 };
    this.sparkle(top.x, top.y, 14);
    this.floatText(top.x, top.y - 24, `Served! +${pts}`, '#3aa87c', 20);

    this.tickets[idx] = this.makeTicket();
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  private blockTouch = (e: TouchEvent): void => {
    e.preventDefault();
  };

  private handlePointerDown = (e: PointerEvent): void => {
    if (!this.active || this.phase !== 'playing') return;
    sound.ensure();
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // tickets first
    const rects = this.ticketRects();
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        this.serveTicket(this.tickets[i].id);
        return;
      }
    }

    // plates
    const plateW = this.cssW / PLATE_COUNT;
    const plate = Math.min(PLATE_COUNT - 1, Math.max(0, Math.floor(x / plateW)));
    this.place(plate);
  };

  // -------------------------------------------------------------------------
  // Effects helpers
  // -------------------------------------------------------------------------

  private sparkle(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const v = 2 + Math.random() * 3;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * v,
        vy: Math.sin(ang) * v - 1.5,
        life: 500 + Math.random() * 300,
        maxLife: 800,
        size: 2.5 + Math.random() * 3,
        color: pastelParticleColor(i),
        gravity: 0.1,
      });
    }
  }

  private floatText(x: number, y: number, text: string, color: string, size: number): void {
    this.floatTexts.push({ x, y, text, life: 900, maxLife: 900, color, size });
  }

  // -------------------------------------------------------------------------
  // Loop & rendering
  // -------------------------------------------------------------------------

  private loop = (now: number): void => {
    if (this.destroyed) return;
    if (this.active) {
      const dt = Math.min(100, now - this.lastFrame);
      this.lastFrame = now;
      for (const p of this.particles) {
        p.life -= dt;
        p.x += p.vx * (dt / 16.6);
        p.y += p.vy * (dt / 16.6);
        p.vy += p.gravity * (dt / 16.6);
      }
      this.particles = this.particles.filter((p) => p.life > 0);
      for (const t of this.floatTexts) t.life -= dt;
      this.floatTexts = this.floatTexts.filter((t) => t.life > 0);
      this.slotAnims = this.slotAnims.filter((a) => now - a.at < 400);
      this.serveAnims = this.serveAnims.filter((a) => now - a.at < 450);
      this.render(now);
    } else {
      this.lastFrame = now;
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  private render(now: number): void {
    const ctx = this.ctx;
    const s = this.scale();
    drawBackground(ctx, this.cssW, this.cssH, now);

    // Which tickets are servable right now, and which plates match them?
    const tops = this.plates.map((st) => (st.length > 0 ? st[st.length - 1] : -1));
    const servableTickets = this.tickets.map((t) => tops.includes(t.tier));
    const glowingPlates = tops.map(
      (top) => top !== -1 && this.tickets.some((t) => t.tier === top),
    );

    this.drawTickets(ctx, now, servableTickets);
    this.drawCounter(ctx, s);

    // plates + stacks
    for (let i = 0; i < PLATE_COUNT; i++) {
      this.drawPlate(ctx, i, now, s, glowingPlates[i]);
    }

    // serve lift-off animations
    for (const a of this.serveAnims) {
      const k = (now - a.at) / 450;
      const r = this.radius(a.tier);
      const x = this.plateX(a.plate);
      const y = this.plateY() - 30 - k * 70;
      drawMochi(ctx, x, y, r, a.tier, { alpha: 1 - k, scaleX: 1 + k * 0.2, scaleY: 1 + k * 0.2 });
    }

    drawParticles(ctx, this.particles);
    drawFloatTexts(ctx, this.floatTexts);
  }

  private drawTickets(ctx: CanvasRenderingContext2D, now: number, servable: boolean[]): void {
    const rects = this.ticketRects();
    ctx.save();
    ctx.textAlign = 'center';
    for (let i = 0; i < this.tickets.length; i++) {
      const t = this.tickets[i];
      const r = rects[i];
      let dx = 0;
      const shakeT = now - t.shakeAt;
      if (t.shakeAt > 0 && shakeT < 400) {
        dx = Math.sin(shakeT / 28) * 5 * (1 - shakeT / 400);
      }
      ctx.save();
      ctx.translate(dx, 0);

      // servable glow — pulsing golden halo behind the card
      if (servable[i]) {
        const pulse = 0.45 + 0.25 * Math.sin(now / 220);
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.strokeStyle = '#ffcf4d';
        ctx.lineWidth = 5;
        roundRect(ctx, r.x - 3, r.y - 3, r.w + 6, r.h + 6, 14);
        ctx.stroke();
        ctx.restore();
      }

      // card
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.strokeStyle = 'rgba(233,160,185,0.5)';
      ctx.lineWidth = 2;
      roundRect(ctx, r.x, r.y, r.w, r.h, 12);
      ctx.fill();
      ctx.stroke();

      // pin
      ctx.font = '12px system-ui';
      ctx.fillText('📌', r.x + r.w / 2, r.y + 12);

      // animal
      ctx.font = '22px system-ui';
      ctx.fillText(t.animal, r.x + 22, r.y + 42);

      // wanted mochi
      drawMochi(ctx, r.x + r.w - 26, r.y + 34, 15, t.tier);

      // name
      ctx.font = '700 10px "Baloo 2", system-ui, sans-serif';
      ctx.fillStyle = '#c86a8d';
      ctx.fillText(TIERS[t.tier].name, r.x + r.w / 2, r.y + r.h - 8);

      // microcopy — fades away after the first successful serve
      if (!this.hasServed) {
        ctx.globalAlpha = 0.55 + 0.2 * Math.sin(now / 500);
        ctx.font = '600 9px "Baloo 2", system-ui, sans-serif';
        ctx.fillStyle = '#b0889a';
        ctx.fillText('tap to serve', r.x + r.w / 2, r.y + r.h + 12);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
    ctx.restore();
  }

  private drawCounter(ctx: CanvasRenderingContext2D, s: number): void {
    const y = this.counterY();
    ctx.save();
    const g = ctx.createLinearGradient(0, y, 0, this.cssH);
    g.addColorStop(0, '#e0aa6e');
    g.addColorStop(0.12, '#d29a5c');
    g.addColorStop(1, '#a96f3e');
    ctx.fillStyle = g;
    roundRect(ctx, -12, y, this.cssW + 24, this.cssH - y + 24, 26 * s);
    ctx.fill();

    // plank lines
    ctx.strokeStyle = 'rgba(120, 70, 30, 0.18)';
    ctx.lineWidth = 2;
    for (let i = 1; i <= 3; i++) {
      const ly = y + ((this.cssH - y) / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, ly);
      ctx.lineTo(this.cssW, ly);
      ctx.stroke();
    }
    // top edge highlight
    ctx.strokeStyle = 'rgba(255, 235, 205, 0.7)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, y + 4);
    ctx.lineTo(this.cssW, y + 4);
    ctx.stroke();
    ctx.restore();
  }

  private drawPlate(
    ctx: CanvasRenderingContext2D,
    i: number,
    now: number,
    s: number,
    servableGlow: boolean,
  ): void {
    let dx = 0;
    const shakeT = now - this.plateShakeAt[i];
    if (this.plateShakeAt[i] > 0 && shakeT < 400) {
      dx = Math.sin(shakeT / 28) * 5 * (1 - shakeT / 400);
    }

    const cx = this.plateX(i) + dx;
    const py = this.plateY();
    const plateRX = (this.cssW / PLATE_COUNT) * 0.42;
    const plateRY = 9 * s + 5;

    ctx.save();

    // servable glow ring around the plate
    if (servableGlow) {
      const pulse = 0.4 + 0.25 * Math.sin(now / 220);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = '#ffcf4d';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(cx, py, plateRX + 5, plateRY + 4, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // plate
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(233,160,185,0.6)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(cx, py, plateRX, plateRY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,220,232,0.5)';
    ctx.beginPath();
    ctx.ellipse(cx, py, plateRX * 0.62, plateRY * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();

    // stack (bottom-up)
    const stack = this.plates[i];
    let y = py - 8;
    let topY = y;
    let topR = 0;
    stack.forEach((tier, slot) => {
      const r = this.radius(tier);
      y -= r;
      let sx = 1;
      let sy = 1;
      const anim = this.slotAnims.find((a) => a.plate === i && a.slot === slot);
      if (anim) {
        const t = Math.min(1, (now - anim.at) / (anim.kind === 'merge' ? 260 : 300));
        if (anim.kind === 'merge') {
          sx = sy = easeOutBack(t);
        } else {
          const sq = Math.sin(Math.PI * t);
          sx = 1 + 0.15 * sq;
          sy = 1 - 0.22 * sq;
        }
      }
      drawMochi(ctx, cx, y, r, tier, { scaleX: sx, scaleY: sy });
      topY = y;
      topR = r;
      y -= r * 0.55;
    });

    // merge hint: placing the current piece here would merge
    if (
      this.phase === 'playing' &&
      stack.length > 0 &&
      stack.length < PLATE_CAP &&
      stack[stack.length - 1] === this.current
    ) {
      const bob = Math.sin(now / 280) * 3;
      const pulse = 0.65 + 0.35 * Math.sin(now / 200);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.font = `${Math.round(15 * s + 6)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✨', cx, topY - topR - 12 + bob);
      ctx.restore();
    }

    ctx.restore();
  }
}
