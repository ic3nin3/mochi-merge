import { useEffect, useRef, useState } from 'react';

const PREMIUM_KEY = 'mochi-merge-premium';

export function isPremium(): boolean {
  return localStorage.getItem(PREMIUM_KEY) === '1';
}

interface PremiumCheckoutProps {
  onClose: () => void;
  /** Called whenever premium becomes active (purchase or restore). */
  onPurchased: () => void;
}

type CheckoutState = 'buy' | 'processing' | 'success' | 'owned';

const CONFETTI_EMOJI = ['✨', '💖', '🍡', '⭐', '💛', '👑'];

/**
 * MOCK premium checkout — stands in for real billing.
 *
 * ── BILLING HOOK POINT ────────────────────────────────────────────────────
 * Replace buy() with a real purchase flow:
 *   - Web:   Stripe Checkout / Payment Link -> verify the session
 *            server-side, then set entitlements.
 *   - Mobile (wrapped): StoreKit / Google Play Billing IAP
 *            (e.g. react-native-iap or Capacitor plugin) -> verify receipt.
 * Only call onPurchased() after confirmed payment, and persist the
 * entitlement server-side (the localStorage flag here is a local stand-in).
 * restore() should re-query the store/IAP receipt instead of the flag.
 * ──────────────────────────────────────────────────────────────────────────
 */
export default function PremiumCheckout({ onClose, onPurchased }: PremiumCheckoutProps) {
  const [state, setState] = useState<CheckoutState>(isPremium() ? 'owned' : 'buy');
  const [restoreMsg, setRestoreMsg] = useState('');
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const buy = () => {
    setState('processing');
    timerRef.current = window.setTimeout(() => {
      localStorage.setItem(PREMIUM_KEY, '1');
      setState('success');
      onPurchased();
    }, 1500);
  };

  const restore = () => {
    if (isPremium()) {
      setState('owned');
      onPurchased();
      setRestoreMsg('Purchase restored! 👑');
    } else {
      setRestoreMsg('No purchase found on this device.');
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-[#fff6ec]/85 px-6 backdrop-blur-sm">
      <div className="cafe-enter relative flex w-full max-w-xs flex-col items-center overflow-hidden rounded-3xl bg-white/95 p-7 shadow-2xl">
        {/* success confetti */}
        {state === 'success' && (
          <div className="pointer-events-none absolute inset-0">
            {Array.from({ length: 16 }).map((_, i) => (
              <span
                key={i}
                className="premium-confetti absolute text-lg"
                style={{
                  left: `${(i * 61) % 100}%`,
                  top: '-8%',
                  animationDelay: `${(i % 6) * 0.12}s`,
                }}
              >
                {CONFETTI_EMOJI[i % CONFETTI_EMOJI.length]}
              </span>
            ))}
          </div>
        )}

        <div className="text-5xl">👑</div>
        <h3 className="mt-2 text-center text-2xl font-extrabold text-amber-500">
          Mochi Merge Premium
        </h3>
        <p className="mt-1 text-sm font-bold text-amber-400">one-time $2.99</p>

        <div className="mt-4 flex w-full flex-col gap-2 text-sm font-semibold text-gray-600">
          <p>✨ Instant Second Chances — no ads</p>
          <p>👑 Supporter badge</p>
          <p>💛 Support the dev</p>
        </div>

        {state === 'buy' && (
          <button
            onClick={buy}
            className="mt-6 w-full rounded-full bg-gradient-to-b from-amber-400 to-orange-500 px-8 py-3.5 text-lg font-extrabold text-white shadow-lg shadow-amber-200 transition-transform active:scale-95"
          >
            Buy $2.99 💎
          </button>
        )}

        {state === 'processing' && (
          <div className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-amber-50 px-8 py-3.5 text-lg font-extrabold text-amber-500">
            <span className="inline-block animate-spin">💎</span> Processing…
          </div>
        )}

        {state === 'success' && (
          <div className="mt-6 w-full rounded-full bg-gradient-to-b from-emerald-400 to-teal-500 px-8 py-3.5 text-center text-lg font-extrabold text-white shadow-lg">
            Welcome to Premium! 🎉
          </div>
        )}

        {state === 'owned' && (
          <div className="mt-6 w-full rounded-full bg-amber-100 px-8 py-3.5 text-center text-lg font-extrabold text-amber-600">
            You own this 💛
          </div>
        )}

        {restoreMsg && <p className="mt-3 text-xs font-semibold text-gray-400">{restoreMsg}</p>}

        <button
          onClick={restore}
          className="mt-3 text-xs font-bold text-gray-400 underline underline-offset-2 active:text-gray-600"
        >
          restore purchase
        </button>

        <button
          onClick={onClose}
          className="mt-4 rounded-full bg-white px-6 py-2 text-sm font-extrabold text-gray-500 shadow-md transition-transform active:scale-95"
        >
          Close
        </button>
      </div>
    </div>
  );
}
