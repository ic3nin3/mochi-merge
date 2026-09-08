// Local leaderboards — top 10 per mode, stored on this device only.
//
// ── REMOTE LEADERBOARD HOOK POINT ─────────────────────────────────────────
// To go online, replace the localStorage reads/writes below with API calls:
//   GET  /api/leaderboard?mode=<mode>           -> LeaderboardEntry[]
//   POST /api/leaderboard  { name, score, mode } -> { rank: number }
// Keep the exported signatures (qualifies / addEntry / topForMode) so the UI
// is untouched; the functions would become async and call sites updated to
// await them. Anti-cheat (signed scores, server-side validation) belongs in
// that API layer, not here.
// ───────────────────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  name: string;
  score: number;
  mode: string;
  date: string; // ISO timestamp
}

const BOARD_KEY = 'mochi-merge-leaderboard';
const NAME_KEY = 'mochi-merge-player-name';
export const MAX_PER_MODE = 10;

export function loadBoard(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(BOARD_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is LeaderboardEntry =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as LeaderboardEntry).name === 'string' &&
        typeof (e as LeaderboardEntry).score === 'number' &&
        typeof (e as LeaderboardEntry).mode === 'string' &&
        typeof (e as LeaderboardEntry).date === 'string',
    );
  } catch {
    return [];
  }
}

function saveBoard(entries: LeaderboardEntry[]): void {
  localStorage.setItem(BOARD_KEY, JSON.stringify(entries));
}

/** Top entries for one mode, sorted by score desc (ties: oldest first). */
export function topForMode(mode: string): LeaderboardEntry[] {
  return loadBoard()
    .filter((e) => e.mode === mode)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_PER_MODE);
}

/** Would this score make the mode's top 10? */
export function qualifies(score: number, mode: string): boolean {
  if (score <= 0) return false;
  const top = topForMode(mode);
  return top.length < MAX_PER_MODE || score > top[top.length - 1].score;
}

/**
 * Insert an entry and persist. Returns the 1-based rank within the mode,
 * or -1 if it was trimmed out of the top 10.
 */
export function addEntry(name: string, score: number, mode: string): number {
  const board = loadBoard();
  const entry: LeaderboardEntry = { name, score, mode, date: new Date().toISOString() };
  board.push(entry);
  // Array.prototype.sort is stable — on ties, earlier (existing) entries
  // keep the better rank.
  board.sort((a, b) => b.score - a.score);

  // keep top N per mode
  const counts: Record<string, number> = {};
  const kept = board.filter((e) => {
    counts[e.mode] = (counts[e.mode] ?? 0) + 1;
    return counts[e.mode] <= MAX_PER_MODE;
  });
  saveBoard(kept);

  const modeTop = kept.filter((e) => e.mode === mode);
  const idx = modeTop.indexOf(entry);
  return idx === -1 ? -1 : idx + 1;
}

export function getPlayerName(): string {
  return localStorage.getItem(NAME_KEY) ?? '';
}

export function savePlayerName(name: string): void {
  localStorage.setItem(NAME_KEY, name);
}
