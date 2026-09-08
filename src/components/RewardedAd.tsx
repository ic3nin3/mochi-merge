import { useEffect, useState } from 'react';

const COUNTDOWN_S = 5;

interface RewardedAdProps {
  /** Called when the reward is earned (ad "watched" + claimed). */
  onReward: () => void;
  /** Called when the player closes the ad without claiming. */
  onClose: () => void;
}

/**
 * MOCK rewarded ad — stands in for a real ad SDK (AdMob / Unity Ads / etc).
 *
 * ── SDK HOOK POINT ────────────────────────────────────────────────────────
 * To go live, replace the countdown below with the SDK's rewarded-ad flow:
 *   1. on mount        → sdk.loadRewarded(PLACEMENT_ID)
 *   2. auto-show       → sdk.showRewarded()
 *   3. onReward callback → call props.onReward() ONLY from the SDK's
 *                        reward-verified callback (never from a timer).
 *   4. onDismiss/error → call props.onClose().
 * Keep this component's props as the single integration surface.
 * ──────────────────────────────────────────────────────────────────────────
 */
export default function RewardedAd({ onReward, onClose }: RewardedAdProps) {
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_S);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [secondsLeft]);

  const ready = secondsLeft <= 0;

  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-gradient-to-b from-amber-100 via-rose-100 to-violet-200 px-6">
      {/* sponsor card */}
      <div className="relative flex w-full max-w-xs flex-col items-center rounded-3xl bg-white/85 p-8 shadow-2xl">
        <span className="absolute top-3 right-4 text-[10px] font-bold tracking-widest text-gray-400 uppercase">
          Ad
        </span>

        {/* mascot: fizzy pudding cup (pure CSS/emoji) */}
        <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-b from-amber-200 to-amber-400 shadow-inner">
          <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-2xl">🍮</span>
          <div className="mt-4 flex flex-col items-center">
            <div className="flex gap-4">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-900" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-900" />
            </div>
            <div className="mt-1.5 h-2 w-5 rounded-b-full border-b-4 border-amber-900" />
          </div>
          <span className="absolute -right-1 -top-1 animate-bounce text-lg">✨</span>
          <span className="absolute -left-2 top-6 animate-pulse text-sm">🫧</span>
        </div>

        <h3 className="mt-4 text-2xl font-extrabold text-amber-600">Pudding Cola ✨</h3>
        <p className="mt-2 text-center text-sm leading-relaxed text-amber-700/80">
          The fizzy wobbly drink that wobbles your fizz! Now with 200% more pudding.
        </p>

        {ready ? (
          <button
            onClick={onReward}
            className="mt-6 w-full rounded-full bg-gradient-to-b from-emerald-400 to-emerald-500 px-6 py-3.5 text-lg font-extrabold text-white shadow-lg shadow-emerald-200 transition-transform active:scale-95"
          >
            Claim Reward 🎁
          </button>
        ) : (
          <div className="mt-6 flex w-full items-center justify-center rounded-full bg-gray-100 px-6 py-3.5 text-lg font-extrabold text-gray-400">
            Reward in {secondsLeft}…
          </div>
        )}
      </div>

      <button
        onClick={onClose}
        className="mt-5 rounded-full bg-white/60 px-6 py-2 text-sm font-bold text-gray-500 shadow transition-transform active:scale-95"
      >
        ✕ No thanks
      </button>
    </div>
  );
}
