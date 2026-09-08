import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MochiGame,
  CHALLENGE_DURATION_MS,
  type GameOverReason,
  type ConveyorView,
} from '@/game/engine';
import { CounterGame } from '@/game/counter';
import {
  qualifies,
  addEntry,
  topForMode,
  getPlayerName,
  savePlayerName,
} from '@/game/leaderboard';
import { drawMochi } from '@/game/render';
import { TIERS } from '@/game/tiers';
import { sound } from '@/game/audio';
import RewardedAd from '@/components/RewardedAd';
import PremiumCheckout, { isPremium } from '@/components/PremiumCheckout';

type UIMode = 'classic' | 'challenge' | 'conveyor' | 'counter';
type Phase = 'start' | 'cafe' | 'leaders' | 'playing' | 'over';

const BEST_KEYS: Record<UIMode, string> = {
  classic: 'mochi-merge-best',
  challenge: 'mochi-merge-best-challenge',
  conveyor: 'mochi-merge-best-conveyor',
  counter: 'mochi-merge-best-counter',
};
const MUTE_KEY = 'mochi-merge-muted';
const COACH_KEY = 'mochi-merge-counter-seen';

const MODE_LABEL: Record<UIMode, string> = {
  classic: 'Classic',
  challenge: 'Time Challenge',
  conveyor: 'Conveyor Rush',
  counter: 'Counter Service',
};

const MODE_EMOJI: Record<UIMode, string> = {
  classic: '🍡',
  challenge: '⏱️',
  conveyor: '🍣',
  counter: '🍽️',
};

const MODE_GRADIENT: Record<UIMode, string> = {
  classic: 'bg-gradient-to-b from-rose-400 to-rose-500 shadow-rose-300',
  challenge: 'bg-gradient-to-b from-violet-400 to-purple-500 shadow-violet-300',
  conveyor: 'bg-gradient-to-b from-amber-400 to-orange-500 shadow-amber-300',
  counter: 'bg-gradient-to-b from-emerald-400 to-teal-500 shadow-emerald-300',
};

const LEADER_TABS: Array<{ mode: UIMode; label: string }> = [
  { mode: 'classic', label: '🍡 Classic' },
  { mode: 'challenge', label: '⏱️ Time' },
  { mode: 'conveyor', label: '🍣 Conveyor' },
  { mode: 'counter', label: '🍽️ Counter' },
];

function loadBest(mode: UIMode): number {
  const v = Number(localStorage.getItem(BEST_KEYS[mode]));
  return Number.isFinite(v) ? v : 0;
}

/** Tiny canvas that renders one mochi face. */
function MochiIcon({ tier, size = 28 }: { tier: number; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    drawMochi(ctx, size / 2, size / 2, size / 2 - 3, tier);
  }, [tier, size]);
  return <canvas ref={ref} style={{ width: size, height: size }} />;
}

/** Small canvas bubble that renders a mochi face for the "Next up" preview. */
function NextBubble({ tier }: { tier: number }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl bg-white/70 px-3 py-2 shadow-md backdrop-blur-sm">
      <span className="text-[10px] font-bold tracking-widest text-rose-400 uppercase">Next</span>
      <MochiIcon tier={tier} size={56} />
      <span className="max-w-20 truncate text-xs font-semibold text-rose-500">{TIERS[tier].name}</span>
    </div>
  );
}

/** Cute animated mochi logo for the start screen (pure CSS). */
function MochiLogo() {
  return (
    <div className="mochi-logo" aria-hidden>
      <div className="mochi-logo-face">
        <span className="mochi-logo-eye left" />
        <span className="mochi-logo-eye right" />
        <span className="mochi-logo-blush left" />
        <span className="mochi-logo-blush right" />
        <span className="mochi-logo-mouth" />
      </div>
    </div>
  );
}

function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()}`;
}

function patienceColor(pct: number): string {
  if (pct > 0.5) return '#6fd39a';
  if (pct > 0.25) return '#f5c154';
  return '#f06060';
}

function medal(i: number): string {
  return i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
}

export default function MochiMerge() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mochiRef = useRef<MochiGame | null>(null);
  const counterRef = useRef<CounterGame | null>(null);
  const modeRef = useRef<UIMode>('classic');

  const [phase, setPhase] = useState<Phase>('start');
  const [mode, setMode] = useState<UIMode>('classic');
  const [score, setScore] = useState(0);
  const [bests, setBests] = useState<Record<UIMode, number>>(() => ({
    classic: loadBest('classic'),
    challenge: loadBest('challenge'),
    conveyor: loadBest('conveyor'),
    counter: loadBest('counter'),
  }));
  const [nextTier, setNextTier] = useState(0);
  const [muted, setMuted] = useState<boolean>(() => localStorage.getItem(MUTE_KEY) === '1');
  const [finalScore, setFinalScore] = useState(0);
  const [isNewBest, setIsNewBest] = useState(false);
  const [overReason, setOverReason] = useState<GameOverReason>('full');
  const [timeLeft, setTimeLeft] = useState(CHALLENGE_DURATION_MS);
  const [belt, setBelt] = useState<ConveyorView | null>(null);
  const [reviveAvailable, setReviveAvailable] = useState(false);
  const [showAd, setShowAd] = useState(false);
  const [showCoach, setShowCoach] = useState(false);
  const [premium, setPremium] = useState<boolean>(() => isPremium());
  const [showCheckout, setShowCheckout] = useState(false);
  const [leaderTab, setLeaderTab] = useState<UIMode>('classic');
  const [canRank, setCanRank] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [savedRank, setSavedRank] = useState<number | null>(null);

  useEffect(() => {
    sound.setMuted(muted);
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  }, [muted]);

  const handleGameOver = useCallback((s: number, reason: GameOverReason, canRevive: boolean) => {
    const m = modeRef.current;
    setFinalScore(s);
    setOverReason(reason);
    setReviveAvailable(canRevive);
    setCanRank(qualifies(s, m));
    setSavedRank(null);
    setPlayerName(getPlayerName());
    setBests((prev) => {
      const nb = Math.max(prev[m], s);
      if (nb !== prev[m]) {
        localStorage.setItem(BEST_KEYS[m], String(nb));
      }
      setIsNewBest(s > prev[m] && s > 0);
      return { ...prev, [m]: nb };
    });
    setPhase('over');
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const mochi = new MochiGame(canvas, {
      onScore: (s) => setScore(s),
      onNext: (t) => setNextTier(t),
      onGameOver: (s, reason) => handleGameOver(s, reason, mochi.canRevive()),
    });
    const counter = new CounterGame(canvas, {
      onScore: (s) => setScore(s),
      onNext: (t) => setNextTier(t),
      onGameOver: (s) => handleGameOver(s, 'full', counter.canRevive()),
    });
    mochiRef.current = mochi;
    counterRef.current = counter;
    return () => {
      mochi.destroy();
      counter.destroy();
      mochiRef.current = null;
      counterRef.current = null;
    };
  }, [handleGameOver]);

  // Smooth countdown for the Time Challenge HUD — polled from the engine's
  // fixed-timestep clock so it stays in sync with the simulation.
  useEffect(() => {
    if (phase !== 'playing' || mode !== 'challenge') return;
    let raf = 0;
    const tick = () => {
      const g = mochiRef.current;
      if (g) setTimeLeft(g.getTimeLeft());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, mode]);

  // Conveyor Rush belt state — polled each frame for smooth DOM drift.
  useEffect(() => {
    if (phase !== 'playing' || mode !== 'conveyor') return;
    let raf = 0;
    const poll = () => {
      const g = mochiRef.current;
      if (g) setBelt(g.getConveyorState());
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [phase, mode]);

  const startGame = useCallback((m: UIMode) => {
    sound.ensure();
    modeRef.current = m;
    setMode(m);
    setScore(0);
    setIsNewBest(false);
    setShowAd(false);
    setReviveAvailable(false);
    setBelt(null);
    setTimeLeft(CHALLENGE_DURATION_MS);
    setShowCoach(m === 'counter' && localStorage.getItem(COACH_KEY) !== '1');
    setCanRank(false);
    setSavedRank(null);
    if (m === 'counter') {
      mochiRef.current?.showMenu();
      mochiRef.current?.setActive(false);
      counterRef.current?.start();
    } else {
      counterRef.current?.showMenu();
      mochiRef.current?.setActive(true);
      mochiRef.current?.start(m);
    }
    setPhase('playing');
  }, []);

  const backToMenu = useCallback(() => {
    setShowAd(false);
    setShowCoach(false);
    counterRef.current?.showMenu();
    mochiRef.current?.setActive(true);
    mochiRef.current?.showMenu();
    setPhase('start');
  }, []);

  const dismissCoach = useCallback(() => {
    localStorage.setItem(COACH_KEY, '1');
    setShowCoach(false);
  }, []);

  const handleReviveReward = useCallback(() => {
    setShowAd(false);
    setReviveAvailable(false);
    if (modeRef.current === 'counter') {
      counterRef.current?.revive();
    } else {
      mochiRef.current?.revive();
    }
    setPhase('playing');
  }, []);

  const saveScore = useCallback(() => {
    const name = (playerName.trim() || 'Mochi Fan').slice(0, 10);
    savePlayerName(name);
    const rank = addEntry(name, finalScore, modeRef.current);
    setSavedRank(rank);
    setCanRank(false);
  }, [playerName, finalScore]);

  const timerDanger = mode === 'challenge' && timeLeft <= 15_000;
  const strikes = belt?.strikes ?? 0;

  const overTitle =
    overReason === 'time'
      ? 'Time Up!'
      : overReason === 'strikes'
        ? 'Café Closed!'
        : mode === 'counter'
          ? "Counter's Full!"
          : 'Jar Full!';

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 overflow-hidden select-none"
      style={{
        touchAction: 'none',
        overscrollBehavior: 'none',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0" style={{ touchAction: 'none' }} />

      {/* HUD */}
      {phase === 'playing' && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between px-3 pt-3">
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => setMuted((m) => !m)}
              className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-white/70 text-xl shadow-md backdrop-blur-sm active:scale-90"
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? '🔇' : '🔊'}
            </button>
            {premium && (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100/90 text-sm shadow-md">
                👑
              </span>
            )}
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="rounded-2xl bg-white/70 px-5 py-1.5 shadow-md backdrop-blur-sm">
              <div className="text-center text-3xl font-extrabold text-rose-500 tabular-nums">{score}</div>
              <div className="text-center text-[10px] font-bold tracking-widest text-rose-300 uppercase">
                Best {bests[mode]}
              </div>
            </div>
            {mode === 'challenge' && (
              <div
                className={`w-40 rounded-2xl bg-white/70 px-4 py-1.5 shadow-md backdrop-blur-sm ${
                  timerDanger ? 'animate-pulse' : ''
                }`}
              >
                <div
                  className={`text-center text-2xl font-extrabold tabular-nums ${
                    timerDanger ? 'text-red-500' : 'text-violet-500'
                  }`}
                >
                  ⏱️ {formatClock(timeLeft)}
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-rose-100">
                  <div
                    className={`h-full rounded-full transition-[width] duration-100 ease-linear ${
                      timerDanger
                        ? 'bg-gradient-to-r from-red-400 to-rose-500'
                        : 'bg-gradient-to-r from-violet-300 to-rose-300'
                    }`}
                    style={{ width: `${(timeLeft / CHALLENGE_DURATION_MS) * 100}%` }}
                  />
                </div>
              </div>
            )}
            {mode === 'conveyor' && (
              <div
                key={strikes}
                className="flex items-center gap-1.5 rounded-full bg-white/70 px-4 py-1 text-sm shadow-md backdrop-blur-sm"
              >
                {[0, 1, 2].map((i) => (
                  <span key={i} className={i < 3 - strikes ? 'heart-alive' : 'heart-lost'}>
                    {i < 3 - strikes ? '❤️' : '🖤'}
                  </span>
                ))}
                <span className="ml-1 text-xs font-extrabold text-amber-600">
                  🍣 {belt?.served ?? 0}
                </span>
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <NextBubble tier={nextTier} />
            <button
              onClick={backToMenu}
              className="pointer-events-auto rounded-full bg-white/70 px-3.5 py-1.5 text-xs font-extrabold text-rose-400 shadow-md backdrop-blur-sm transition-transform active:scale-90"
            >
              ← Menu
            </button>
          </div>
        </div>
      )}

      {/* Conveyor Rush belt strip (DOM, polled from the engine) */}
      {phase === 'playing' && mode === 'conveyor' && belt && (
        <div className="pointer-events-none absolute inset-x-2 z-10" style={{ top: 116 }}>
          <div className="relative h-[88px] overflow-hidden rounded-2xl border-2 border-rose-200/70 bg-white/40 backdrop-blur-[1px]">
            <div className="conveyor-stripes absolute inset-x-0 bottom-1.5 h-2.5 rounded-full" />
            {belt.customers.map((c) => (
              <div
                key={c.id}
                className={`absolute bottom-2 flex w-16 flex-col items-center ${
                  c.state === 'served' ? 'customer-hop' : c.state === 'storm' ? 'customer-storm' : ''
                }`}
                style={{ left: `calc(${(1 - c.xPct) * 88 + 2}% - 32px)` }}
              >
                <div className="flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 shadow">
                  <MochiIcon tier={c.tier} size={24} />
                  <span className="max-w-14 truncate text-[10px] font-bold text-rose-500">
                    {TIERS[c.tier].name}
                  </span>
                </div>
                <div className="relative">
                  {c.impatient && c.state === 'waiting' && (
                    <span className="impatient-warn absolute -top-3 left-1/2 -translate-x-1/2 text-xs">
                      ❗
                    </span>
                  )}
                  <span className="text-[26px] leading-none">{c.animal}</span>
                </div>
                <div className="mt-1 h-1.5 w-12 overflow-hidden rounded-full bg-gray-200/80">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${c.patiencePct * 100}%`,
                      background: patienceColor(c.patiencePct),
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Counter Service first-run coach overlay (non-blocking) */}
      {phase === 'playing' && mode === 'counter' && showCoach && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-end justify-center pb-28">
          <div className="cafe-enter pointer-events-auto mx-4 w-full max-w-xs rounded-3xl bg-white/90 p-5 shadow-xl backdrop-blur-sm">
            <h3 className="text-center text-lg font-extrabold text-emerald-600">
              How to play 🍽️
            </h3>
            <div className="mt-3 flex flex-col gap-2.5 text-sm font-semibold text-gray-600">
              <p>👆 Tap a plate to place your mochi</p>
              <p>✨ Two of a kind on one plate merge!</p>
              <p>🎟️ Tap a ticket to serve it from a plate top!</p>
            </div>
            <button
              onClick={dismissCoach}
              className="mt-4 w-full rounded-full bg-gradient-to-b from-emerald-400 to-teal-500 px-6 py-2.5 text-base font-extrabold text-white shadow-md transition-transform active:scale-95"
            >
              Got it! 🍡
            </button>
          </div>
        </div>
      )}

      {/* Start screen / mode picker */}
      {phase === 'start' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gradient-to-b from-[#fff6ec]/90 to-[#ffe4ec]/90 px-6 backdrop-blur-[2px]">
          <MochiLogo />
          <h1 className="mt-5 text-5xl font-extrabold tracking-tight text-rose-500 drop-shadow-sm">
            Mochi Merge {premium && <span className="align-middle text-3xl">👑</span>}
          </h1>
          <p className="mt-2 max-w-xs text-center text-sm leading-relaxed text-rose-400">
            Drop the mochi into the jar. Two of a kind squish together into a bigger, cuter mochi!
          </p>
          <div className="mt-6 flex w-full max-w-xs flex-col gap-3">
            {(['classic', 'challenge'] as UIMode[]).map((m) => (
              <div key={m} className="flex flex-col items-center gap-1">
                <button
                  onClick={() => startGame(m)}
                  className={`w-full rounded-full px-8 py-3.5 text-lg font-extrabold text-white shadow-lg transition-transform active:scale-95 ${MODE_GRADIENT[m]}`}
                >
                  {MODE_EMOJI[m]} {MODE_LABEL[m]}
                </button>
                {bests[m] > 0 && (
                  <span className="text-xs font-semibold text-rose-300">Best: {bests[m]}</span>
                )}
              </div>
            ))}
            <div className="flex flex-col items-center gap-1">
              <button
                onClick={() => setPhase('cafe')}
                className="w-full rounded-full bg-gradient-to-b from-emerald-400 to-teal-500 px-8 py-3.5 text-lg font-extrabold text-white shadow-lg shadow-emerald-300 transition-transform active:scale-95"
              >
                🍵 Café <span className="ml-1 text-sm font-bold opacity-80">2 modes!</span>
              </button>
            </div>
          </div>
          {/* bottom icon row */}
          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={() => setPhase('leaders')}
              className="rounded-full bg-white/70 px-4 py-2 text-xs font-extrabold text-rose-400 shadow-md transition-transform active:scale-95"
            >
              🏆 Leaders
            </button>
            <button
              onClick={() => setShowCheckout(true)}
              className="rounded-full bg-white/70 px-4 py-2 text-xs font-extrabold text-amber-500 shadow-md transition-transform active:scale-95"
            >
              {premium ? '👑 Premium' : '💎 Remove Ads'}
            </button>
          </div>
        </div>
      )}

      {/* Café sub-menu */}
      {phase === 'cafe' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gradient-to-b from-[#f3fbef]/90 to-[#e2f4ec]/90 px-6 backdrop-blur-[2px]">
          <div className="cafe-enter flex w-full max-w-xs flex-col items-center">
            <div className="text-5xl">🍵</div>
            <h2 className="mt-2 text-4xl font-extrabold text-emerald-600 drop-shadow-sm">
              Mochi Café
            </h2>
            <p className="mt-2 text-center text-sm text-emerald-700/70">
              The customers are hungry! Pick your shift:
            </p>
            <div className="mt-6 flex w-full flex-col gap-3">
              {(['conveyor', 'counter'] as UIMode[]).map((m) => (
                <div key={m} className="flex flex-col items-center gap-1">
                  <button
                    onClick={() => startGame(m)}
                    className={`w-full rounded-full px-8 py-3.5 text-lg font-extrabold text-white shadow-lg transition-transform active:scale-95 ${MODE_GRADIENT[m]}`}
                  >
                    {MODE_EMOJI[m]} {MODE_LABEL[m]}
                  </button>
                  {bests[m] > 0 && (
                    <span className="text-xs font-semibold text-emerald-500/80">
                      Best: {bests[m]}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => setPhase('start')}
              className="mt-6 rounded-full bg-white/80 px-6 py-2 text-sm font-extrabold text-emerald-600 shadow-md transition-transform active:scale-95"
            >
              ← Back
            </button>
          </div>
        </div>
      )}

      {/* Leaderboard screen */}
      {phase === 'leaders' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gradient-to-b from-[#fff9ec]/90 to-[#fdf0e2]/90 px-6 backdrop-blur-[2px]">
          <div className="cafe-enter flex w-full max-w-sm flex-col items-center">
            <div className="text-5xl">🏆</div>
            <h2 className="mt-2 text-4xl font-extrabold text-amber-500 drop-shadow-sm">
              Leaders
            </h2>
            <div className="mt-4 flex w-full gap-1.5">
              {LEADER_TABS.map((t) => (
                <button
                  key={t.mode}
                  onClick={() => setLeaderTab(t.mode)}
                  className={`flex-1 rounded-full px-1 py-2 text-[11px] font-extrabold shadow-sm transition-all active:scale-95 ${
                    leaderTab === t.mode
                      ? 'bg-gradient-to-b from-amber-400 to-orange-400 text-white'
                      : 'bg-white/70 text-amber-500/70'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="mt-3 w-full rounded-3xl bg-white/85 p-4 shadow-lg">
              {topForMode(leaderTab).length === 0 ? (
                <p className="py-8 text-center text-sm font-semibold text-amber-400">
                  No scores yet — be the first! 🍡
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {topForMode(leaderTab).map((e, i) => (
                    <div
                      key={`${e.date}-${i}`}
                      className={`flex items-center gap-2 rounded-xl px-3 py-1.5 ${
                        i < 3 ? 'bg-amber-50' : ''
                      }`}
                    >
                      <span className="w-7 text-center text-sm">{medal(i)}</span>
                      <span className="max-w-28 truncate text-sm font-bold text-gray-600">
                        {e.name}
                      </span>
                      <span className="ml-auto text-sm font-extrabold text-rose-500 tabular-nums">
                        {e.score}
                      </span>
                      <span className="w-9 text-right text-[10px] font-semibold text-gray-300">
                        {formatDate(e.date)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <p className="mt-2 text-[10px] font-semibold text-amber-400/70">
              Saved on this device
            </p>
            <button
              onClick={() => setPhase('start')}
              className="mt-3 rounded-full bg-white/80 px-6 py-2 text-sm font-extrabold text-amber-500 shadow-md transition-transform active:scale-95"
            >
              ← Back
            </button>
          </div>
        </div>
      )}

      {/* Game over screen */}
      {phase === 'over' && !showAd && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#fff0f5]/80 px-6 backdrop-blur-sm">
          <div className="flex w-full max-w-xs flex-col items-center rounded-3xl bg-white/90 p-7 shadow-xl">
            <div className="text-5xl">{overReason === 'time' ? '⏱️' : MODE_EMOJI[mode]}</div>
            <div
              className={`mt-3 rounded-full px-4 py-0.5 text-xs font-bold tracking-widest uppercase ${
                mode === 'challenge'
                  ? 'bg-violet-100 text-violet-500'
                  : mode === 'conveyor'
                    ? 'bg-amber-100 text-amber-600'
                    : mode === 'counter'
                      ? 'bg-emerald-100 text-emerald-600'
                      : 'bg-rose-100 text-rose-400'
              }`}
            >
              {MODE_LABEL[mode]}
            </div>
            <h2 className="mt-2 text-3xl font-extrabold text-rose-500">{overTitle}</h2>
            {isNewBest && (
              <div className="mt-2 rounded-full bg-amber-100 px-4 py-1 text-sm font-bold text-amber-600">
                ✨ New Best! ✨
              </div>
            )}
            <div className="mt-3 text-5xl font-extrabold text-rose-500 tabular-nums">{finalScore}</div>
            <div className="mt-1 text-xs font-bold tracking-widest text-rose-300 uppercase">
              Best {bests[mode]}
              {mode === 'conveyor' && belt && ` · 🍣 ${belt.served} customers served`}
            </div>

            {/* leaderboard name entry */}
            {savedRank !== null && (
              <div className="mt-3 rounded-full bg-amber-100 px-4 py-1.5 text-sm font-extrabold text-amber-600">
                {savedRank > 0 ? `🏆 Ranked #${savedRank}!` : 'Score saved!'}
              </div>
            )}
            {canRank && savedRank === null && (
              <div className="mt-3 flex w-full items-center gap-2">
                <input
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value.slice(0, 10))}
                  placeholder="Mochi Fan"
                  maxLength={10}
                  className="min-w-0 flex-1 rounded-full border-2 border-amber-200 bg-white px-4 py-2 text-sm font-bold text-gray-600 outline-none focus:border-amber-400"
                />
                <button
                  onClick={saveScore}
                  className="shrink-0 rounded-full bg-gradient-to-b from-amber-400 to-orange-400 px-4 py-2 text-sm font-extrabold text-white shadow-md transition-transform active:scale-95"
                >
                  Save 🏆
                </button>
              </div>
            )}

            {reviveAvailable && (
              <button
                onClick={premium ? handleReviveReward : () => setShowAd(true)}
                className={`mt-4 w-full rounded-full px-8 py-3.5 text-lg font-extrabold text-white shadow-lg transition-transform active:scale-95 ${
                  premium
                    ? 'bg-gradient-to-b from-emerald-400 to-teal-500 shadow-emerald-200'
                    : 'animate-pulse bg-gradient-to-b from-amber-300 to-orange-400 shadow-amber-200'
                }`}
              >
                {premium ? '✨ Second Chance — Free!' : '📺 Watch Ad — Second Chance!'}
              </button>
            )}
            <button
              onClick={() => startGame(mode)}
              className={`${reviveAvailable ? 'mt-3' : 'mt-4'} w-full rounded-full px-8 py-3.5 text-lg font-extrabold text-white shadow-lg transition-transform active:scale-95 ${MODE_GRADIENT[mode]}`}
            >
              Play Again
            </button>
            <button
              onClick={backToMenu}
              className="mt-3 w-full rounded-full bg-white px-8 py-3 text-base font-extrabold text-rose-400 shadow-md transition-transform active:scale-95"
            >
              Mode Select
            </button>
            {!premium && (
              <button
                onClick={() => setShowCheckout(true)}
                className="mt-2 text-xs font-bold text-amber-400 underline underline-offset-2 active:text-amber-600"
              >
                Go Ad-Free 👑
              </button>
            )}
          </div>
        </div>
      )}

      {/* Mock rewarded ad overlay — never shown when premium is active */}
      {showAd && !premium && <RewardedAd onReward={handleReviveReward} onClose={() => setShowAd(false)} />}

      {/* Mock premium checkout */}
      {showCheckout && (
        <PremiumCheckout onClose={() => setShowCheckout(false)} onPurchased={() => setPremium(true)} />
      )}
    </div>
  );
}
