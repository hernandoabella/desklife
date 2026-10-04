import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";

function seedOnboarded() {
  window.localStorage.setItem(
    "deskflow.settings.v1",
    JSON.stringify({
      schema: 1,
      steps: [
        { mode: "sitting", seconds: 60 },
        { mode: "standing", seconds: 60 },
      ],
      movementGoalSeconds: 3600,
      notifications: false,
      autoPauseIdle: false,
      idleThresholdSeconds: 180,
      theme: "light",
      compact: false,
      onboarded: true,
    }),
  );
}

function seedHistory(days: Record<string, { standing: number; moving: number }>) {
  const history: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(days)) {
    history[key] = { sitting: 0, cyclesCompleted: 0, ...value };
  }
  window.localStorage.setItem("deskflow.history.v1", JSON.stringify(history));
}

function clock() {
  const card = document.querySelector(".timer") as HTMLElement;
  return card.textContent;
}

function currentMode() {
  const pill = document.querySelector(".mode-pill") as HTMLElement;
  return pill.textContent?.trim();
}

beforeEach(() => {
  window.localStorage.clear();
  window.matchMedia =
    window.matchMedia ??
    ((query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("first run", () => {
  it("walks the onboarding and starts a running timer", () => {
    render(<App />);
    expect(screen.getByText("Bienvenido a DeskFlow")).toBeTruthy();

    fireEvent.click(screen.getByText("Empezar"));
    expect(screen.getByText("Tu ciclo")).toBeTruthy();

    fireEvent.click(screen.getByText("Continuar"));
    expect(screen.getByText("Meta diaria")).toBeTruthy();

    fireEvent.click(screen.getByText("Empezar a trabajar"));

    expect(screen.queryByText("Bienvenido a DeskFlow")).toBeNull();
    expect(screen.getByText("Tu jornada")).toBeTruthy();
    expect(currentMode()).toBe("Sentado");
    expect(screen.getByText("Pausar")).toBeTruthy();
    expect(window.localStorage.getItem("deskflow.settings.v1")).toContain('"onboarded":true');
  });
});

describe("dashboard", () => {
  beforeEach(seedOnboarded);

  it("mounts without crashing and shows the first step", () => {
    render(<App />);
    expect(screen.getByText("Tu jornada")).toBeTruthy();
    expect(clock()).toBe("01:00");
    expect(currentMode()).toBe("Sentado");
  });

  it("counts down from the wall clock, not from tick count", () => {
    vi.useFakeTimers();
    const base = Date.now();
    vi.setSystemTime(base);
    render(<App />);

    act(() => {
      vi.setSystemTime(base + 30_000);
      vi.advanceTimersByTime(250);
    });
    expect(clock()).toBe("00:30");

    act(() => {
      vi.setSystemTime(base + 61_000);
      vi.advanceTimersByTime(250);
    });
    expect(currentMode()).toBe("De pie");
    expect(clock()).toBe("00:59");
  });

  it("survives a long jump without rendering NaN", () => {
    vi.useFakeTimers();
    render(<App />);
    for (let i = 0; i < 20; i++) {
      act(() => {
        vi.advanceTimersByTime(30_000);
      });
    }
    expect(document.body.textContent).not.toContain("NaN");
    expect(document.body.textContent).not.toContain("Infinity");
    expect(clock()).toMatch(/^\d{2}:\d{2}$/);
  });

  it("toggles the timer with the space bar", () => {
    render(<App />);
    expect(screen.getByText("Pausar")).toBeTruthy();

    fireEvent.keyDown(window, { key: " " });
    expect(screen.getByText("Continuar")).toBeTruthy();
    expect(clock()).toBe("01:00");

    fireEvent.keyDown(window, { key: " " });
    expect(screen.getByText("Pausar")).toBeTruthy();
  });

  it("freezes the clock while paused", () => {
    vi.useFakeTimers();
    const base = Date.now();
    vi.setSystemTime(base);
    render(<App />);
    fireEvent.keyDown(window, { key: " " });

    act(() => {
      vi.setSystemTime(base + 600_000);
      vi.advanceTimersByTime(250);
    });
    expect(clock()).toBe("01:00");
  });

  it("skips to the next step with the right arrow", () => {
    render(<App />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(currentMode()).toBe("De pie");
    expect(clock()).toBe("01:00");
  });

  it("switches views with the number keys", () => {
    render(<App />);
    fireEvent.keyDown(window, { key: "2" });
    expect(screen.getByText("HISTORIAL")).toBeTruthy();

    fireEvent.keyDown(window, { key: "3" });
    expect(screen.getByText("MOTOR DE CICLOS")).toBeTruthy();
  });

  it("does not steal keystrokes while typing in an input", () => {
    render(<App />);
    fireEvent.keyDown(window, { key: "3" });
    const input = screen.getByLabelText("Duración del paso 1");
    fireEvent.keyDown(input, { key: " " });
    fireEvent.keyDown(input, { key: "3" });
    expect(screen.getByText("MOTOR DE CICLOS")).toBeTruthy();
  });

  it("starts from real zeroes, not fabricated stats", () => {
    render(<App />);
    const summary = screen.getByText("Balance de hoy").closest(".section") as HTMLElement;
    expect(within(summary).getAllByText("00:00")).toHaveLength(3);
    expect(screen.getByText("0% del objetivo de 1h 00m")).toBeTruthy();
    expect(screen.getByText("0 ciclos completados")).toBeTruthy();
  });
});

function daysAgo(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function heroCard(label: string): HTMLElement {
  const cards = Array.from(document.querySelectorAll(".large-stat")) as HTMLElement[];
  const match = cards.find((card) => card.textContent?.includes(label));
  if (!match) throw new Error(`No hero card labelled ${label}`);
  return match;
}

describe("persistence", () => {
  beforeEach(seedOnboarded);

  it("saves accumulated time into today's history", () => {
    vi.useFakeTimers();
    const base = Date.now();
    vi.setSystemTime(base);
    render(<App />);

    act(() => {
      vi.advanceTimersByTime(130_000);
    });

    const raw = window.localStorage.getItem("deskflow.history.v1");
    expect(raw).toBeTruthy();
    const history = JSON.parse(raw as string) as Record<
      string,
      { sitting: number; standing: number; cyclesCompleted: number }
    >;
    const today = Object.values(history)[0];
    expect(today.sitting).toBe(70);
    expect(today.standing).toBe(60);
    expect(today.cyclesCompleted).toBe(1);
  });

  it("edits a step duration and persists it", () => {
    render(<App />);
    fireEvent.keyDown(window, { key: "3" });

    const input = screen.getByLabelText("Duración del paso 1");
    fireEvent.change(input, { target: { value: "25" } });
    fireEvent.blur(input);

    const settings = JSON.parse(window.localStorage.getItem("deskflow.settings.v1") as string);
    expect(settings.steps[0].seconds).toBe(1500);
  });

  it("applies the edited duration to the running timer", () => {
    render(<App />);
    fireEvent.keyDown(window, { key: "3" });

    const input = screen.getByLabelText("Duración del paso 1");
    fireEvent.change(input, { target: { value: "25" } });
    fireEvent.blur(input);

    fireEvent.keyDown(window, { key: "1" });
    expect(clock()).toBe("25:00");
  });

  it("rejects a non-numeric duration and restores the old value", () => {
    render(<App />);
    fireEvent.keyDown(window, { key: "3" });

    const input = screen.getByLabelText("Duración del paso 1") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.blur(input);

    expect(input.value).toBe("1");
  });

  it("applies a preset", () => {
    render(<App />);
    fireEvent.keyDown(window, { key: "3" });

    fireEvent.click(screen.getByText("Setup mínimo"));
    const settings = JSON.parse(window.localStorage.getItem("deskflow.settings.v1") as string);
    expect(settings.steps).toHaveLength(2);
    expect(settings.steps[0].seconds).toBe(4500);
  });

  it("adds and removes a cycle step", () => {
    render(<App />);
    fireEvent.keyDown(window, { key: "3" });

    fireEvent.click(screen.getByText("Añadir paso"));
    let settings = JSON.parse(window.localStorage.getItem("deskflow.settings.v1") as string);
    expect(settings.steps).toHaveLength(3);

    const removeButtons = screen.getAllByTitle("Quitar paso") as HTMLElement[];
    fireEvent.click(removeButtons[removeButtons.length - 1]);
    settings = JSON.parse(window.localStorage.getItem("deskflow.settings.v1") as string);
    expect(settings.steps).toHaveLength(2);
  });

  it("toggles settings and persists them", () => {
    render(<App />);
    fireEvent.keyDown(window, { key: "3" });

    fireEvent.click(screen.getByRole("switch", { name: "Pausa automática por inactividad" }));
    const settings = JSON.parse(window.localStorage.getItem("deskflow.settings.v1") as string);
    expect(settings.autoPauseIdle).toBe(true);
    expect(screen.getByLabelText("Umbral de inactividad")).toBeTruthy();
  });

  it("shows a real streak on the stats view", () => {
    seedHistory({
      [daysAgo(0)]: { standing: 3600, moving: 1800 },
      [daysAgo(-1)]: { standing: 3600, moving: 1800 },
    });

    render(<App />);
    fireEvent.keyDown(window, { key: "2" });

    const streak = heroCard("Racha");
    expect(within(streak).getByText("2")).toBeTruthy();
    expect(within(streak).getByText("días seguidos")).toBeTruthy();

    const goal = heroCard("Objetivo cumplido");
    expect(within(goal).getByText("2 días activos")).toBeTruthy();
  });

  it("shows an empty state, then a real weekday chart once there is data", () => {
    render(<App />);
    fireEvent.keyDown(window, { key: "2" });
    expect(screen.getByText(/Todavía no hay historial/)).toBeTruthy();
    cleanup();

    seedHistory({ [daysAgo(-2)]: { standing: 3600, moving: 0 } });
    render(<App />);
    fireEvent.keyDown(window, { key: "2" });

    const chart = screen.getByText("HISTORIAL").closest(".panel") as HTMLElement;
    expect(within(chart).getAllByText(/^[LMXJVSD]$/)).toHaveLength(7);
    expect(screen.queryByText(/Todavía no hay historial/)).toBeNull();
  });

  it("shows a goal line when a day reaches the goal", () => {
    seedHistory({ [daysAgo(-2)]: { standing: 3600, moving: 0 } });
    render(<App />);
    fireEvent.keyDown(window, { key: "2" });

    const chart = screen.getByText("HISTORIAL").closest(".panel") as HTMLElement;
    expect(within(chart).getByText(/objetivo 1h 00m/)).toBeTruthy();
  });

  it("hides the goal line when no day comes close to it", () => {
    seedHistory({ [daysAgo(-2)]: { standing: 60, moving: 0 } });
    render(<App />);
    fireEvent.keyDown(window, { key: "2" });

    const chart = screen.getByText("HISTORIAL").closest(".panel") as HTMLElement;
    expect(within(chart).queryByText(/objetivo 1h 00m/)).toBeNull();
  });

  it("switches the chart range", () => {
    seedHistory({ [daysAgo(-2)]: { standing: 3600, moving: 0 } });
    render(<App />);
    fireEvent.keyDown(window, { key: "2" });

    const chart = screen.getByText("HISTORIAL").closest(".panel") as HTMLElement;
    expect(within(chart).getAllByText(/^[LMXJVSD]$/)).toHaveLength(7);

    fireEvent.click(screen.getByText("90 días"));
    const wide = screen.getByText("HISTORIAL").closest(".panel") as HTMLElement;
    expect(within(wide).queryAllByText(/^[LMXJVSD]$/)).toHaveLength(0);
    expect(within(wide).getAllByText(/^\d+$/)).toHaveLength(90);
  });
});

describe("data reset", () => {
  beforeEach(seedOnboarded);

  it("clears history and settings and stays usable", () => {
    seedHistory({ "2026-01-01": { standing: 60, moving: 60 } });
    vi.stubGlobal("confirm", () => true);

    render(<App />);
    fireEvent.keyDown(window, { key: "3" });
    fireEvent.click(screen.getByText("Borrar datos"));

    expect(window.localStorage.getItem("deskflow.history.v1")).toBeNull();
    expect((document.querySelector(".topbar h1") as HTMLElement).textContent).toBe("Configuración");

    fireEvent.keyDown(window, { key: "1" });
    expect((document.querySelector(".topbar h1") as HTMLElement).textContent).toBe("Tu jornada");
    expect(clock()).toBe("50:00");
  });
});