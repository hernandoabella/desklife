import {
  DEFAULT_SETTINGS,
  MAX_STEP_SECONDS,
  MIN_STEP_SECONDS,
  MODE_LABEL,
  MODES,
  emptyDay,
  type CycleStep,
  type DayStats,
  type Mode,
  type Settings,
} from "../types";

const SETTINGS_KEY = "deskflow.settings.v1";
const HISTORY_KEY = "deskflow.history.v1";
const TIMER_KEY = "deskflow.timer.v1";
const MAX_HISTORY_DAYS = 400;

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    return;
  }
}

export function dayKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function shiftDayKey(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return dayKey(date);
}

export function formatDuration(seconds: number, style: "clock" | "compact" = "clock"): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (style === "compact") {
    if (h > 0) return `${h}h ${pad(m)}m`;
    if (m > 0) return `${m}m`;
    return `${s}s`;
  }
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function formatMinutesInput(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s === 0 ? `${m}` : `${m}:${String(s).padStart(2, "0")}`;
}

export function parseDurationInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":");
  if (parts.length > 3) return null;
  if (parts.some((part) => part !== "" && !/^\d+$/.test(part))) return null;
  const nums = parts.map((part) => (part === "" ? 0 : Number(part)));
  const raw = nums.reduce((acc, num) => acc * 60 + num, 0);
  return clampDuration(parts.length === 1 ? raw * 60 : raw);
}

export function clampDuration(seconds: number): number {
  if (!Number.isFinite(seconds)) return MIN_STEP_SECONDS;
  return Math.min(MAX_STEP_SECONDS, Math.max(MIN_STEP_SECONDS, Math.round(seconds)));
}

function sanitizeSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
  const input = raw as Partial<Settings>;
  const steps: CycleStep[] = Array.isArray(input.steps)
    ? input.steps
        .filter((step) => !!step && MODES.includes((step as CycleStep).mode))
        .map((step) => ({
          mode: (step as CycleStep).mode,
          seconds: clampDuration(Number((step as CycleStep).seconds)),
        }))
    : DEFAULT_SETTINGS.steps;

  const theme =
    input.theme === "light" || input.theme === "dark" || input.theme === "system"
      ? input.theme
      : DEFAULT_SETTINGS.theme;

  return {
    schema: 1,
    steps: steps.length > 0 ? steps : DEFAULT_SETTINGS.steps,
    movementGoalSeconds: Math.max(
      60,
      Math.min(MAX_STEP_SECONDS, Number(input.movementGoalSeconds) || DEFAULT_SETTINGS.movementGoalSeconds),
    ),
    notifications: input.notifications !== false,
    autoPauseIdle: input.autoPauseIdle === true,
    idleThresholdSeconds: Math.max(
      30,
      Math.min(6 * 3600, Number(input.idleThresholdSeconds) || DEFAULT_SETTINGS.idleThresholdSeconds),
    ),
    theme,
    compact: input.compact === true,
    onboarded: input.onboarded === true,
  };
}

export function loadSettings(): Settings {
  const raw = readRaw(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings) {
  writeRaw(SETTINGS_KEY, JSON.stringify(settings));
}

function sanitizeDay(raw: unknown): DayStats {
  const day = emptyDay();
  if (!raw || typeof raw !== "object") return day;
  const input = raw as Partial<DayStats>;
  day.sitting = Math.max(0, Math.round(Number(input.sitting) || 0));
  day.standing = Math.max(0, Math.round(Number(input.standing) || 0));
  day.moving = Math.max(0, Math.round(Number(input.moving) || 0));
  day.cyclesCompleted = Math.max(0, Math.round(Number(input.cyclesCompleted) || 0));
  return day;
}

export type History = Record<string, DayStats>;

export function loadHistory(): History {
  const raw = readRaw(HISTORY_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const history: History = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
      history[key] = sanitizeDay(value);
    }
    return history;
  } catch {
    return {};
  }
}

export function saveHistory(history: History) {
  const keys = Object.keys(history).sort();
  const pruned: History = {};
  for (const key of keys.slice(-MAX_HISTORY_DAYS)) pruned[key] = history[key];
  writeRaw(HISTORY_KEY, JSON.stringify(pruned));
}

export function addSeconds(history: History, mode: Mode, seconds: number): History {
  if (seconds <= 0) return history;
  const key = dayKey();
  const current = history[key] ?? emptyDay();
  return {
    ...history,
    [key]: {
      ...current,
      [mode]: current[mode] + Math.round(seconds),
    },
  };
}

export function addCycles(history: History, cycles: number): History {
  if (cycles <= 0) return history;
  const key = dayKey();
  const current = history[key] ?? emptyDay();
  return {
    ...history,
    [key]: { ...current, cyclesCompleted: current.cyclesCompleted + cycles },
  };
}

export interface DayEntry {
  key: string;
  date: Date;
  stats: DayStats;
}

const SHORT_WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

export function weekdayLabel(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  if (!year || !month || !day) return "";
  const date = new Date(year, month - 1, day);
  return SHORT_WEEKDAYS[(date.getDay() + 6) % 7];
}

export function lastDayEntries(history: History, days: number, end = new Date()): DayEntry[] {
  const endKey = dayKey(end);
  const result: DayEntry[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = shiftDayKey(endKey, -i);
    const [year, month, day] = key.split("-").map(Number);
    result.push({ key, date: new Date(year, month - 1, day), stats: history[key] ?? emptyDay() });
  }
  return result;
}

export function lastDays(history: History, days: number, end = new Date()): DayStats[] {
  return lastDayEntries(history, days, end).map((entry) => entry.stats);
}

export function totalsOf(days: DayStats[]): DayStats {
  return days.reduce<DayStats>(
    (acc, day) => ({
      sitting: acc.sitting + day.sitting,
      standing: acc.standing + day.standing,
      moving: acc.moving + day.moving,
      cyclesCompleted: acc.cyclesCompleted + day.cyclesCompleted,
    }),
    emptyDay(),
  );
}

export function movementSeconds(day: DayStats): number {
  return day.standing + day.moving;
}

export function goalProgress(day: DayStats, goalSeconds: number): number {
  if (goalSeconds <= 0) return 0;
  return Math.min(100, Math.round((movementSeconds(day) / goalSeconds) * 100));
}

export function computeStreak(history: History, goalSeconds: number): number {
  let streak = 0;
  let cursor = dayKey();
  if (goalProgress(history[cursor] ?? emptyDay(), goalSeconds) < 100) {
    cursor = shiftDayKey(cursor, -1);
  }
  let guard = 0;
  while (guard++ < MAX_HISTORY_DAYS) {
    const day = history[cursor];
    if (!day || goalProgress(day, goalSeconds) < 100) break;
    streak++;
    cursor = shiftDayKey(cursor, -1);
  }
  return streak;
}

export function saveTimer(index: number, remaining: number, cycleCount: number, endsAt: number | null) {
  writeRaw(TIMER_KEY, JSON.stringify({ index, remaining, cycleCount, endsAt }));
}

export function loadTimer(): {
  index: number;
  remaining: number;
  cycleCount: number;
  endsAt: number | null;
} | null {
  const raw = readRaw(TIMER_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      index: number;
      remaining: number;
      cycleCount: number;
      endsAt: number | null;
    };
    if (typeof parsed.index !== "number" || typeof parsed.remaining !== "number") return null;
    return {
      index: parsed.index,
      remaining: parsed.remaining,
      cycleCount: Number(parsed.cycleCount) || 0,
      endsAt: typeof parsed.endsAt === "number" ? parsed.endsAt : null,
    };
  } catch {
    return null;
  }
}

export function clearAll() {
  try {
    window.localStorage.removeItem(SETTINGS_KEY);
    window.localStorage.removeItem(HISTORY_KEY);
    window.localStorage.removeItem(TIMER_KEY);
  } catch {
    return;
  }
}

export function cycleSummary(steps: CycleStep[]): string {
  return steps.map((step) => `${MODE_LABEL[step.mode]} ${formatDuration(step.seconds, "compact")}`).join(" → ");
}