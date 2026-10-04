import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";

/**
 * The posture indicator art and the change-of-posture prompt.
 *
 * The images are asserted on via alt text rather than src: Vite rewrites the
 * asset filename to a content hash at build time, so the URL is not stable.
 */

function seedOnboarded() {
  window.localStorage.setItem(
    "deskflow.settings.v1",
    JSON.stringify({
      schema: 1,
      steps: [
        { mode: "sitting", seconds: 60 },
        { mode: "standing", seconds: 60 },
        { mode: "moving", seconds: 60 },
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

function postureImages() {
  return Array.from(document.querySelectorAll("img.posture-art")) as HTMLImageElement[];
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

describe("posture indicator art", () => {
  beforeEach(seedOnboarded);

  it("shows the illustration for the posture in progress", () => {
    render(<App />);
    const inline = document.querySelector(".posture-inline img.posture-art") as HTMLImageElement;
    expect(inline).toBeTruthy();
    expect(inline.alt).toBe("Ilustración: sentado");
    expect(inline.getAttribute("src")).toBeTruthy();
  });

  it("gives every cycle step its own illustration", () => {
    render(<App />);
    const steps = document.querySelectorAll(".cycle-step");
    expect(steps).toHaveLength(3);
    for (const step of steps) {
      // Thumbnails are decorative: the mode name sits right next to them.
      expect(step.querySelector("img.posture-art")?.getAttribute("alt")).toBe("");
    }
  });

  it("uses a different image per posture", () => {
    render(<App />);
    const sources = postureImages().map((image) => image.getAttribute("src"));
    expect(new Set(sources).size).toBe(3);
  });

  it("swaps the illustration when the posture changes", () => {
    render(<App />);
    const before = (document.querySelector(".posture-inline img.posture-art") as HTMLImageElement).getAttribute("src");

    fireEvent.click(screen.getByText("Siguiente"));

    const after = (document.querySelector(".posture-inline img.posture-art") as HTMLImageElement).getAttribute("src");
    expect(after).not.toBe(before);
  });
});

describe("change of posture prompt", () => {
  beforeEach(seedOnboarded);

  it("opens on a posture change and pauses the cycle", () => {
    render(<App />);
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByText("Siguiente"));

    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("CAMBIO DE POSTURA");
    expect(dialog.textContent).toContain("De pie");
    // The new step must not burn away while the user is still standing up.
    expect(screen.getByText("Continuar")).toBeTruthy();
    expect(document.querySelector(".live")?.textContent).toContain("EN PAUSA");
  });

  it("shows the illustration of the posture being started", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Siguiente"));

    const figure = document.querySelector(".posture-figure img.posture-art") as HTMLImageElement;
    expect(figure.alt).toBe("Ilustración: de pie");
  });

  it("resumes the cycle when Empezar is pressed", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Siguiente"));
    expect(screen.queryByRole("dialog")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Empezar/ }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Pausar")).toBeTruthy();
    expect((document.querySelector(".mode-pill") as HTMLElement).textContent).toContain("De pie");
  });

  it("closes on Escape", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Siguiente"));

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("auto-closes after the countdown so it cannot strand the user", () => {
    vi.useFakeTimers();
    render(<App />);

    act(() => {
      fireEvent.click(screen.getByText("Siguiente"));
    });
    expect(screen.queryByRole("dialog")).toBeTruthy();

    // Each tick re-arms the next timer through an effect, so every second needs
    // its own act() for React to flush the state update and register the next one.
    for (let i = 0; i < 16; i += 1) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Pausar")).toBeTruthy();
  });

  it("does not open on first paint, only on an actual change", () => {
    render(<App />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});