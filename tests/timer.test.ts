import { describe, expect, it } from "vitest";
import {
  createTimerState,
  currentStep,
  normalizeSteps,
  timerReducer,
  totalCycleSeconds,
} from "../src/core/timer/reducer";
import { DEFAULT_SETTINGS, type CycleStep, type Settings } from "../src/core/types";

const SHORT: CycleStep[] = [
  { mode: "sitting", seconds: 600 },
  { mode: "standing", seconds: 240 },
  { mode: "moving", seconds: 120 },
];

const SHORT_TOTAL = totalCycleSeconds(SHORT);
const T0 = 1_700_000_000_000;

function settings(steps: CycleStep[]): Settings {
  return { ...DEFAULT_SETTINGS, steps };
}

function started(steps = SHORT) {
  return timerReducer(createTimerState(settings(steps)), { type: "resume", now: T0 });
}

function tick(state: ReturnType<typeof started>, seconds: number) {
  return timerReducer(state, { type: "tick", now: T0 + seconds * 1000 });
}

describe("normalizeSteps", () => {
  it("falls back to defaults when the list is unusable", () => {
    expect(normalizeSteps([])).toEqual(DEFAULT_SETTINGS.steps);
    expect(normalizeSteps(null)).toEqual(DEFAULT_SETTINGS.steps);
    expect(normalizeSteps("nope")).toEqual(DEFAULT_SETTINGS.steps);
    expect(normalizeSteps([{ mode: "break", seconds: 60 }])).toEqual(DEFAULT_SETTINGS.steps);
  });

  it("drops unknown modes instead of producing a NaN timer", () => {
    const steps = normalizeSteps([
      { mode: "sitting", seconds: 300 },
      { mode: "break", seconds: 60 },
      { mode: "teleport", seconds: 60 },
    ]);
    expect(steps).toEqual([{ mode: "sitting", seconds: 300 }]);
  });

  it("clamps durations into a sane range", () => {
    expect(normalizeSteps([{ mode: "sitting", seconds: 0 }])[0].seconds).toBe(60);
    expect(normalizeSteps([{ mode: "sitting", seconds: 99_999_999 }])[0].seconds).toBe(6 * 3600);
  });

  it("never produces NaN from garbage input", () => {
    const steps = normalizeSteps([{ mode: "sitting", seconds: "abc" as never }]);
    expect(Number.isNaN(steps[0].seconds)).toBe(false);
    expect(steps[0].seconds).toBe(60);
  });
});

describe("timerReducer ticking", () => {
  it("counts down from the wall clock, not from interval ticks", () => {
    expect(tick(started(), 3).remaining).toBe(597);
  });

  it("does not drift when ticks arrive irregularly", () => {
    let state = started();
    for (const offset of [1, 2, 3, 7, 8, 30]) {
      state = timerReducer(state, { type: "tick", now: T0 + offset * 1000 });
    }
    expect(state.remaining).toBe(570);
  });

  it("does not advance twice for the same instant", () => {
    const once = tick(started(), 600);
    expect(currentStep(once).mode).toBe("standing");

    const twice = timerReducer(once, { type: "tick", now: T0 + 600_000 });
    expect(currentStep(twice).mode).toBe("standing");
    expect(twice.remaining).toBe(240);
    expect(twice.session.sitting).toBe(600);
  });

  it("advances the cycle and credits the outgoing step exactly once", () => {
    const state = tick(started(), 600);
    expect(currentStep(state).mode).toBe("standing");
    expect(state.session.sitting).toBe(600);
    expect(state.session.standing).toBe(0);
  });

  it("keeps total credited seconds equal to the wall clock across a wrap", () => {
    let state = started();
    for (let i = 1; i <= SHORT_TOTAL; i++) {
      state = tick(state, i);
    }
    const credited = state.session.sitting + state.session.standing + state.session.moving;
    expect(credited).toBe(SHORT_TOTAL);
    expect(state.index).toBe(0);
    expect(state.remaining).toBe(600);
    expect(state.cycleCount).toBe(1);
  });

  it("splits credited time across the modes it actually elapsed in", () => {
    let state = started();
    for (let i = 1; i <= 600 + 240 + 90; i++) {
      state = timerReducer(state, { type: "tick", now: T0 + i * 1000 });
    }
    expect(state.session.sitting).toBe(600);
    expect(state.session.standing).toBe(240);
    expect(state.session.moving).toBe(90);
    expect(state.remaining).toBe(30);
  });

  it("catches up after a large jump and lands on the right step", () => {
    const state = tick(started(), SHORT_TOTAL + 3);
    expect(state.index).toBe(0);
    expect(state.remaining).toBe(597);
    expect(state.session.sitting + state.session.standing + state.session.moving).toBe(SHORT_TOTAL + 3);
  });

  it("ignores ticks that arrive out of order", () => {
    let state = tick(started(), 100);
    state = timerReducer(state, { type: "tick", now: T0 - 60_000 });
    expect(state.remaining).toBe(500);
  });
});

describe("timerReducer controls", () => {
  it("pause settles and freezes the remaining time", () => {
    const paused = timerReducer(tick(started(), 3), { type: "pause", now: T0 + 3000 });
    expect(paused.running).toBe(false);
    expect(paused.endsAt).toBeNull();
    expect(paused.remaining).toBe(597);

    const later = timerReducer(paused, { type: "tick", now: T0 + 600_000 });
    expect(later.remaining).toBe(597);
    expect(later.session.sitting).toBe(3);
  });

  it("resume continues from the paused remainder", () => {
    const paused = timerReducer(tick(started(), 3), { type: "pause", now: T0 + 3000 });
    const resumed = timerReducer(paused, { type: "resume", now: T0 + 600_000 });
    expect(resumed.remaining).toBe(597);
    const later = timerReducer(resumed, { type: "tick", now: T0 + 602_000 });
    expect(later.remaining).toBe(595);
  });

  it("never double counts across a pause and resume", () => {
    let state = tick(started(), 100);
    state = timerReducer(state, { type: "pause", now: T0 + 100_000 });
    state = timerReducer(state, { type: "resume", now: T0 + 900_000 });
    state = timerReducer(state, { type: "tick", now: T0 + 960_000 });
    expect(state.session.sitting).toBe(160);
  });

  it("skip banks the partial step before moving on", () => {
    const state = timerReducer(tick(started(), 100), { type: "skip", now: T0 + 100_000 });
    expect(currentStep(state).mode).toBe("standing");
    expect(state.session.sitting).toBe(100);
    expect(state.remaining).toBe(240);
  });

  it("restart banks the partial step and refills the current one", () => {
    const state = timerReducer(tick(started(), 100), { type: "restart", now: T0 + 100_000 });
    expect(state.session.sitting).toBe(100);
    expect(state.remaining).toBe(600);
  });

  it("auto-pause stops the clock and is cleared explicitly", () => {
    const auto = timerReducer(tick(started(), 3), {
      type: "set-auto-paused",
      value: true,
      now: T0 + 3000,
    });
    expect(auto.running).toBe(false);
    expect(auto.autoPaused).toBe(true);
    expect(auto.remaining).toBe(597);
    expect(auto.session.sitting).toBe(3);

    const cleared = timerReducer(auto, { type: "set-auto-paused", value: false, now: T0 + 3000 });
    expect(cleared.autoPaused).toBe(false);
  });
});

describe("timerReducer configuration", () => {
  it("keeps the position and refills when the shape is unchanged", () => {
    const running = tick(started(), 3);
    const next = timerReducer(running, {
      type: "apply-settings",
      settings: settings(SHORT.map((step) => ({ ...step, seconds: step.seconds * 2 }))),
      now: T0 + 3000,
    });
    expect(next.index).toBe(0);
    expect(currentStep(next).mode).toBe("sitting");
    expect(next.remaining).toBe(1200);
  });

  it("returns to the first step when the cycle changes shape", () => {
    const running = tick(started(), 3);
    const next = timerReducer(running, {
      type: "apply-settings",
      settings: settings([{ mode: "moving", seconds: 60 }]),
      now: T0 + 3000,
    });
    expect(next.index).toBe(0);
    expect(currentStep(next).mode).toBe("moving");
    expect(next.remaining).toBe(60);
  });

  it("supports cycles of any length without going undefined", () => {
    const long = Array.from({ length: 9 }, () => ({ mode: "sitting" as const, seconds: 60 }));
    const state = createTimerState(settings(long));
    expect(state.remaining).toBe(60);
    expect(state.steps).toHaveLength(9);
    expect(currentStep(state).seconds).toBe(60);
  });
});

describe("timerReducer hydration", () => {
  const saved = {
    index: 0,
    remaining: DEFAULT_SETTINGS.steps[0].seconds,
    cycleCount: 2,
    endsAt: null as number | null,
  };

  it("restores a timer that is still counting down", () => {
    const state = timerReducer(createTimerState(DEFAULT_SETTINGS), {
      type: "hydrate",
      settings: DEFAULT_SETTINGS,
      saved: { ...saved, endsAt: T0 + 5000 },
      now: T0,
    });
    expect(state.running).toBe(true);
    expect(state.remaining).toBe(5);
    expect(state.cycleCount).toBe(2);
  });

  it("starts paused when the saved end is already in the past", () => {
    const state = timerReducer(createTimerState(DEFAULT_SETTINGS), {
      type: "hydrate",
      settings: DEFAULT_SETTINGS,
      saved: { ...saved, index: 1, endsAt: T0 - 60_000 },
      now: T0,
    });
    expect(state.running).toBe(false);
    expect(state.endsAt).toBeNull();
  });

  it("clamps a saved index that no longer exists", () => {
    const state = timerReducer(createTimerState(DEFAULT_SETTINGS), {
      type: "hydrate",
      settings: DEFAULT_SETTINGS,
      saved: { ...saved, index: 99 },
      now: T0,
    });
    expect(state.index).toBe(DEFAULT_SETTINGS.steps.length - 1);
    expect(state.remaining).toBe(DEFAULT_SETTINGS.steps[state.index].seconds);
  });

  it("does not credit a long absence as work", () => {
    const state = timerReducer(createTimerState(DEFAULT_SETTINGS), {
      type: "hydrate",
      settings: DEFAULT_SETTINGS,
      saved: { ...saved, index: 1, remaining: 5, endsAt: T0 + 5000 },
      now: T0 + 8 * 3600_000,
    });
    expect(state.running).toBe(false);
    expect(state.session.sitting + state.session.standing + state.session.moving).toBe(0);
  });

  it("lands on a valid step after reopening with the clock still ahead", () => {
    const state = timerReducer(createTimerState(DEFAULT_SETTINGS), {
      type: "hydrate",
      settings: DEFAULT_SETTINGS,
      saved: { ...saved, remaining: 3000, endsAt: T0 + 5 * 3600_000 },
      now: T0,
    });
    expect(state.running).toBe(true);
    expect(state.index).toBeGreaterThanOrEqual(0);
    expect(state.index).toBeLessThan(DEFAULT_SETTINGS.steps.length);
    expect(state.remaining).toBeGreaterThan(0);
    expect(state.remaining).toBeLessThanOrEqual(DEFAULT_SETTINGS.steps[state.index].seconds);
    expect(state.session.sitting + state.session.standing + state.session.moving).toBe(0);
  });
});