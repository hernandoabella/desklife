import {
  DEFAULT_SETTINGS,
  MAX_STEP_SECONDS,
  MIN_STEP_SECONDS,
  emptyTotals,
  type CycleStep,
  type ModeTotals,
  type Settings,
} from "../types";

const MAX_CATCHUP_STEPS = 1000;

export interface PersistedTimer {
  index: number;
  remaining: number;
  cycleCount: number;
  endsAt: number | null;
}

export interface TimerState {
  steps: CycleStep[];
  index: number;
  remaining: number;
  endsAt: number | null;
  stepCredited: number;
  running: boolean;
  autoPaused: boolean;
  cycleCount: number;
  session: ModeTotals;
}

export type TimerAction =
  | { type: "hydrate"; settings: Settings; saved: PersistedTimer | null; now: number }
  | { type: "tick"; now: number }
  | { type: "resume"; now: number }
  | { type: "pause"; now: number }
  | { type: "toggle"; now: number }
  | { type: "skip"; now: number }
  | { type: "restart"; now: number }
  | { type: "set-auto-paused"; value: boolean; now: number }
  | { type: "apply-settings"; settings: Settings; now: number };

export function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

const isMode = (value: unknown): value is CycleStep["mode"] =>
  value === "sitting" || value === "standing" || value === "moving";

export function normalizeSteps(steps: unknown): CycleStep[] {
  const raw = Array.isArray(steps) ? steps : [];
  const cleaned: CycleStep[] = [];
  for (const step of raw) {
    if (!step || typeof step !== "object") continue;
    const { mode, seconds } = step as CycleStep;
    if (!isMode(mode)) continue;
    cleaned.push({
      mode,
      seconds: clamp(Math.round(Number(seconds)), MIN_STEP_SECONDS, MAX_STEP_SECONDS),
    });
  }
  return cleaned.length > 0 ? cleaned : DEFAULT_SETTINGS.steps;
}

export function currentStep(state: TimerState): CycleStep {
  return state.steps[state.index];
}

export function totalCycleSeconds(steps: CycleStep[]): number {
  return steps.reduce((sum, step) => sum + step.seconds, 0);
}

export function createTimerState(
  settings: Settings = DEFAULT_SETTINGS,
  saved: PersistedTimer | null = null,
): TimerState {
  const steps = normalizeSteps(settings.steps);
  const index = saved ? clamp(saved.index, 0, steps.length - 1) : 0;
  const remaining = saved
    ? clamp(Math.round(saved.remaining), 0, steps[index].seconds)
    : steps[index].seconds;
  return {
    steps,
    index,
    remaining,
    endsAt: null,
    stepCredited: 0,
    running: false,
    autoPaused: false,
    cycleCount: saved?.cycleCount ?? 0,
    session: emptyTotals(),
  };
}

function creditStep(state: TimerState, credited: number): ModeTotals {
  const delta = credited - state.stepCredited;
  if (delta <= 0) return state.session;
  const mode = currentStep(state).mode;
  return { ...state.session, [mode]: state.session[mode] + delta };
}

function moveTo(state: TimerState, index: number, endsAt: number | null): TimerState {
  const count = state.steps.length;
  const nextIndex = ((index % count) + count) % count;
  const remaining = state.steps[nextIndex].seconds;
  return {
    ...state,
    index: nextIndex,
    remaining,
    endsAt,
    stepCredited: 0,
    cycleCount: nextIndex === 0 && state.index !== 0 ? state.cycleCount + 1 : state.cycleCount,
  };
}

function settleStep(state: TimerState, now: number): TimerState {
  if (!state.running || state.endsAt === null) return state;
  const remaining = Math.max(
    0,
    Math.min(state.remaining, Math.ceil((state.endsAt - now) / 1000)),
  );
  const credited = Math.max(
    state.stepCredited,
    state.steps[state.index].seconds - remaining,
  );
  return {
    ...state,
    remaining,
    session: creditStep(state, credited),
    stepCredited: credited,
  };
}

function tick(state: TimerState, now: number): TimerState {
  let current = state;
  let guard = 0;

  while (current.running && current.endsAt !== null && guard++ < MAX_CATCHUP_STEPS) {
    const remaining = Math.max(
      0,
      Math.min(current.remaining, Math.ceil((current.endsAt - now) / 1000)),
    );
    const credited = Math.max(
      current.stepCredited,
      current.steps[current.index].seconds - remaining,
    );
    const banked: TimerState = {
      ...current,
      remaining,
      session: creditStep(current, credited),
      stepCredited: credited,
    };

    if (remaining > 0) return banked;

    const nextSeconds = banked.steps[(banked.index + 1) % banked.steps.length].seconds;
    current = moveTo(banked, banked.index + 1, current.endsAt + nextSeconds * 1000);
  }

  return current;
}

function settle(state: TimerState, now: number): TimerState {
  return settleStep(state, now);
}

export function timerReducer(state: TimerState, action: TimerAction): TimerState {
  switch (action.type) {
    case "hydrate":
      return hydrate(state, action.settings, action.saved, action.now);

    case "tick":
      return tick(state, action.now);

    case "resume":
      if (state.running) return state;
      return {
        ...state,
        running: true,
        autoPaused: false,
        endsAt: action.now + state.remaining * 1000,
      };

    case "pause": {
      const settled = settle(state, action.now);
      return { ...settled, running: false, autoPaused: false, endsAt: null };
    }

    case "toggle":
      return state.running
        ? timerReducer(state, { type: "pause", now: action.now })
        : timerReducer(state, { type: "resume", now: action.now });

    case "skip": {
      const settled = settle(state, action.now);
      const nextSeconds = settled.steps[(settled.index + 1) % settled.steps.length].seconds;
      return moveTo(settled, settled.index + 1, settled.running ? action.now + nextSeconds * 1000 : null);
    }

    case "restart": {
      const settled = settle(state, action.now);
      const remaining = state.steps[settled.index].seconds;
      return {
        ...settled,
        remaining,
        endsAt: settled.running ? action.now + remaining * 1000 : null,
        stepCredited: 0,
        autoPaused: false,
      };
    }

    case "set-auto-paused": {
      if (state.autoPaused === action.value) return state;
      if (!action.value) return { ...state, autoPaused: false };
      const settled = settle(state, action.now);
      return { ...settled, running: false, autoPaused: true, endsAt: null };
    }

    case "apply-settings": {
      const steps = normalizeSteps(action.settings.steps);
      const settled = settle(state, action.now);
      const sameShape =
        steps.length === state.steps.length &&
        steps.every((step, i) => step.mode === state.steps[i].mode);
      const index = sameShape ? clamp(state.index, 0, steps.length - 1) : 0;
      const remaining = steps[index].seconds;
      return {
        ...settled,
        steps,
        index,
        remaining,
        endsAt: settled.running ? action.now + remaining * 1000 : null,
        stepCredited: 0,
        autoPaused: false,
      };
    }

    default:
      return state;
  }
}

function hydrate(
  state: TimerState,
  settings: Settings,
  saved: PersistedTimer | null,
  now: number,
): TimerState {
  const base = createTimerState(settings, saved);
  const endsAt = saved?.endsAt;
  if (!endsAt || endsAt <= now) return base;

  const elapsed = Math.max(0, Math.floor((now - (endsAt - base.remaining * 1000)) / 1000));
  const consumed = elapsed - base.remaining;

  if (consumed <= 0) {
    const remaining = Math.max(0, base.remaining - elapsed);
    return {
      ...base,
      remaining,
      running: true,
      endsAt: now + remaining * 1000,
      stepCredited: 0,
    };
  }

  let index = base.index;
  let left = consumed;
  let guard = 0;
  while (guard++ < 1000) {
    const stepSeconds = base.steps[index].seconds;
    if (left < stepSeconds) break;
    left -= stepSeconds;
    index = (index + 1) % base.steps.length;
  }

  const remaining = Math.max(0, base.steps[index].seconds - left);

  return {
    ...base,
    index,
    remaining,
    running: true,
    endsAt: now + remaining * 1000,
    stepCredited: 0,
  };
}