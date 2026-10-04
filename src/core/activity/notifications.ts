import { MODE_LABEL, type Mode } from "../types";

interface TauriInternals {
  invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
}

function tauriInvoke(): ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null {
  const internals = (window as unknown as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;
  if (internals && typeof internals.invoke === "function") {
    return internals.invoke.bind(internals);
  }
  return null;
}

export function isTauri(): boolean {
  return tauriInvoke() !== null;
}

let nativeNotificationsBroken = false;

async function notifyNative(title: string, body: string): Promise<boolean> {
  const invoke = tauriInvoke();
  if (!invoke || nativeNotificationsBroken) return false;
  try {
    await invoke("plugin:notification|notify", {
      options: { title, body },
    });
    return true;
  } catch {
    nativeNotificationsBroken = true;
    return false;
  }
}

function notifyWeb(title: string, body: string): boolean {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;
  try {
    new Notification(title, { body });
    return true;
  } catch {
    return false;
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    const result = await Notification.requestPermission();
    return result === "granted";
  } catch {
    return false;
  }
}

export function notify(title: string, body: string) {
  void notifyNative(title, body).then((delivered) => {
    if (!delivered) notifyWeb(title, body);
  });
}

export function notifyModeChange(mode: Mode) {
  notify("DeskFlow", `Es hora de pasar a: ${MODE_LABEL[mode]}.`);
}