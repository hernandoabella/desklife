import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Bell, Clock3, LayoutGrid, Moon, Settings as SettingsIcon, Sun } from "lucide-react";
import { Onboarding } from "./components/Onboarding";
import { PostureTransition } from "./components/PostureArt";
import { SettingsPanel } from "./components/SettingsPanel";
import { StatsPanel } from "./components/StatsPanel";
import { CycleProgress, MODE_HINT, TimerCard, modeIcon } from "./components/TimerCard";
import { applyTheme, watchSystemTheme } from "./core/activity/theme";
import {
  isTauri,
  notifyModeChange,
  requestNotificationPermission,
} from "./core/activity/notifications";
import {
  clearAll,
  dayKey,
  formatDuration,
  goalProgress,
  loadHistory,
  loadSettings,
  movementSeconds,
  saveHistory,
  saveSettings,
  type History,
} from "./core/storage/storage";
import { useTimer } from "./core/timer/useTimer";
import type { TimerAction } from "./core/timer/reducer";
import { DEFAULT_SETTINGS, MODE_LABEL, MODES, emptyDay, type Mode, type Settings } from "./core/types";

type View = "dashboard" | "stats" | "settings";

const TRANSITION_AUTO_RESUME_SECONDS = 15;

const VIEWS: { id: View; label: string; icon: typeof Clock3; key: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: Clock3, key: "1" },
  { id: "stats", label: "Estadísticas", icon: BarChart3, key: "2" },
  { id: "settings", label: "Configuración", icon: SettingsIcon, key: "3" },
];

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [history, setHistory] = useState<History>(() => loadHistory());
  const [view, setView] = useState<View>("dashboard");
  const [historyError, setHistoryError] = useState<string | null>(null);

  const applySettingsPatch = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const applyHistory = useCallback((updater: (current: History) => History) => {
    setHistory((current) => {
      try {
        const next = updater(current);
        saveHistory(next);
        return next;
      } catch {
        setHistoryError("No se pudo guardar el historial en este dispositivo.");
        return current;
      }
    });
  }, []);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const [transition, setTransition] = useState<{ mode: Mode; seconds: number } | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  // dispatch only exists after useTimer returns, but onModeChange is passed into
  // it, so the indirection is what breaks the cycle.
  const dispatchRef = useRef<(action: TimerAction) => void>(() => {});

  const onModeChange = useCallback((mode: Mode) => {
    if (settingsRef.current.notifications) notifyModeChange(mode);
    // Pause on the posture change: the point of DeskFlow is that you actually
    // move, so the new step should not start counting down while you stand up.
    dispatchRef.current({ type: "pause", now: Date.now() });
    const step = settingsRef.current.steps.find((candidate) => candidate.mode === mode);
    setTransition({ mode, seconds: step?.seconds ?? DEFAULT_SETTINGS.steps[0].seconds });
  }, []);

  const timer = useTimer({
    settings,
    history,
    setHistory: applyHistory,
    onModeChange,
  });
  dispatchRef.current = timer.dispatch;

  const resumeFromTransition = useCallback(() => {
    setTransition(null);
    setCountdown(null);
    dispatchRef.current({ type: "resume", now: Date.now() });
  }, []);

  // Start the visible countdown, then auto-resume so the overlay can never
  // strand someone who walked away from the desk.
  useEffect(() => {
    if (!transition) return;
    setCountdown(TRANSITION_AUTO_RESUME_SECONDS);
  }, [transition]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      resumeFromTransition();
      return;
    }
    const id = window.setTimeout(() => setCountdown((value) => (value === null ? null : value - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [countdown, resumeFromTransition]);

  useEffect(() => {
    if (!transition) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") resumeFromTransition();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [transition, resumeFromTransition]);

  useEffect(() => {
    applyTheme(settings.theme);
    return watchSystemTheme(() => applyTheme(settingsRef.current.theme));
  }, [settings.theme]);

  useEffect(() => {
    document.title = timer.running
      ? `${formatDuration(timer.remaining)} · ${MODE_LABEL[timer.mode]}`
      : `DeskFlow · ${MODE_LABEL[timer.mode]}`;
  }, [timer.running, timer.remaining, timer.mode]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const step = VIEW_KEYS[event.key];
      if (step) {
        event.preventDefault();
        setView(step);
        return;
      }
      if (event.key === " ") {
        event.preventDefault();
        timer.toggle();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        timer.skip();
      } else if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        timer.restart();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [timer]);

  const today = history[dayKey()] ?? emptyDay();
  const todayMovement = movementSeconds(today);
  const progress = goalProgress(today, settings.movementGoalSeconds);
  const totalActive = today.sitting + today.standing + today.moving;

  const historyEntries = useMemo(() => Object.keys(history).length, [history]);

  function handleResetData() {
    const confirmed = window.confirm(
      "Se borrarán las preferencias y todo el historial guardado en este dispositivo. ¿Continuar?",
    );
    if (!confirmed) return;
    clearAll();
    setHistory({});
    setSettings({ ...DEFAULT_SETTINGS, onboarded: true });
    saveSettings({ ...DEFAULT_SETTINGS, onboarded: true });
  }

  function handleOnboardingFinish(steps: Settings["steps"], goalSeconds: number) {
    const next: Settings = { ...settings, steps, movementGoalSeconds: goalSeconds, onboarded: true };
    setSettings(next);
    saveSettings(next);
    timer.dispatch({ type: "resume", now: Date.now() });
  }

  if (!settings.onboarded) {
    return <Onboarding settings={settings} onFinish={handleOnboardingFinish} />;
  }

  const theme = settings.theme === "system" ? "system" : settings.theme;

  return (
    <div className={`app-shell ${settings.compact ? "compact" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">D</div>
          <div>
            <strong>DeskFlow</strong>
            <span>Posture &amp; Movement</span>
          </div>
        </div>

        <nav>
          {VIEWS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`nav-item ${view === item.id ? "active" : ""}`}
                onClick={() => setView(item.id)}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="status-dot">
            <span className={timer.running ? "live" : "idle"} />
            {timer.running ? "Ciclo en curso" : "En pausa"}
          </div>
          <div className="theme-switch">
            <button
              className={`icon-button ${theme === "light" ? "active" : ""}`}
              title="Tema claro"
              onClick={() => applySettingsPatch({ theme: "light" })}
            >
              <Sun size={16} />
            </button>
            <button
              className={`icon-button ${theme === "dark" ? "active" : ""}`}
              title="Tema oscuro"
              onClick={() => applySettingsPatch({ theme: "dark" })}
            >
              <Moon size={16} />
            </button>
            <button
              className={`icon-button ${theme === "system" ? "active" : ""}`}
              title="Tema del sistema"
              onClick={() => applySettingsPatch({ theme: "system" })}
            >
              <LayoutGrid size={16} />
            </button>
          </div>
          <small>v0.2.0 · {isTauri() ? "Escritorio" : "Navegador"}</small>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <span className="eyebrow">HOY</span>
            <h1>{view === "dashboard" ? "Tu jornada" : view === "stats" ? "Estadísticas" : "Configuración"}</h1>
          </div>
          <button
            className={`icon-button ${settings.notifications ? "active" : ""}`}
            title={settings.notifications ? "Notificaciones activadas" : "Notificaciones desactivadas"}
            onClick={async () => {
              const next = !settings.notifications;
              if (next) await requestNotificationPermission();
              applySettingsPatch({ notifications: next });
            }}
          >
            <Bell size={18} />
          </button>
        </header>

        {historyError && <div className="warning-box">{historyError}</div>}

        {view === "dashboard" && (
          <>
            <section className="hero-grid">
              <TimerCard
                mode={timer.mode}
                remaining={timer.remaining}
                progress={timer.progress}
                running={timer.running}
                autoPaused={timer.autoPaused}
                idleSeconds={timer.idleSeconds}
                notifications={settings.notifications}
                onToggle={timer.toggle}
                onSkip={timer.skip}
                onRestart={timer.restart}
                onRequestNotifications={async () => {
                  const granted = await requestNotificationPermission();
                  if (!granted) applySettingsPatch({ notifications: false });
                }}
              />

              <div className="side-stack">
                <div className="metric-card">
                  <span>Tiempo activo</span>
                  <strong>{formatDuration(totalActive)}</strong>
                  <small>acumulado hoy</small>
                </div>
                <div className="metric-card">
                  <span>De pie + movimiento</span>
                  <strong>{formatDuration(todayMovement)}</strong>
                  <div className="progress"><i style={{ width: `${progress}%` }} /></div>
                  <small>{progress}% del objetivo de {formatDuration(settings.movementGoalSeconds, "compact")}</small>
                </div>
              </div>
            </section>

            <section className="section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">RESUMEN</span>
                  <h2>Balance de hoy</h2>
                </div>
                <span className="muted">{timer.cycleCount} ciclos completados</span>
              </div>
              <div className="stats-grid">
                {MODES.map((mode) => (
                  <div className="stat-card" key={mode}>
                    <div className="stat-icon">{modeIcon(mode, 19)}</div>
                    <div>
                      <span>{MODE_LABEL[mode]}</span>
                      <strong>{formatDuration(today[mode])}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">CICLO</span>
                  <h2>Tu próximo cambio</h2>
                </div>
              </div>
              <CycleProgress steps={timer.steps} index={timer.index} />
            </section>
          </>
        )}

        {view === "stats" && (
          <StatsPanel history={history} goalSeconds={settings.movementGoalSeconds} />
        )}

        {view === "settings" && (
          <SettingsPanel
            settings={settings}
            onChange={applySettingsPatch}
            onResetData={handleResetData}
            historyEntries={historyEntries}
          />
        )}
      </main>

      {transition && (
        <PostureTransition
          mode={transition.mode}
          seconds={transition.seconds}
          hint={MODE_HINT[transition.mode]}
          countdown={countdown}
          onDismiss={resumeFromTransition}
        />
      )}
    </div>
  );
}

const VIEW_KEYS: Record<string, View | undefined> = {
  "1": "dashboard",
  "2": "stats",
  "3": "settings",
};