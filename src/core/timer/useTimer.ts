import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  addCycles,
  addSeconds,
  loadTimer,
  saveTimer,
  type History,
} from "../storage/storage";
import { emptyTotals, type Mode, type ModeTotals, type Settings } from "../types";
import { createTimerState, currentStep, timerReducer, type PersistedTimer } from "./reducer";

const TICK_MS = 250;
const IDLE_CHECK_MS = 5000;
const FLUSH_INTERVAL_MS = 10000;

const INPUT_EVENTS = ["pointerdown", "keydown", "wheel", "mousemove", "touchstart"] as const;

export interface UseTimerOptions {
  settings: Settings;
  history: History;
  setHistory: (updater: (history: History) => History) => void;
  onModeChange?: (mode: Mode) => void;
}

export interface UseTimerResult {
  mode: Mode;
  remaining: number;
  running: boolean;
  autoPaused: boolean;
  idleSeconds: number;
  cycleCount: number;
  steps: Settings["steps"];
  index: number;
  progress: number;
  session: ModeTotals;
  dispatch: (action: Parameters<typeof timerReducer>[1]) => void;
  toggle: () => void;
  skip: () => void;
  restart: () => void;
}

export function useTimer({
  settings,
  history,
  setHistory,
  onModeChange,
}: UseTimerOptions): UseTimerResult {
  const [state, dispatch] = useReducer(timerReducer, null, () => {
    const saved = loadTimer();
    const base = createTimerState(settings, saved);
    if (saved) return timerReducer(base, { type: "hydrate", settings, saved, now: Date.now() });
    return timerReducer(base, { type: "resume", now: Date.now() });
  });
  const [idleSeconds, setIdleSeconds] = useState(0);
  const lastInputAt = useRef(Date.now());
  const flushedSession = useRef<ModeTotals>(emptyTotals());
  const flushedCycles = useRef(0);
  const modeRef = useRef<Mode>(currentStep(state).mode);
  const historyRef = useRef(history);
  historyRef.current = history;

  const step = currentStep(state);
  const stepsKey = JSON.stringify(settings.steps);
  const appliedStepsKey = useRef<string | null>(null);

  useEffect(() => {
    if (appliedStepsKey.current === null) {
      appliedStepsKey.current = stepsKey;
      return;
    }
    if (appliedStepsKey.current === stepsKey) return;
    appliedStepsKey.current = stepsKey;
    dispatch({ type: "apply-settings", settings, now: Date.now() });
  }, [stepsKey, settings]);

  useEffect(() => {
    if (!state.running) return;
    const id = window.setInterval(() => dispatch({ type: "tick", now: Date.now() }), TICK_MS);
    return () => window.clearInterval(id);
  }, [state.running]);

  useEffect(() => {
    if (!state.running) {
      setIdleSeconds(0);
      return;
    }
    const id = window.setInterval(() => {
      setIdleSeconds(Math.floor((Date.now() - lastInputAt.current) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [state.running]);

  useEffect(() => {
    const mark = () => {
      lastInputAt.current = Date.now();
      if (state.autoPaused) dispatch({ type: "set-auto-paused", value: false, now: Date.now() });
    };
    for (const event of INPUT_EVENTS) window.addEventListener(event, mark, { passive: true });
    return () => {
      for (const event of INPUT_EVENTS) window.removeEventListener(event, mark);
    };
  }, [state.autoPaused]);

  useEffect(() => {
    if (!settings.autoPauseIdle) return;
    if (idleSeconds < settings.idleThresholdSeconds) return;
    if (!state.running || state.autoPaused) return;
    dispatch({ type: "set-auto-paused", value: true, now: Date.now() });
  }, [idleSeconds, settings.autoPauseIdle, settings.idleThresholdSeconds, state.running, state.autoPaused]);

  useEffect(() => {
    if (modeRef.current === step.mode) return;
    modeRef.current = step.mode;
    onModeChange?.(step.mode);
  }, [step.mode, onModeChange]);

  const flush = useCallback(() => {
    let next = historyRef.current;
    for (const mode of ["sitting", "standing", "moving"] as Mode[]) {
      const delta = state.session[mode] - flushedSession.current[mode];
      if (delta > 0) next = addSeconds(next, mode, delta);
    }
    const cycles = state.cycleCount - flushedCycles.current;
    if (cycles > 0) next = addCycles(next, cycles);
    if (next !== historyRef.current) setHistory(() => next);
    flushedSession.current = { ...state.session };
    flushedCycles.current = state.cycleCount;
  }, [state.session, state.cycleCount, setHistory]);

  useEffect(() => {
    saveTimer(state.index, state.remaining, state.cycleCount, state.endsAt);
  }, [state.index, state.remaining, state.cycleCount, state.endsAt]);

  useEffect(() => {
    flush();
    const id = window.setInterval(flush, FLUSH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [flush]);

  useEffect(() => {
    const onLeave = () => {
      saveTimer(state.index, state.remaining, state.cycleCount, state.endsAt);
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [state.index, state.remaining, state.cycleCount, state.endsAt]);

  const now = useCallback(() => Date.now(), []);
  const toggle = useCallback(() => dispatch({ type: "toggle", now: now() }), [now]);
  const skip = useCallback(() => {
    dispatch({ type: "skip", now: now() });
  }, [now]);
  const restart = useCallback(() => dispatch({ type: "restart", now: now() }), [now]);

  const progress = useMemo(
    () => (step.seconds > 0 ? Math.min(100, Math.max(0, ((step.seconds - state.remaining) / step.seconds) * 100)) : 0),
    [step.seconds, state.remaining],
  );

  return {
    mode: step.mode,
    remaining: state.remaining,
    running: state.running,
    autoPaused: state.autoPaused,
    idleSeconds,
    cycleCount: state.cycleCount,
    steps: state.steps,
    index: state.index,
    progress,
    session: state.session,
    dispatch,
    toggle,
    skip,
    restart,
  };
}