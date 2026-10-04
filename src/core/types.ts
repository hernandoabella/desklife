export type Mode = "sitting" | "standing" | "moving";

export type ModeKey = Mode;

export const MODES: Mode[] = ["sitting", "standing", "moving"];

export const MODE_LABEL: Record<Mode, string> = {
  sitting: "Sentado",
  standing: "De pie",
  moving: "Movimiento",
};

export interface CycleStep {
  mode: Mode;
  seconds: number;
}

export interface Settings {
  schema: 1;
  steps: CycleStep[];
  movementGoalSeconds: number;
  notifications: boolean;
  autoPauseIdle: boolean;
  idleThresholdSeconds: number;
  theme: "light" | "dark" | "system";
  compact: boolean;
  onboarded: boolean;
}

export interface DayStats {
  sitting: number;
  standing: number;
  moving: number;
  cyclesCompleted: number;
}

export type ModeTotals = Record<ModeKey, number>;

export function emptyTotals(): ModeTotals {
  return { sitting: 0, standing: 0, moving: 0 };
}

export function emptyDay(): DayStats {
  return { sitting: 0, standing: 0, moving: 0, cyclesCompleted: 0 };
}

export const MIN_STEP_SECONDS = 60;
export const MAX_STEP_SECONDS = 6 * 60 * 60;

export const DEFAULT_SETTINGS: Settings = {
  schema: 1,
  steps: [
    { mode: "sitting", seconds: 50 * 60 },
    { mode: "standing", seconds: 10 * 60 },
    { mode: "moving", seconds: 5 * 60 },
  ],
  movementGoalSeconds: 2 * 60 * 60,
  notifications: true,
  autoPauseIdle: false,
  idleThresholdSeconds: 3 * 60,
  theme: "system",
  compact: false,
  onboarded: false,
};