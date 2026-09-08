// Game controller: owns the matter.js world, the fixed-timestep loop,
// input handling, merging, scoring, effects and canvas rendering.
// Modes: Classic (endless), Time Challenge (90s), Conveyor Rush (physics +
// customer belt). The legacy 'orders' mode code remains but has no UI entry.

import Matter from 'matter-js';
import { MAX_TIER, SPAWNABLE_TIERS, TIERS, tierRadius, tierPoints } from './tiers';
import { sound } from './audio';
import {
  drawBackground,
  drawJar,
  drawWarningLine,
  drawGuideLine,
  drawMochi,
  drawParticles,
  drawFloatTexts,
  easeOutBack,
  pastelParticleColor,
  type JarRect,
  type Particle,
  type FloatText,
} from './render';

export type GameMode = 'classic' | 'challenge' | 'orders' | 'conveyor';
export type GameOverReason = 'full' | 'time' | 'strikes';

export interface GameEvents {
  onScore(score: number): void;
  onNext(tier: number): void;
  onGameOver(score: number, reason: GameOverReason): void;
  onOrder?(tier: number, served: number): void;
}

export interface ConveyorCustomerView {
  id: number;
  animal: string;
  tier: number;
  xPct: number; // 0 = just entered (right), 1 = left end
  patiencePct: number; // 1 -> 0
  impatient: boolean; // last ~25% of patience
  state: 'waiting' | 'served' | 'storm';
}

export interface ConveyorView {
  customers: ConveyorCustomerView[];
  strikes: number;
  served: number;
}

interface MochiMeta {
  tier: number;
  bornAt: number;
  wobbleAt: number;
  overTime: number; // ms spent settled above the warning line
  merging?: boolean;
}

interface Customer {
  id: number;
  animal: string;
  tier: number;
  patience: number;
  patienceMax: number;
  warned: boolean; // impatience blip already played
  state: 'waiting' | 'served' | 'storm';
  stateAt: number;
}

interface HeartTrail {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  at: number;
}

type Phase = 'idle' | 'playing' | 'over';

const STEP_MS = 1000 / 60;
const OVER_LIMIT_MS = 2000;
const SETTLE_SPEED = 0.45;
const WALL = 14;

// Difficulty: warning line sits ~9% below the jar rim — generous headroom.
const WARNING_LINE_RATIO = 0.09;
// Spawn weights for tiers 0..4 — bigger spawnable tiers are rarer.
const SPAWN_WEIGHTS = [30, 26, 20, 15, 9];

// Classic tuning (also used by Conveyor Rush)
const CLASSIC_DROP_COOLDOWN_MS = 480;
const CLASSIC_COMBO_WINDOW_MS = 1500;

// Time Challenge tuning — faster cadence, more generous combos
const CHALLENGE_DROP_COOLDOWN_MS = 340;
const CHALLENGE_COMBO_WINDOW_MS = 2600;
export const CHALLENGE_DURATION_MS = 90_000;
const TICK_BELOW_MS = 5000;

// Order Up! (legacy) tuning
const ORDER_STREAK_WINDOW_MS = 20_000;
const ORDER_MAX_TIER = 9;

// Conveyor Rush tuning
const CONVEYOR_ANIMALS = ['🐻', '🐰', '🐱', '🐶', '🐸'];
const CONVEYOR_MAX_WAITING = 5;
const CONVEYOR_MAX_STRIKES = 3;
const CONVEYOR_LEAVE_MS = 700;
const CONVEYOR_MIN_TOP = 208; // jar rim always clears the DOM belt strip
const IMPATIENT_RATIO = 0.25;
const HEART_TRAIL_MS = 700;
const VIGNETTE_MS = 450;

// Revive
const CHALLENGE_REVIVE_BONUS_MS = 20_000;

function metaOf(body: Matter.Body): MochiMeta | undefined {
  return (body.plugin as { mochi?: MochiMeta }).mochi;
}

export class MochiGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private events: GameEvents;
  private engine: Matter.Engine;

  private phase: Phase = 'idle';
  private active = true; // false while a non-physics mode owns the canvas
  private raf = 0;
  private lastTime = 0;
  private acc = 0;
  private destroyed = false;

  // layout
  private cssW = 0;
  private cssH = 0;
  private jar: JarRect = { left: 0, right: 0, top: 0, bottom: 0, wall: WALL };
  private warningY = 0;
  private radiusBasis = 480; // jar width used to size mochi radii
  private walls: Matter.Body[] = [];

  // mode + tuning
  private mode: GameMode = 'classic';
  private dropCooldownMs = CLASSIC_DROP_COOLDOWN_MS;
  private comboWindowMs = CLASSIC_COMBO_WINDOW_MS;
  private timeLeft = 0; // challenge only
  private lastTickSecond = -1;

  // Order Up! (legacy) state
  private orderTier = 2;
  private ordersServed = 0;
  private serveStreak = 0;
  private lastServeAt = 0;

  // Conveyor Rush state
  private customers: Customer[] = [];
  private nextCustomerId = 1;
  private spawnTimer = 0;
  private strikes = 0;
  private conveyorServed = 0;
  private heartTrails: HeartTrail[] = [];
  private vignetteUntil = 0;

  // revive (one per run)
  private reviveUsed = false;

  // gameplay state
  private score = 0;
  private currentTier = 0;
  private nextTier = 0;
  private hasCurrent = false;
  private aimX = 0;
  private dropCooldownUntil = 0;
  private combo = 0;
  private lastMergeAt = 0;
  private maxTierReached = 0;
  private danger = false;

  // effects
  private particles: Particle[] = [];
  private floatTexts: FloatText[] = [];
  private shakeUntil = 0;
  private shakeMag = 0;

  private mergeQueue: Array<[Matter.Body, Matter.Body]> = [];

  constructor(canvas: HTMLCanvasElement, events: GameEvents) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
    this.events = events;
    this.engine = Matter.Engine.create();

    Matter.Events.on(this.engine, 'collisionStart', (e) => this.onCollision(e));

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('orientationchange', this.handleResize);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('touchmove', this.blockTouch, { passive: false });

    this.layout();
    this.aimX = this.cssW / 2;
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  start(mode: GameMode = 'classic'): void {
    sound.ensure();
    this.mode = mode;
    this.dropCooldownMs = mode === 'challenge' ? CHALLENGE_DROP_COOLDOWN_MS : CLASSIC_DROP_COOLDOWN_MS;
    this.comboWindowMs = mode === 'challenge' ? CHALLENGE_COMBO_WINDOW_MS : CLASSIC_COMBO_WINDOW_MS;
    this.timeLeft = CHALLENGE_DURATION_MS;
    this.lastTickSecond = -1;
    this.reviveUsed = false;
    this.ordersServed = 0;
    this.serveStreak = 0;
    this.lastServeAt = 0;
    this.orderTier = this.pickOrder(0);
    this.customers = [];
    this.nextCustomerId = 1;
    this.strikes = 0;
    this.conveyorServed = 0;
    this.heartTrails = [];
    this.vignetteUntil = 0;
    this.spawnTimer = mode === 'conveyor' ? 1500 : 0;
    this.resetWorld();
    this.phase = 'playing';
    if (mode === 'orders') {
      this.events.onOrder?.(this.orderTier, 0);
    }
  }

  restart(): void {
    this.start(this.mode);
  }

  /** Back to the mode-select menu: clear the jar and idle. */
  showMenu(): void {
    this.resetWorld();
    this.hasCurrent = false;
    this.phase = 'idle';
  }

  /** When false, the loop keeps time but skips sim + rendering (another
   *  controller owns the canvas). */
  setActive(b: boolean): void {
    this.active = b;
  }

  /** A revive is available once per run, only right after a game over. */
  canRevive(): boolean {
    return this.phase === 'over' && !this.reviveUsed;
  }

  /**
   * Second chance after a rewarded ad.
   * Classic: clear above the line + top ~25% largest pieces.
   * Time Challenge: +20s and clear above the line.
   * Conveyor Rush: clear above the line and reset strikes to 0.
   */
  revive(): void {
    if (!this.canRevive()) return;
    this.reviveUsed = true;
    const now = performance.now();

    const bodies = Matter.Composite.allBodies(this.engine.world).filter((b) => metaOf(b));
    const above = bodies.filter((b) => b.position.y < this.warningY);
    const rest = bodies.filter((b) => b.position.y >= this.warningY);
    const toRemove = new Set<Matter.Body>(above);

    if (this.mode !== 'challenge' && this.mode !== 'conveyor') {
      const bySize = [...rest].sort(
        (a, b) => (metaOf(b)?.tier ?? 0) - (metaOf(a)?.tier ?? 0),
      );
      const n = Math.ceil(bySize.length * 0.25);
      for (let i = 0; i < n; i++) toRemove.add(bySize[i]);
    }

    for (const b of toRemove) {
      this.burst(b.position.x, b.position.y, 10, 4);
      Matter.Composite.remove(this.engine.world, b);
    }

    if (this.mode === 'challenge') {
      this.timeLeft += CHALLENGE_REVIVE_BONUS_MS;
      this.lastTickSecond = -1; // re-arm the final-seconds ticking
      this.floatTexts.push({
        x: this.cssW / 2,
        y: this.jar.top + 60,
        text: '+20s!',
        life: 1200,
        maxLife: 1200,
        color: '#8b6ad8',
        size: 30,
      });
    }
    if (this.mode === 'conveyor') {
      this.strikes = 0;
    }

    this.mergeQueue = [];
    this.danger = false;
    this.shakeUntil = now + 350;
    this.shakeMag = 5;
    sound.fanfare();
    this.phase = 'playing';
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('orientationchange', this.handleResize);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('touchmove', this.blockTouch);
    Matter.Events.off(this.engine, 'collisionStart');
    Matter.Engine.clear(this.engine);
  }

  getScore(): number {
    return this.score;
  }

  getMode(): GameMode {
    return this.mode;
  }

  /** Remaining time in ms (Time Challenge). */
  getTimeLeft(): number {
    return Math.max(0, this.timeLeft);
  }

  getOrdersServed(): number {
    return this.ordersServed;
  }

  /** Snapshot for the Conveyor Rush DOM belt (polled by the component). */
  getConveyorState(): ConveyorView {
    return {
      strikes: this.strikes,
      served: this.conveyorServed,
      customers: this.customers.map((c) => ({
        id: c.id,
        animal: c.animal,
        tier: c.tier,
        xPct: 1 - c.patience / c.patienceMax,
        patiencePct: Math.max(0, c.patience / c.patienceMax),
        impatient: c.state === 'waiting' && c.patience / c.patienceMax <= IMPATIENT_RATIO,
        state: c.state,
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Layout / resize
  // -------------------------------------------------------------------------

  private handleResize = (): void => {
    this.layout();
    this.rebuildWalls();
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

    const jarW = Math.min(this.cssW - 20, 480);
    const left = (this.cssW - jarW) / 2;
    const baseTop = Math.max(108, this.cssH * 0.15);
    // Conveyor Rush reserves a fixed strip for the DOM belt so it never
    // overlaps the jar rim, even on short screens.
    const top = this.mode === 'conveyor' ? Math.max(baseTop, CONVEYOR_MIN_TOP) : baseTop;
    const bottom = this.cssH - 14;
    this.jar = { left, right: left + jarW, top, bottom: Math.max(bottom, top + 320), wall: WALL };
    this.warningY = top + (this.jar.bottom - top) * WARNING_LINE_RATIO;
    this.aimX = Math.min(Math.max(this.aimX, this.jar.left), this.jar.right);
  }

  private rebuildWalls(): void {
    for (const w of this.walls) Matter.Composite.remove(this.engine.world, w);
    this.walls = [];
    const { left, right, top, bottom, wall } = this.jar;
    const opts: Matter.IChamferableBodyDefinition = {
      isStatic: true,
      friction: 0.4,
      restitution: 0.1,
      label: 'wall',
    };
    const midY = (top + bottom) / 2;
    const wallH = bottom - top + 200; // extend above the rim so pieces can't escape sideways
    const lw = Matter.Bodies.rectangle(left - wall / 2, midY - 100, wall, wallH, opts);
    const rw = Matter.Bodies.rectangle(right + wall / 2, midY - 100, wall, wallH, opts);
    const floor = Matter.Bodies.rectangle((left + right) / 2, bottom + wall / 2, right - left + wall * 2, wall, opts);
    this.walls = [lw, rw, floor];
    Matter.Composite.add(this.engine.world, this.walls);

    // Keep existing pieces inside the new bounds.
    for (const body of Matter.Composite.allBodies(this.engine.world)) {
      const m = metaOf(body);
      if (!m) continue;
      const r = tierRadius(m.tier, this.radiusBasis);
      const x = Math.min(Math.max(body.position.x, left + r * 0.5), right - r * 0.5);
      if (x !== body.position.x) Matter.Body.setPosition(body, { x, y: body.position.y });
    }
  }

  // -------------------------------------------------------------------------
  // Game flow
  // -------------------------------------------------------------------------

  private resetWorld(): void {
    Matter.Composite.clear(this.engine.world, false, true);
    this.mergeQueue = [];
    this.particles = [];
    this.floatTexts = [];
    this.score = 0;
    this.combo = 0;
    this.maxTierReached = 0;
    this.danger = false;
    this.shakeUntil = 0;
    this.layout();
    this.radiusBasis = this.jar.right - this.jar.left;
    this.rebuildWalls();
    this.currentTier = this.randomSpawnTier();
    this.nextTier = this.randomSpawnTier();
    this.hasCurrent = true;
    this.dropCooldownUntil = 0;
    this.events.onScore(0);
    this.events.onNext(this.nextTier);
  }

  /** Weighted spawn: the bigger spawnable tiers show up less often. */
  private randomSpawnTier(): number {
    const total = SPAWN_WEIGHTS.reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < Math.min(SPAWNABLE_TIERS, SPAWN_WEIGHTS.length); i++) {
      roll -= SPAWN_WEIGHTS[i];
      if (roll < 0) return i;
    }
    return 0;
  }

  /** Order progression (legacy Order Up! mode). */
  private pickOrder(servedCount: number): number {
    return Math.min(2 + Math.floor(servedCount * 0.7), ORDER_MAX_TIER);
  }

  private gameOver(reason: GameOverReason): void {
    if (this.phase !== 'playing') return;
    this.phase = 'over';
    this.mergeQueue = []; // drop stale pairs so a revive can't process them
    if (reason === 'time') {
      sound.timeUp();
    } else {
      sound.gameOver();
    }
    this.events.onGameOver(this.score, reason);
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  private blockTouch = (e: TouchEvent): void => {
    e.preventDefault();
  };

  private pointerX(e: PointerEvent): number {
    const rect = this.canvas.getBoundingClientRect();
    return e.clientX - rect.left;
  }

  private handlePointerMove = (e: PointerEvent): void => {
    this.aimX = this.pointerX(e);
  };

  private handlePointerDown = (e: PointerEvent): void => {
    sound.ensure();
    this.aimX = this.pointerX(e);
  };

  private handlePointerUp = (e: PointerEvent): void => {
    this.aimX = this.pointerX(e);
    this.drop();
  };

  private drop(): void {
    if (this.phase !== 'playing' || !this.hasCurrent) return;
    const now = performance.now();
    const r = tierRadius(this.currentTier, this.radiusBasis);
    const x = Math.min(Math.max(this.aimX, this.jar.left + r + 1), this.jar.right - r - 1);
    const y = this.jar.top - r - 12;
    const body = Matter.Bodies.circle(x, y, r, {
      restitution: 0.2,
      friction: 0.35,
      frictionStatic: 0.6,
      density: 0.0016,
      label: 'mochi',
    });
    (body.plugin as { mochi?: MochiMeta }).mochi = {
      tier: this.currentTier,
      bornAt: now,
      wobbleAt: 0,
      overTime: 0,
    };
    Matter.Composite.add(this.engine.world, body);
    sound.plop();
    this.hasCurrent = false;
    this.dropCooldownUntil = now + this.dropCooldownMs;
  }

  // -------------------------------------------------------------------------
  // Collisions & merging
  // -------------------------------------------------------------------------

  private onCollision(e: Matter.IEventCollision<Matter.Engine>): void {
    if (this.phase !== 'playing') return;
    const now = performance.now();
    for (const pair of e.pairs) {
      const a = pair.bodyA;
      const b = pair.bodyB;
      const ma = metaOf(a);
      const mb = metaOf(b);
      // landing wobble
      const impact = Math.hypot(
        a.velocity.x - b.velocity.x,
        a.velocity.y - b.velocity.y,
      );
      if (impact > 2.2) {
        if (ma) ma.wobbleAt = now;
        if (mb) mb.wobbleAt = now;
      }
      if (!ma || !mb) continue;
      if (ma.merging || mb.merging) continue;
      if (ma.tier !== mb.tier) continue;
      ma.merging = true;
      mb.merging = true;
      this.mergeQueue.push([a, b]);
    }
  }

  private processMerges(): void {
    const queue = this.mergeQueue;
    this.mergeQueue = [];
    const now = performance.now();

    for (const [a, b] of queue) {
      const ma = metaOf(a);
      const mb = metaOf(b);
      if (!ma || !mb) continue;
      const tier = ma.tier;
      const mx = (a.position.x + b.position.x) / 2;
      const my = (a.position.y + b.position.y) / 2;
      Matter.Composite.remove(this.engine.world, a);
      Matter.Composite.remove(this.engine.world, b);

      const created = tier + 1;
      if (created <= MAX_TIER) {
        const nr = tierRadius(created, this.radiusBasis);
        const cx = Math.min(Math.max(mx, this.jar.left + nr), this.jar.right - nr);
        const nb = Matter.Bodies.circle(cx, my, nr, {
          restitution: 0.2,
          friction: 0.35,
          frictionStatic: 0.6,
          density: 0.0016,
          label: 'mochi',
        });
        (nb.plugin as { mochi?: MochiMeta }).mochi = {
          tier: created,
          bornAt: now,
          wobbleAt: now,
          overTime: 0,
        };
        Matter.Composite.add(this.engine.world, nb);
      }

      // scoring + combo
      if (now - this.lastMergeAt < this.comboWindowMs) {
        this.combo += 1;
      } else {
        this.combo = 1;
      }
      this.lastMergeAt = now;
      const base = tierPoints(Math.min(created, MAX_TIER)) + (created > MAX_TIER ? 200 : 0);
      // Classic/Conveyor: flat +10 per combo step. Time Challenge: x2, x3, ...
      const gained =
        this.mode === 'challenge' ? base * this.combo : base + (this.combo - 1) * 10;
      this.score += gained;
      this.events.onScore(this.score);

      this.floatTexts.push({
        x: mx,
        y: my - 10,
        text: this.combo > 1 ? `+${gained}  x${this.combo}` : `+${gained}`,
        life: 900,
        maxLife: 900,
        color: this.combo > 1 ? '#ff5f8f' : '#c86a8d',
        size: this.combo > 1 ? 26 : 20,
      });

      this.burst(mx, my, created >= 7 ? 22 : 12, created >= 7 ? 5.5 : 3.6);
      sound.pop(created);
      if (navigator.vibrate) navigator.vibrate(10);

      if (created >= 7) {
        this.shakeUntil = now + 320;
        this.shakeMag = 6;
      }

      if (created <= MAX_TIER && created > this.maxTierReached) {
        this.maxTierReached = created;
        if (created >= 3) {
          sound.fanfare();
          this.confetti(mx, my);
          this.floatTexts.push({
            x: this.cssW / 2,
            y: this.jar.top + 40,
            text: `New: ${TIERS[created].name}!`,
            life: 1400,
            maxLife: 1400,
            color: '#b06ad8',
            size: 24,
          });
        }
      }

      // Order Up! (legacy): serving a customer order
      if (this.mode === 'orders' && created === this.orderTier) {
        this.serveOrder(mx, my, created, now);
      }

      // Conveyor Rush: auto-serve the longest-waiting customer wanting this tier
      if (this.mode === 'conveyor') {
        this.tryServeConveyor(created, mx, my, now);
      }
    }
  }

  private serveOrder(mx: number, my: number, tier: number, now: number): void {
    this.ordersServed += 1;
    if (now - this.lastServeAt < ORDER_STREAK_WINDOW_MS) {
      this.serveStreak += 1;
    } else {
      this.serveStreak = 1;
    }
    this.lastServeAt = now;

    const servePts = tierPoints(tier) * 5 * this.serveStreak;
    this.score += servePts;
    this.events.onScore(this.score);

    sound.serve();
    this.confetti(mx, my);
    this.floatTexts.push({
      x: this.cssW / 2,
      y: this.jar.top + 70,
      text:
        this.serveStreak > 1
          ? `Speedy Service x${this.serveStreak}! +${servePts}`
          : `Order served! +${servePts}`,
      life: 1500,
      maxLife: 1500,
      color: '#3aa87c',
      size: 24,
    });

    this.orderTier = this.pickOrder(this.ordersServed);
    this.events.onOrder?.(this.orderTier, this.ordersServed);
  }

  // -------------------------------------------------------------------------
  // Conveyor Rush
  // -------------------------------------------------------------------------

  private spawnIntervalMs(): number {
    return Math.max(7000 - this.conveyorServed * 250, 2800);
  }

  private patienceMs(): number {
    return Math.max(24000 - this.conveyorServed * 300, 14000);
  }

  private spawnCustomer(now: number): void {
    const tier = Math.min(
      1 + Math.floor(this.conveyorServed / 4) + (Math.random() < 0.5 ? 0 : 1),
      8,
    );
    const p = this.patienceMs();
    this.customers.push({
      id: this.nextCustomerId++,
      animal: CONVEYOR_ANIMALS[Math.floor(Math.random() * CONVEYOR_ANIMALS.length)],
      tier,
      patience: p,
      patienceMax: p,
      warned: false,
      state: 'waiting',
      stateAt: now,
    });
  }

  private updateConveyor(dt: number): void {
    const now = performance.now();
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      const waiting = this.customers.filter((c) => c.state === 'waiting').length;
      if (waiting < CONVEYOR_MAX_WAITING) this.spawnCustomer(now);
      this.spawnTimer = this.spawnIntervalMs();
    }

    for (const c of this.customers) {
      if (c.state !== 'waiting') continue;
      c.patience -= dt;

      // impatience warning — one soft blip per customer
      if (!c.warned && c.patience > 0 && c.patience / c.patienceMax <= IMPATIENT_RATIO) {
        c.warned = true;
        sound.warn();
      }

      if (c.patience <= 0) {
        c.patience = 0;
        c.state = 'storm';
        c.stateAt = now;
        this.strikes += 1;
        this.vignetteUntil = now + VIGNETTE_MS;
        sound.angry();
        this.floatTexts.push({
          x: this.cssW * 0.18,
          y: this.jar.top - 30,
          text: '💢 +1 strike',
          life: 1100,
          maxLife: 1100,
          color: '#e05555',
          size: 18,
        });
        if (this.strikes >= CONVEYOR_MAX_STRIKES) {
          this.gameOver('strikes');
          return;
        }
      }
    }

    this.customers = this.customers.filter(
      (c) => c.state === 'waiting' || now - c.stateAt < CONVEYOR_LEAVE_MS,
    );
  }

  private tryServeConveyor(tier: number, mx: number, my: number, now: number): void {
    const candidate = this.customers
      .filter((c) => c.state === 'waiting' && c.tier === tier)
      .sort((a, b) => a.patience - b.patience)[0];
    if (!candidate) return;

    candidate.state = 'served';
    candidate.stateAt = now;
    this.conveyorServed += 1;

    const tip = Math.round((candidate.patience / candidate.patienceMax) * tierPoints(tier) * 2);
    const pts = tierPoints(tier) * 3 + tip;
    this.score += pts;
    this.events.onScore(this.score);

    sound.serve();
    const xPct = 1 - candidate.patience / candidate.patienceMax;
    const cx = this.cssW * (0.06 + 0.88 * (1 - xPct));
    const cy = this.jar.top - 56;

    // heart trail arcing from the merge point up to the customer
    this.heartTrails.push({ x0: mx, y0: my, x1: cx, y1: cy, at: now });
    this.confetti(cx, cy);

    this.floatTexts.push({
      x: cx,
      y: cy - 14,
      text: `+${pts}`,
      life: 1200,
      maxLife: 1200,
      color: '#3aa87c',
      size: 24,
    });
    if (tip > 0) {
      this.floatTexts.push({
        x: cx,
        y: cy + 10,
        text: `tip +${tip}`,
        life: 1100,
        maxLife: 1100,
        color: '#9ec76f',
        size: 14,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------

  private burst(x: number, y: number, count: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const v = speed * (0.5 + Math.random() * 0.8);
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * v,
        vy: Math.sin(ang) * v - 1.5,
        life: 550 + Math.random() * 250,
        maxLife: 800,
        size: 2.5 + Math.random() * 3.5,
        color: pastelParticleColor(i),
        gravity: 0.12,
      });
    }
  }

  private confetti(x: number, y: number): void {
    for (let i = 0; i < 46; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const v = 4 + Math.random() * 6;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * v,
        vy: Math.sin(ang) * v,
        life: 1100 + Math.random() * 600,
        maxLife: 1700,
        size: 3 + Math.random() * 4,
        color: pastelParticleColor(i),
        gravity: 0.16,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Fixed-timestep loop
  // -------------------------------------------------------------------------

  private loop = (now: number): void => {
    if (this.destroyed) return;
    if (!this.active) {
      this.lastTime = now;
      this.raf = requestAnimationFrame(this.loop);
      return;
    }
    const frameDt = Math.min(100, now - this.lastTime);
    this.lastTime = now;

    if (this.phase === 'playing') {
      this.acc += frameDt;
      if (this.acc > 200) this.acc = 200;
      while (this.acc >= STEP_MS) {
        Matter.Engine.update(this.engine, STEP_MS);
        this.afterStep(STEP_MS);
        this.acc -= STEP_MS;
      }
    }

    this.updateEffects(frameDt);
    this.render(now);
    this.raf = requestAnimationFrame(this.loop);
  };

  private afterStep(dt: number): void {
    // Time Challenge countdown — driven by the fixed timestep so it pauses
    // exactly when the simulation pauses.
    if (this.mode === 'challenge') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.gameOver('time');
        return;
      }
      if (this.timeLeft <= TICK_BELOW_MS) {
        const sec = Math.ceil(this.timeLeft / 1000);
        if (sec !== this.lastTickSecond && sec > 0) {
          this.lastTickSecond = sec;
          sound.tick();
        }
      }
    }

    this.processMerges();

    // Conveyor Rush customers
    if (this.mode === 'conveyor') {
      this.updateConveyor(dt);
      if (this.phase !== 'playing') return; // strikes may have ended the run
    }

    // spawn the next hanging piece after the drop cooldown
    if (!this.hasCurrent && performance.now() >= this.dropCooldownUntil) {
      this.currentTier = this.nextTier;
      this.nextTier = this.randomSpawnTier();
      this.hasCurrent = true;
      this.events.onNext(this.nextTier);
    }

    let danger = false;
    for (const body of Matter.Composite.allBodies(this.engine.world)) {
      const m = metaOf(body);
      if (!m) continue;

      // velocity cap — prevents tunnelling through the floor
      if (body.speed > 26) {
        const k = 26 / body.speed;
        Matter.Body.setVelocity(body, { x: body.velocity.x * k, y: body.velocity.y * k });
      }

      const above = body.position.y < this.warningY;
      if (above) {
        danger = true;
        if (body.speed < SETTLE_SPEED) {
          m.overTime += dt;
          if (m.overTime > OVER_LIMIT_MS) {
            this.gameOver('full');
            return;
          }
        } else {
          m.overTime = 0;
        }
      } else {
        m.overTime = 0;
      }
    }
    this.danger = danger;
  }

  private updateEffects(dt: number): void {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * (dt / 16.6);
      p.y += p.vy * (dt / 16.6);
      p.vy += p.gravity * (dt / 16.6);
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const t of this.floatTexts) t.life -= dt;
    this.floatTexts = this.floatTexts.filter((t) => t.life > 0);
    const now = performance.now();
    this.heartTrails = this.heartTrails.filter((h) => now - h.at < HEART_TRAIL_MS);
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  private render(now: number): void {
    const ctx = this.ctx;
    ctx.save();

    // screen shake
    if (now < this.shakeUntil) {
      const k = (this.shakeUntil - now) / 320;
      const mag = this.shakeMag * k;
      ctx.translate((Math.random() - 0.5) * mag * 2, (Math.random() - 0.5) * mag * 2);
    }

    drawBackground(ctx, this.cssW, this.cssH, now);
    drawJar(ctx, this.jar);
    drawWarningLine(ctx, this.jar, this.warningY, this.danger, now);

    // hanging piece + guide line
    if (this.phase === 'playing' && this.hasCurrent) {
      const r = tierRadius(this.currentTier, this.radiusBasis);
      const x = Math.min(Math.max(this.aimX, this.jar.left + r + 1), this.jar.right - r - 1);
      const y = this.jar.top - r - 12;
      drawGuideLine(ctx, x, y + r + 4, this.jar.bottom - 4);
      const bob = Math.sin(now / 600) * 2;
      drawMochi(ctx, x, y + bob, r, this.currentTier);
    }

    // bodies
    for (const body of Matter.Composite.allBodies(this.engine.world)) {
      const m = metaOf(body);
      if (!m) continue;
      const r = tierRadius(m.tier, this.radiusBasis);

      // pop-in scale
      const popT = Math.min(1, (now - m.bornAt) / 260);
      const pop = popT < 1 ? easeOutBack(popT) : 1;

      // landing wobble (squash & stretch)
      let sx = 1;
      let sy = 1;
      const wt = now - m.wobbleAt;
      if (m.wobbleAt > 0 && wt < 380) {
        const decay = 1 - wt / 380;
        const squash = 0.2 * decay * Math.cos(wt / 38);
        sx = 1 + squash;
        sy = 1 - squash;
      }

      drawMochi(ctx, body.position.x, body.position.y, r, m.tier, {
        scaleX: sx * pop,
        scaleY: sy * pop,
        angle: body.angle,
      });
    }

    // heart trails (Conveyor Rush serve juice)
    this.drawHeartTrails(ctx, now);

    drawParticles(ctx, this.particles);
    drawFloatTexts(ctx, this.floatTexts);

    // red vignette flash on strike
    if (now < this.vignetteUntil) {
      const k = (this.vignetteUntil - now) / VIGNETTE_MS;
      const g = ctx.createRadialGradient(
        this.cssW / 2, this.cssH / 2, Math.min(this.cssW, this.cssH) * 0.35,
        this.cssW / 2, this.cssH / 2, Math.max(this.cssW, this.cssH) * 0.75,
      );
      g.addColorStop(0, 'rgba(255,60,80,0)');
      g.addColorStop(1, `rgba(255,60,80,${(0.4 * k).toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.cssW, this.cssH);
    }

    ctx.restore();
  }

  private drawHeartTrails(ctx: CanvasRenderingContext2D, now: number): void {
    if (this.heartTrails.length === 0) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const h of this.heartTrails) {
      const k = (now - h.at) / HEART_TRAIL_MS;
      // control point arcs above the straight line
      const cpx = (h.x0 + h.x1) / 2;
      const cpy = Math.min(h.y0, h.y1) - 70;
      for (let i = 0; i < 4; i++) {
        const ki = k * 1.5 - i * 0.14;
        if (ki <= 0 || ki >= 1) continue;
        const u = 1 - ki;
        const x = u * u * h.x0 + 2 * u * ki * cpx + ki * ki * h.x1;
        const y = u * u * h.y0 + 2 * u * ki * cpy + ki * ki * h.y1;
        ctx.globalAlpha = Math.min(1, (1 - ki) * 1.6);
        ctx.font = `${13 + i * 2}px system-ui`;
        ctx.fillText(i % 2 === 0 ? '💕' : '❤️', x, y);
      }
    }
    ctx.restore();
  }
}
