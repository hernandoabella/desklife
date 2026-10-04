import {
  Activity,
  Bell,
  ChevronRight,
  Coffee,
  Monitor,
  Pause,
  Play,
  TimerReset,
  UserRound,
} from "lucide-react";
import { formatDuration } from "../core/storage/storage";
import { MODE_LABEL, type CycleStep, type Mode } from "../core/types";
import { PostureArt } from "./PostureArt";

export function modeIcon(mode: Mode, size = 18) {
  switch (mode) {
    case "sitting":
      return <Monitor size={size} />;
    case "standing":
      return <UserRound size={size} />;
    case "moving":
      return <Activity size={size} />;
    default:
      return <Coffee size={size} />;
  }
}

export const MODE_HINT: Record<Mode, string> = {
  sitting: "Mantén una postura cómoda y cambia de posición al terminar.",
  standing: "Trabaja de pie y evita quedarte completamente estático.",
  moving: "Camina unos minutos y mueve las piernas.",
};

interface TimerCardProps {
  mode: Mode;
  remaining: number;
  progress: number;
  running: boolean;
  autoPaused: boolean;
  idleSeconds: number;
  notifications: boolean;
  onToggle: () => void;
  onSkip: () => void;
  onRestart: () => void;
  onRequestNotifications: () => void;
}

export function TimerCard({
  mode,
  remaining,
  progress,
  running,
  autoPaused,
  idleSeconds,
  notifications,
  onToggle,
  onSkip,
  onRestart,
  onRequestNotifications,
}: TimerCardProps) {
  const needsPermission = notifications && typeof Notification !== "undefined" && Notification.permission === "default";

  const status = autoPaused
    ? "PAUSA AUTO"
    : running
      ? "ACTIVO"
      : "EN PAUSA";

  return (
    <div className="timer-card">
      <div className="timer-top">
        <div className="mode-pill">
          {modeIcon(mode)}
          {MODE_LABEL[mode]}
        </div>
        <span className={`live ${autoPaused ? "paused" : ""}`}>● {status}</span>
      </div>

      <div className="timer-content">
        <div className="posture-inline">
          <PostureArt mode={mode} size={112} />
        </div>
        <span className="timer-label">Tiempo restante</span>
        <div className="timer" aria-live="off">
          {formatDuration(remaining)}
        </div>
        <div className="timer-progress" aria-hidden="true">
          <i style={{ width: `${progress}%` }} />
        </div>
        <p>{MODE_HINT[mode]}</p>
        {autoPaused && (
          <p className="auto-pause-note">
            Detectados {formatDuration(idleSeconds, "compact")} sin actividad. Pulsa Continuar cuando vuelvas.
          </p>
        )}
      </div>

      <div className="timer-actions">
        <button className="primary-button" onClick={onToggle}>
          {running ? <Pause size={18} /> : <Play size={18} />}
          {running ? "Pausar" : "Continuar"}
        </button>
        <button className="secondary-button" onClick={onSkip}>
          <ChevronRight size={18} />
          Siguiente
        </button>
        <button className="ghost-button" onClick={onRestart} title="Reiniciar ciclo">
          <TimerReset size={18} />
        </button>
        {needsPermission && (
          <button className="ghost-button" onClick={onRequestNotifications} title="Activar notificaciones">
            <Bell size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

interface CycleProgressProps {
  steps: CycleStep[];
  index: number;
}

export function CycleProgress({ steps, index }: CycleProgressProps) {
  return (
    <div className="cycle-card">
      {steps.map((step, i) => (
        <CycleStep
          key={`${step.mode}-${i}`}
          mode={step.mode}
          label={MODE_LABEL[step.mode]}
          duration={formatDuration(step.seconds, "compact")}
          active={i === index}
          done={i < index}
          last={i === steps.length - 1}
        />
      ))}
    </div>
  );
}

function CycleStep({
  mode,
  label,
  duration,
  active,
  done,
  last,
}: {
  mode: Mode;
  label: string;
  duration: string;
  active: boolean;
  done: boolean;
  last: boolean;
}) {
  return (
    <>
      <div className={`cycle-step ${active ? "active" : ""} ${done ? "done" : ""}`}>
        <div className="cycle-dot">{done && !active ? "✓" : ""}</div>
        <PostureArt mode={mode} size={52} alt="" />
        <span>{label}</span>
        <small>{duration}</small>
      </div>
      {!last && <div className={`cycle-line ${done ? "done" : ""}`} />}
    </>
  );
}