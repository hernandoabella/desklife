import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Bell,
  ChevronRight,
  Clock3,
  Coffee,
  Monitor,
  Pause,
  Play,
  Settings,
  Square,
  TimerReset,
  TrendingUp,
  UserRound,
} from "lucide-react";

type Mode = "sitting" | "standing" | "moving" | "break";

const DEFAULTS = {
  sitting: 50 * 60,
  standing: 10 * 60,
  moving: 5 * 60,
};

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function modeLabel(mode: Mode) {
  return {
    sitting: "Sentado",
    standing: "De pie",
    moving: "Movimiento",
    break: "Descanso",
  }[mode];
}

function modeIcon(mode: Mode) {
  return {
    sitting: <Monitor size={18} />,
    standing: <UserRound size={18} />,
    moving: <Activity size={18} />,
    break: <Coffee size={18} />,
  }[mode];
}

export default function App() {
  const [mode, setMode] = useState<Mode>("sitting");
  const [running, setRunning] = useState(true);
  const [remaining, setRemaining] = useState(DEFAULTS.sitting);
  const [today, setToday] = useState({
    sitting: 3 * 3600 + 12 * 60,
    standing: 68 * 60,
    moving: 24 * 60,
  });
  const [view, setView] = useState<"dashboard" | "stats" | "settings">("dashboard");
  const [notifications, setNotifications] = useState(true);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          nextCycle();
          return 1;
        }
        setToday((current) => ({
          ...current,
          [mode]: mode === "break" ? current.moving : current[mode] + 1,
        }));
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, mode]);

  function nextCycle() {
    const next: Record<Mode, Mode> = {
      sitting: "standing",
      standing: "moving",
      moving: "sitting",
      break: "sitting",
    };
    const target = next[mode];
    setMode(target);
    setRemaining(DEFAULTS[target]);
    if (notifications && "Notification" in window && Notification.permission === "granted") {
      new Notification("DeskFlow", {
        body: `Es hora de pasar a: ${modeLabel(target)}.`,
      });
    }
  }

  function resetTimer() {
    setRunning(false);
    setRemaining(DEFAULTS[mode]);
  }

  const totalActive = today.sitting + today.standing + today.moving;
  const movementGoal = 2 * 3600;
  const progress = Math.min(100, Math.round(((today.standing + today.moving) / movementGoal) * 100));

  const navItems = useMemo(
    () => [
      { id: "dashboard" as const, label: "Dashboard", icon: <Clock3 size={18} /> },
      { id: "stats" as const, label: "Estadísticas", icon: <BarChart3 size={18} /> },
      { id: "settings" as const, label: "Configuración", icon: <Settings size={18} /> },
    ],
    []
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">D</div>
          <div>
            <strong>DeskFlow</strong>
            <span>Posture & Movement</span>
          </div>
        </div>

        <nav>
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              onClick={() => setView(item.id)}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="status-dot">
            <span />
            Sistema activo
          </div>
          <small>v0.1.0 · Local</small>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <span className="eyebrow">HOY</span>
            <h1>{view === "dashboard" ? "Tu jornada" : view === "stats" ? "Estadísticas" : "Configuración"}</h1>
          </div>
          <button
            className="icon-button"
            title="Activar notificaciones"
            onClick={async () => {
              if ("Notification" in window && Notification.permission !== "granted") {
                await Notification.requestPermission();
              }
              setNotifications((value) => !value);
            }}
          >
            <Bell size={18} />
          </button>
        </header>

        {view === "dashboard" && (
          <>
            <section className="hero-grid">
              <div className="timer-card">
                <div className="timer-top">
                  <div className="mode-pill">
                    {modeIcon(mode)}
                    {modeLabel(mode)}
                  </div>
                  <span className="live">● ACTIVO</span>
                </div>

                <div className="timer-content">
                  <span className="timer-label">Tiempo restante</span>
                  <div className="timer">{formatTime(remaining)}</div>
                  <p>
                    {mode === "sitting"
                      ? "Mantén una postura cómoda y cambia de posición al terminar."
                      : mode === "standing"
                        ? "Trabaja de pie y evita quedarte completamente estático."
                        : "Camina unos minutos y mueve las piernas."}
                  </p>
                </div>

                <div className="timer-actions">
                  <button className="primary-button" onClick={() => setRunning((value) => !value)}>
                    {running ? <Pause size={18} /> : <Play size={18} />}
                    {running ? "Pausar" : "Continuar"}
                  </button>
                  <button className="secondary-button" onClick={nextCycle}>
                    <ChevronRight size={18} />
                    Siguiente
                  </button>
                  <button className="ghost-button" onClick={resetTimer} title="Reiniciar">
                    <TimerReset size={18} />
                  </button>
                </div>
              </div>

              <div className="side-stack">
                <div className="metric-card">
                  <span>Tiempo activo</span>
                  <strong>{formatTime(totalActive)}</strong>
                  <small>acumulado hoy</small>
                </div>
                <div className="metric-card">
                  <span>De pie + movimiento</span>
                  <strong>{formatTime(today.standing + today.moving)}</strong>
                  <div className="progress"><i style={{ width: `${progress}%` }} /></div>
                  <small>{progress}% del objetivo de 2h</small>
                </div>
              </div>
            </section>

            <section className="section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">RESUMEN</span>
                  <h2>Balance de hoy</h2>
                </div>
                <span className="muted">Actualizado en tiempo real</span>
              </div>

              <div className="stats-grid">
                <StatCard title="Sentado" value={today.sitting} icon={<Monitor size={19} />} />
                <StatCard title="De pie" value={today.standing} icon={<UserRound size={19} />} />
                <StatCard title="Movimiento" value={today.moving} icon={<Activity size={19} />} />
              </div>
            </section>

            <section className="section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">CICLO</span>
                  <h2>Tu próximo cambio</h2>
                </div>
              </div>
              <div className="cycle-card">
                <CycleStep label="Sentado" active={mode === "sitting"} done={mode !== "sitting"} />
                <div className="cycle-line" />
                <CycleStep label="De pie" active={mode === "standing"} done={mode === "moving"} />
                <div className="cycle-line" />
                <CycleStep label="Movimiento" active={mode === "moving"} done={false} />
              </div>
            </section>
          </>
        )}

        {view === "stats" && (
          <section className="settings-panel">
            <div className="large-stat">
              <TrendingUp size={22} />
              <div>
                <span>Movimiento total</span>
                <strong>{formatTime(today.standing + today.moving)}</strong>
              </div>
            </div>
            <div className="history-grid">
              {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day, i) => (
                <div className="day-card" key={day}>
                  <span>{day}</span>
                  <div className="bar"><i style={{ height: `${35 + i * 8}%` }} /></div>
                  <strong>{i === 6 ? formatTime(today.standing + today.moving) : `${1 + (i % 3)}h ${10 + i * 4}m`}</strong>
                </div>
              ))}
            </div>
          </section>
        )}

        {view === "settings" && (
          <section className="settings-panel">
            <SettingRow label="Tiempo sentado" value="50 minutos" />
            <SettingRow label="Tiempo de pie" value="10 minutos" />
            <SettingRow label="Movimiento" value="5 minutos" />
            <SettingRow label="Notificaciones" value={notifications ? "Activadas" : "Desactivadas"} />
            <SettingRow label="Modo Focus" value="Activado" />
            <div className="info-box">
              <strong>Próximo paso</strong>
              <p>Conectar estas preferencias con almacenamiento local y añadir detección real de actividad del sistema.</p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div>
        <span>{title}</span>
        <strong>{formatTime(value)}</strong>
      </div>
    </div>
  );
}

function CycleStep({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <div className={`cycle-step ${active ? "active" : ""} ${done ? "done" : ""}`}>
      <div className="cycle-dot">{done ? "✓" : ""}</div>
      <span>{label}</span>
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="setting-row">
      <div>
        <strong>{label}</strong>
        <span>Preferencia de DeskFlow</span>
      </div>
      <button className="setting-value">{value} <ChevronRight size={16} /></button>
    </div>
  );
}