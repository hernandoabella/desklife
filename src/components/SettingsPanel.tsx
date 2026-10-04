import { Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  clampDuration,
  cycleSummary,
  formatDuration,
  formatMinutesInput,
  parseDurationInput,
} from "../core/storage/storage";
import { totalCycleSeconds } from "../core/timer/reducer";
import { MODE_LABEL, MODES, type CycleStep, type Settings } from "../core/types";
import { isTauri } from "../core/activity/notifications";

interface SettingsPanelProps {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onResetData: () => void;
  historyEntries: number;
}

export function SettingsPanel({ settings, onChange, onResetData, historyEntries }: SettingsPanelProps) {
  const cycleSeconds = totalCycleSeconds(settings.steps);

  function updateStep(index: number, patch: Partial<CycleStep>) {
    const steps = settings.steps.map((step, i) => (i === index ? { ...step, ...patch } : step));
    onChange({ steps });
  }

  function addStep() {
    const last = settings.steps[settings.steps.length - 1];
    const used = settings.steps.map((step) => step.mode);
    const nextMode = MODES.find((mode) => !used.includes(mode)) ?? last.mode;
    onChange({ steps: [...settings.steps, { mode: nextMode, seconds: 5 * 60 }] });
  }

  function removeStep(index: number) {
    if (settings.steps.length <= 1) return;
    onChange({ steps: settings.steps.filter((_, i) => i !== index) });
  }

  function applyPreset(preset: Settings["steps"]) {
    onChange({ steps: preset });
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">MOTOR DE CICLOS</span>
            <h2>Tu secuencia</h2>
          </div>
          <span className="muted">
            Ciclo de {formatDuration(cycleSeconds, "compact")} · {settings.steps.length} pasos
          </span>
        </div>

        <div className="steps-list">
          {settings.steps.map((step, i) => (
            <div className="step-row" key={`${i}-${step.mode}`}>
              <span className="step-index">{i + 1}</span>
              <select
                value={step.mode}
                onChange={(event) => updateStep(i, { mode: event.target.value as CycleStep["mode"] })}
                aria-label={`Modo del paso ${i + 1}`}
              >
                {MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {MODE_LABEL[mode]}
                  </option>
                ))}
              </select>
              <DurationInput
                seconds={step.seconds}
                onCommit={(seconds) => updateStep(i, { seconds })}
                ariaLabel={`Duración del paso ${i + 1}`}
              />
              <button
                className="ghost-button"
                onClick={() => removeStep(i)}
                disabled={settings.steps.length <= 1}
                title="Quitar paso"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>

        <div className="row-actions">
          <button className="secondary-button" onClick={addStep}>
            <Plus size={16} />
            Añadir paso
          </button>
        </div>

        <p className="hint">{cycleSummary(settings.steps)}</p>

        <div className="preset-row">
          <span className="eyebrow">PRESETS</span>
          {PRESETS.map((preset) => (
            <button key={preset.name} className="chip" onClick={() => applyPreset(preset.steps)}>
              {preset.name}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">OBJETIVO</span>
            <h2>Meta diaria de movimiento</h2>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <strong>De pie + movimiento</strong>
            <span>Actualmente {formatDuration(settings.movementGoalSeconds, "compact")} por día</span>
          </div>
          <DurationInput
            seconds={settings.movementGoalSeconds}
            onCommit={(seconds) => onChange({ movementGoalSeconds: clampDuration(seconds) })}
            ariaLabel="Meta diaria"
          />
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">COMPORTAMIENTO</span>
            <h2>Notificaciones e inactividad</h2>
          </div>
        </div>

        <ToggleRow
          label="Notificaciones"
          hint={isTauri() ? "Notificaciones nativas del sistema" : "Notificaciones del navegador"}
          value={settings.notifications}
          onChange={(value) => onChange({ notifications: value })}
        />

        <ToggleRow
          label="Pausa automática por inactividad"
          hint={`Se pausa tras ${formatDuration(settings.idleThresholdSeconds, "compact")} sin actividad`}
          value={settings.autoPauseIdle}
          onChange={(value) => onChange({ autoPauseIdle: value })}
        />

        {settings.autoPauseIdle && (
          <div className="setting-row">
            <div>
              <strong>Umbral de inactividad</strong>
              <span>Tiempo sin actividad antes de pausar</span>
            </div>
            <DurationInput
              seconds={settings.idleThresholdSeconds}
              onCommit={(seconds) => onChange({ idleThresholdSeconds: clampDuration(seconds) })}
              ariaLabel="Umbral de inactividad"
            />
          </div>
        )}

        <div className="setting-row">
          <div>
            <strong>Apariencia</strong>
            <span>Tema de la interfaz</span>
          </div>
          <div className="segmented">
            {(["light", "dark", "system"] as const).map((value) => (
              <button
                key={value}
                className={settings.theme === value ? "active" : ""}
                onClick={() => onChange({ theme: value })}
              >
                {value === "light" ? "Claro" : value === "dark" ? "Oscuro" : "Sistema"}
              </button>
            ))}
          </div>
        </div>

        <ToggleRow
          label="Vista compacta"
          hint="Reloj grande sin paneles laterales"
          value={settings.compact}
          onChange={(value) => onChange({ compact: value })}
        />
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">DATOS</span>
            <h2>Almacenamiento local</h2>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <strong>{historyEntries} días guardados</strong>
            <span>Todo se guarda en este dispositivo. No se envía nada a ningún servidor.</span>
          </div>
          <button className="danger-button" onClick={onResetData}>
            <RotateCcw size={16} />
            Borrar datos
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">ATAJOS</span>
            <h2>Teclado</h2>
          </div>
        </div>
        <div className="shortcuts">
          {[
            ["Espacio", "Pausar / continuar"],
            ["→", "Siguiente paso"],
            ["R", "Reiniciar paso"],
            ["1 / 2 / 3", "Cambiar de vista"],
          ].map(([key, action]) => (
            <div className="shortcut-row" key={key}>
              <kbd>{key}</kbd>
              <span>{action}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function DurationInput({
  seconds,
  onCommit,
  ariaLabel,
}: {
  seconds: number;
  onCommit: (seconds: number) => void;
  ariaLabel: string;
}) {
  return (
    <div className="duration-input">
      <input
        key={seconds}
        defaultValue={formatMinutesInput(seconds)}
        aria-label={ariaLabel}
        inputMode="numeric"
        onBlur={(event) => {
          const parsed = parseDurationInput(event.target.value);
          if (parsed === null) {
            event.target.value = formatMinutesInput(seconds);
            return;
          }
          onCommit(parsed);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      <span>min</span>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="setting-row">
      <div>
        <strong>{label}</strong>
        <span>{hint}</span>
      </div>
      <button
        className={`toggle ${value ? "on" : ""}`}
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
      >
        <i />
      </button>
    </div>
  );
}

const PRESETS: { name: string; steps: CycleStep[] }[] = [
  {
    name: "Clásico 50/10/5",
    steps: [
      { mode: "sitting", seconds: 50 * 60 },
      { mode: "standing", seconds: 10 * 60 },
      { mode: "moving", seconds: 5 * 60 },
    ],
  },
  {
    name: "Setup mínimo",
    steps: [
      { mode: "sitting", seconds: 75 * 60 },
      { mode: "standing", seconds: 15 * 60 },
    ],
  },
  {
    name: "Reuniones largas",
    steps: [
      { mode: "sitting", seconds: 90 * 60 },
      { mode: "moving", seconds: 10 * 60 },
    ],
  },
  {
    name: "Ritmo corto",
    steps: [
      { mode: "sitting", seconds: 25 * 60 },
      { mode: "standing", seconds: 5 * 60 },
      { mode: "moving", seconds: 3 * 60 },
      { mode: "sitting", seconds: 25 * 60 },
      { mode: "standing", seconds: 5 * 60 },
      { mode: "moving", seconds: 3 * 60 },
    ],
  },
];