import { beforeEach, describe, expect, it } from "vitest";
import {
  addCycles,
  addSeconds,
  computeStreak,
  dayKey,
  formatDuration,
  formatMinutesInput,
  goalProgress,
  lastDayEntries,
  loadHistory,
  loadSettings,
  movementSeconds,
  parseDurationInput,
  saveHistory,
  saveSettings,
  shiftDayKey,
  totalsOf,
  type History,
} from "../src/core/storage/storage";
import { DEFAULT_SETTINGS, emptyDay } from "../src/core/types";

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  clear() {
    this.data.clear();
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, "window", {
    value: { localStorage: new MemoryStorage() },
    configurable: true,
    writable: true,
  });
});

describe("date keys", () => {
  it("formats using the local date, not UTC", () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
    expect(dayKey(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("shifts across month and year boundaries", () => {
    expect(shiftDayKey("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDayKey("2026-02-28", 1)).toBe("2026-03-01");
    expect(shiftDayKey("2024-02-28", 1)).toBe("2024-02-29");
  });
});

describe("duration formatting", () => {
  it("formats a clock", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(65)).toBe("01:05");
    expect(formatDuration(3725)).toBe("01:02:05");
  });

  it("formats a compact label", () => {
    expect(formatDuration(300, "compact")).toBe("5m");
    expect(formatDuration(3660, "compact")).toBe("1h 01m");
  });

  it("parses user input back into seconds", () => {
    expect(parseDurationInput("45")).toBe(45 * 60);
    expect(parseDurationInput("1:30")).toBe(90);
    expect(parseDurationInput("1:00:00")).toBe(3600);
  });

  it("round-trips what the duration field renders", () => {
    for (const seconds of [60, 270, 600, 3000, 3600, 7200]) {
      expect(parseDurationInput(formatMinutesInput(seconds))).toBe(seconds);
    }
  });

  it("rejects nonsense input instead of returning NaN", () => {
    expect(parseDurationInput("abc")).toBeNull();
    expect(parseDurationInput("")).toBeNull();
    expect(parseDurationInput("1:2:3:4")).toBeNull();
    expect(parseDurationInput("5x")).toBeNull();
  });

  it("clamps parsed input to the allowed range", () => {
    expect(parseDurationInput("0")).toBe(60);
    expect(parseDurationInput("99999")).toBe(6 * 3600);
  });
});

describe("history", () => {
  it("accumulates into today's entry only", () => {
    const today = dayKey();
    let history: History = {};
    history = addSeconds(history, "sitting", 60);
    history = addSeconds(history, "sitting", 30);
    history = addSeconds(history, "moving", 10);

    expect(Object.keys(history)).toEqual([today]);
    expect(history[today].sitting).toBe(90);
    expect(history[today].moving).toBe(10);
  });

  it("ignores non-positive deltas", () => {
    const history = addSeconds({}, "sitting", 0);
    expect(Object.keys(history)).toEqual([]);
  });

  it("counts completed cycles", () => {
    const history = addCycles({}, 3);
    expect(history[dayKey()].cyclesCompleted).toBe(3);
  });

  it("survives corrupted storage", () => {
    window.localStorage.setItem("deskflow.history.v1", "{not json");
    expect(loadHistory()).toEqual({});

    window.localStorage.setItem(
      "deskflow.history.v1",
      JSON.stringify({ "2026-01-01": { sitting: -5, moving: "x" }, nope: {} }),
    );
    const history = loadHistory();
    expect(history["2026-01-01"].sitting).toBe(0);
    expect(history["2026-01-01"].moving).toBe(0);
    expect(history.nope).toBeUndefined();
  });

  it("round-trips through save and load", () => {
    const history = addSeconds(addSeconds({}, "standing", 900), "moving", 300);
    saveHistory(history);
    expect(loadHistory()).toEqual(history);
  });

  it("returns a dense series with zeroed gaps, oldest first", () => {
    const entries = lastDayEntries({}, 7);
    expect(entries).toHaveLength(7);
    expect(entries[6].key).toBe(dayKey());
    expect(entries.every((entry) => entry.stats.sitting === 0)).toBe(true);
  });

  it("totals the series", () => {
    const totals = totalsOf([
      { sitting: 10, standing: 20, moving: 30, cyclesCompleted: 1 },
      { sitting: 1, standing: 2, moving: 3, cyclesCompleted: 1 },
    ]);
    expect(totals).toEqual({ sitting: 11, standing: 22, moving: 33, cyclesCompleted: 2 });
  });
});

describe("goal progress", () => {
  it("counts standing plus moving toward the goal", () => {
    const day = { ...emptyDay(), standing: 900, moving: 600, sitting: 9999 };
    expect(movementSeconds(day)).toBe(1500);
    expect(goalProgress(day, 2 * 3600)).toBe(21);
  });

  it("clamps at 100 and never divides by zero", () => {
    expect(goalProgress({ ...emptyDay(), standing: 100_000 }, 3600)).toBe(100);
    expect(goalProgress(emptyDay(), 0)).toBe(0);
  });
});

describe("computeStreak", () => {
  const goal = 3600;

  function withDays(days: string[], seconds = 3600): History {
    const history: History = {};
    for (const day of days) history[day] = { ...emptyDay(), moving: seconds };
    return history;
  }

  it("counts consecutive goal days ending today", () => {
    const history = withDays([dayKey(), shiftDayKey(dayKey(), -1), shiftDayKey(dayKey(), -2)]);
    expect(computeStreak(history, goal)).toBe(3);
  });

  it("starts from yesterday when today is not done yet", () => {
    const history = withDays([shiftDayKey(dayKey(), -1), shiftDayKey(dayKey(), -2)]);
    expect(computeStreak(history, goal)).toBe(2);
  });

  it("breaks on a missed day", () => {
    const history = withDays([shiftDayKey(dayKey(), -2), shiftDayKey(dayKey(), -3)]);
    expect(computeStreak(history, goal)).toBe(0);
  });

  it("does not count a day that missed the goal", () => {
    const history = withDays([dayKey(), shiftDayKey(dayKey(), -1)], 60);
    expect(computeStreak(history, goal)).toBe(0);
  });

  it("returns zero with no history", () => {
    expect(computeStreak({}, goal)).toBe(0);
  });
});

describe("settings persistence", () => {
  it("round-trips valid settings", () => {
    const next = {
      ...DEFAULT_SETTINGS,
      steps: [{ mode: "moving" as const, seconds: 600 }],
      theme: "dark" as const,
      onboarded: true,
    };
    saveSettings(next);
    expect(loadSettings()).toEqual(next);
  });

  it("repairs hostile or corrupted values", () => {
    window.localStorage.setItem(
      "deskflow.settings.v1",
      JSON.stringify({
        steps: [{ mode: "break", seconds: 5 }, { mode: "sitting", seconds: -1 }],
        theme: "neon",
        notifications: "yes",
        idleThresholdSeconds: -50,
        movementGoalSeconds: "abc",
      }),
    );
    const settings = loadSettings();
    expect(settings.steps).toEqual([{ mode: "sitting", seconds: 60 }]);
    expect(settings.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(settings.notifications).toBe(true);
    expect(settings.idleThresholdSeconds).toBeGreaterThan(0);
    expect(Number.isNaN(settings.movementGoalSeconds)).toBe(false);
  });

  it("falls back to defaults when storage throws", () => {
    Object.defineProperty(globalThis, "window", {
      value: {
        get localStorage() {
          throw new Error("blocked");
        },
      },
      configurable: true,
      writable: true,
    });
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});