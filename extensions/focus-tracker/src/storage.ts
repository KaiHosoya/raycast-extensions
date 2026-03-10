import { LocalStorage, getPreferenceValues } from "@raycast/api";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Session {
  id: string;
  startedAt: string; // ISO timestamp
  endedAt?: string;
  duration: number; // planned duration in seconds
  elapsed: number; // actual elapsed in seconds
  type: "focus" | "short-break" | "long-break";
  completed: boolean;
  label?: string;
}

export interface TimerState {
  isRunning: boolean;
  startedAt?: string; // ISO timestamp when timer started
  pausedAt?: string; // ISO timestamp when paused
  elapsed: number; // seconds elapsed before current run
  duration: number; // total duration in seconds
  type: "focus" | "short-break" | "long-break";
  sessionCount: number; // completed focus sessions (for long break logic)
}

export interface DailyStats {
  date: string; // YYYY-MM-DD
  totalFocusTime: number; // seconds
  sessionsCompleted: number;
  sessionsAbandoned: number;
  longestStreak: number;
  hourlyBreakdown: Record<string, number>; // "09" -> seconds
}

export interface Preferences {
  focusDuration: string;
  shortBreakDuration: string;
  longBreakDuration: string;
  dailyGoal: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TIMER_KEY = "focus-tracker:timer";
const SESSIONS_KEY = "focus-tracker:sessions";
const DAILY_GOAL_KEY = "focus-tracker:daily-goal";

// ─── Preferences ─────────────────────────────────────────────────────────────

export function getConfig(): {
  focusDuration: number;
  shortBreakDuration: number;
  longBreakDuration: number;
  dailyGoal: number;
} {
  const prefs = getPreferenceValues<Preferences>();
  return {
    focusDuration: (parseInt(prefs.focusDuration) || 25) * 60,
    shortBreakDuration: (parseInt(prefs.shortBreakDuration) || 5) * 60,
    longBreakDuration: (parseInt(prefs.longBreakDuration) || 15) * 60,
    dailyGoal: parseInt(prefs.dailyGoal) || 8,
  };
}

// ─── Daily Goal (LocalStorage override) ──────────────────────────────────────

export async function getDailyGoal(): Promise<number> {
  const stored = await LocalStorage.getItem<string>(DAILY_GOAL_KEY);
  if (stored) {
    const parsed = parseInt(stored);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return getConfig().dailyGoal;
}

export async function setDailyGoal(goal: number): Promise<void> {
  await LocalStorage.setItem(DAILY_GOAL_KEY, goal.toString());
}

// ─── Timer State ─────────────────────────────────────────────────────────────

export async function getTimerState(): Promise<TimerState | null> {
  const raw = await LocalStorage.getItem<string>(TIMER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TimerState;
  } catch {
    return null;
  }
}

export async function setTimerState(state: TimerState): Promise<void> {
  await LocalStorage.setItem(TIMER_KEY, JSON.stringify(state));
}

export async function clearTimerState(): Promise<void> {
  await LocalStorage.removeItem(TIMER_KEY);
}

/**
 * Calculate current elapsed time considering running state
 */
export function getCurrentElapsed(state: TimerState): number {
  if (!state.isRunning || !state.startedAt) {
    return state.elapsed;
  }
  const now = Date.now();
  const started = new Date(state.startedAt).getTime();
  return state.elapsed + Math.floor((now - started) / 1000);
}

/**
 * Get remaining seconds
 */
export function getRemaining(state: TimerState): number {
  const elapsed = getCurrentElapsed(state);
  return Math.max(0, state.duration - elapsed);
}

/**
 * Format seconds as MM:SS
 */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * Format seconds as human readable (e.g. "2h 15m")
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export async function getSessions(): Promise<Session[]> {
  const raw = await LocalStorage.getItem<string>(SESSIONS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Session[];
  } catch {
    return [];
  }
}

export async function addSession(session: Session): Promise<void> {
  const sessions = await getSessions();
  sessions.push(session);
  // Keep only last 30 days of sessions
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const filtered = sessions.filter((s) => new Date(s.startedAt) >= cutoff);
  await LocalStorage.setItem(SESSIONS_KEY, JSON.stringify(filtered));
}

export function getTodaySessions(sessions: Session[]): Session[] {
  const today = new Date().toISOString().split("T")[0];
  return sessions.filter((s) => s.startedAt.startsWith(today));
}

// ─── Daily Stats ─────────────────────────────────────────────────────────────

export function computeDailyStats(sessions: Session[]): DailyStats {
  const today = new Date().toISOString().split("T")[0];
  const todaySessions = sessions.filter((s) => s.startedAt.startsWith(today) && s.type === "focus");

  const totalFocusTime = todaySessions.reduce((sum, s) => sum + s.elapsed, 0);
  const sessionsCompleted = todaySessions.filter((s) => s.completed).length;
  const sessionsAbandoned = todaySessions.filter((s) => !s.completed).length;

  // Hourly breakdown
  const hourlyBreakdown: Record<string, number> = {};
  for (const s of todaySessions) {
    const hour = new Date(s.startedAt).getHours().toString().padStart(2, "0");
    hourlyBreakdown[hour] = (hourlyBreakdown[hour] || 0) + s.elapsed;
  }

  // Longest streak of completed sessions
  let longestStreak = 0;
  let currentStreak = 0;
  for (const s of todaySessions) {
    if (s.completed) {
      currentStreak++;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  return {
    date: today,
    totalFocusTime,
    sessionsCompleted,
    sessionsAbandoned,
    longestStreak,
    hourlyBreakdown,
  };
}

// ─── Weekly Stats (Monday-based) ─────────────────────────────────────────────

/**
 * Get the Monday 00:00 of the week containing the given date.
 */
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export interface WeekSummary {
  label: string; // "This Week", "Last Week", "2 Weeks Ago"
  monday: string; // YYYY-MM-DD
  sunday: string; // YYYY-MM-DD
  totalFocusTime: number;
  sessionsCompleted: number;
  dailyTotals: { date: string; focusTime: number; sessions: number }[];
}

export function computeWeeklyStats(sessions: Session[]): WeekSummary[] {
  const now = new Date();
  const thisMonday = getMonday(now);
  const labels = ["This Week", "Last Week", "2 Weeks Ago"];
  const weeks: WeekSummary[] = [];

  for (let w = 0; w < 3; w++) {
    const monday = new Date(thisMonday);
    monday.setDate(monday.getDate() - w * 7);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);

    const mondayStr = monday.toISOString().split("T")[0];
    const sundayStr = sunday.toISOString().split("T")[0];

    const dailyTotals: { date: string; focusTime: number; sessions: number }[] = [];

    for (let d = 0; d < 7; d++) {
      const day = new Date(monday);
      day.setDate(day.getDate() + d);
      const dateStr = day.toISOString().split("T")[0];
      const daySessions = sessions.filter((s) => s.startedAt.startsWith(dateStr) && s.type === "focus");
      dailyTotals.push({
        date: dateStr,
        focusTime: daySessions.reduce((sum, s) => sum + s.elapsed, 0),
        sessions: daySessions.filter((s) => s.completed).length,
      });
    }

    weeks.push({
      label: labels[w],
      monday: mondayStr,
      sunday: sundayStr,
      totalFocusTime: dailyTotals.reduce((sum, d) => sum + d.focusTime, 0),
      sessionsCompleted: dailyTotals.reduce((sum, d) => sum + d.sessions, 0),
      dailyTotals,
    });
  }

  return weeks;
}
