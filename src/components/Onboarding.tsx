import { useState } from "react";
import { formatDuration } from "../core/storage/storage";
import { MODE_LABEL, type CycleStep, type Settings } from "../core/types";

const WELCOME_STEPS = [
  { mode: "sitting", seconds: 50 * 60 },
  { mode: "standing", seconds: 10 * 60 },
  { mode: "moving", seconds: 5 * 60 },
] as CycleStep[];

interface OnboardingProps {
  settings: Settings;
  onFinish: (steps: CycleStep[], goalSeconds: number) => void;
}

export function Onboarding({ settings, onFinish }: OnboardingProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [steps, setSteps] = useState<CycleStep[]>(WELCOME_STEPS);
  const [goalSeconds, setGoalSeconds] = useState(settings.movementGoalSeconds);

  const cycleSeconds = steps.reduce((sum, step) => sum + step.seconds, 0);

  function setStepDuration(index: number, minutes: number) {
    setSteps((current) =>
      current.map((step, i) => (i === index ? { ...step, seconds: Math.max(1, minutes) * 60 } : step)),
    );
  }

  if (stepIndex === 0) {
    return (
      <div className="onboarding">
        <div className="onboarding-card">
          <div className="brand-mark large">D</div>
          <h1>Bienvenido a DeskFlow</h1>
          <p className="lead">
            DeskFlow te recuerda cuándo cambiar de postura durante la jornada. Tres pasos y empiezas.
          </p>
          <div className="onboarding-dots">
            <i className="active" /><i /><i />
          </div>
          <button className="primary-button wide" onClick={() => setStepIndex(1)}>
            Empezar
          </button>
        </div>
      </div>
    );
  }

  if (stepIndex === 1) {
    return (
      <div className="onboarding">
        <div className="onboarding-card">
          <span className="eyebrow">PASO 1 DE 2</span>
          <h1>Tu ciclo</h1>
          <p className="lead">Ajusta las duraciones. Se repiten en bucle durante el día.</p>

          <div className="steps-list">
            {steps.map((step, i) => (
              <div className="step-row" key={i}>
                <span className="step-index">{i + 1}</span>
                <span className="step-name">{MODE_LABEL[step.mode]}</span>
                <div className="duration-input">
                  <input
                    type="number"
                    min={1}
                    max={360}
                    value={Math.round(step.seconds / 60)}
                    aria-label={`Minutos de ${MODE_LABEL[step.mode]}`}
                    onChange={(event) => setStepDuration(i, Number(event.target.value) || 1)}
                  />
                  <span>min</span>
                </div>
              </div>
            ))}
          </div>

          <p className="hint">
            Ciclo completo de {formatDuration(cycleSeconds, "compact")} · 8 ciclos ≈
            {" "}{formatDuration(cycleSeconds * 8, "compact")} de jornada
          </p>

          <div className="onboarding-dots">
            <i /><i className="active" /><i />
          </div>
          <div className="row-actions center">
            <button className="secondary-button" onClick={() => setStepIndex(0)}>Atrás</button>
            <button className="primary-button" onClick={() => setStepIndex(2)}>Continuar</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <span className="eyebrow">PASO 2 DE 2</span>
        <h1>Meta diaria</h1>
        <p className="lead">Cuánto tiempo de pie + movimiento quieres alcanzar cada día.</p>

        <div className="goal-picker">
          {[30, 60, 90, 120, 180].map((minutes) => (
            <button
              key={minutes}
              className={`chip ${goalSeconds === minutes * 60 ? "active" : ""}`}
              onClick={() => setGoalSeconds(minutes * 60)}
            >
              {formatDuration(minutes * 60, "compact")}
            </button>
          ))}
        </div>

        <div className="onboarding-dots">
          <i /><i /><i className="active" />
        </div>
        <div className="row-actions center">
          <button className="secondary-button" onClick={() => setStepIndex(1)}>Atrás</button>
          <button className="primary-button" onClick={() => onFinish(steps, goalSeconds)}>
            Empezar a trabajar
          </button>
        </div>
      </div>
    </div>
  );
}