import { useMemo, useState } from "react";
import { Activity, Monitor, TrendingUp, UserRound } from "lucide-react";
import {
  computeStreak,
  formatDuration,
  goalProgress,
  lastDayEntries,
  movementSeconds,
  totalsOf,
  weekdayLabel,
  type History,
} from "../core/storage/storage";
import { MODE_LABEL, MODES } from "../core/types";
import { modeIcon } from "./TimerCard";

type Range = 7 | 30 | 90;

const RANGE_LABELS: Record<Range, string> = { 7: "7 días", 30: "30 días", 90: "90 días" };

interface StatsPanelProps {
  history: History;
  goalSeconds: number;
}

export function StatsPanel({ history, goalSeconds }: StatsPanelProps) {
  const [range, setRange] = useState<Range>(7);

  const entries = useMemo(() => lastDayEntries(history, range), [history, range]);
  const totals = useMemo(() => totalsOf(entries.map((entry) => entry.stats)), [entries]);
  const streak = useMemo(() => computeStreak(history, goalSeconds), [history, goalSeconds]);

  const maxMovement = useMemo(
    () => Math.max(1, ...entries.map((entry) => movementSeconds(entry.stats))),
    [entries],
  );

  const activeDays = useMemo(
    () => entries.filter((entry) => entry.stats.sitting + entry.stats.standing + entry.stats.moving > 0).length,
    [entries],
  );

  const goalHits = useMemo(
    () => entries.filter((entry) => goalProgress(entry.stats, goalSeconds) >= 100).length,
    [entries, goalSeconds],
  );

  const goalPercent = Math.min(100, (goalSeconds / maxMovement) * 100);
  const showGoalLine = goalSeconds <= maxMovement && activeDays > 0;

  const today = entries.length > 0 ? entries[entries.length - 1].stats : { sitting: 0, standing: 0, moving: 0, cyclesCompleted: 0 };

  return (
    <div className="stack">
      <section className="hero-stats">
        <div className="large-stat">
          <TrendingUp size={22} />
          <div>
            <span>Movimiento del periodo</span>
            <strong>{formatDuration(movementSeconds(totals), "compact")}</strong>
          </div>
        </div>
        <div className="large-stat">
          <div className="streak-badge">{streak}</div>
          <div>
            <span>Racha</span>
            <strong>{streak === 1 ? "día seguido" : "días seguidos"}</strong>
          </div>
        </div>
        <div className="large-stat">
          <div className="streak-badge">{goalHits}</div>
          <div>
            <span>Objetivo cumplido</span>
            <strong>{activeDays} días activos</strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">HISTORIAL</span>
            <h2>De pie + movimiento</h2>
          </div>
          <div className="segmented">
            {([7, 30, 90] as Range[]).map((value) => (
              <button key={value} className={range === value ? "active" : ""} onClick={() => setRange(value)}>
                {RANGE_LABELS[value]}
              </button>
            ))}
          </div>
        </div>

        {activeDays === 0 ? (
          <p className="empty-state">
            Todavía no hay historial. Deja correr el temporizador y tus días aparecerán aquí.
          </p>
        ) : (
          <div className="chart">
            {showGoalLine && (
              <div className="chart-goal" style={{ bottom: `${goalPercent}%` }}>
                <span>objetivo {formatDuration(goalSeconds, "compact")}</span>
              </div>
            )}
            <div className="history-grid">
              {entries.map((entry) => {
                const seconds = movementSeconds(entry.stats);
                const height = (seconds / maxMovement) * 100;
                return (
                  <div
                    className="day-card"
                    key={entry.key}
                    title={`${entry.key} · ${formatDuration(seconds, "compact")}`}
                  >
                    <div className="bar">
                      <i className={goalProgress(entry.stats, goalSeconds) >= 100 ? "hit" : ""} style={{ height: `${Math.max(height, seconds > 0 ? 4 : 0)}%` }} />
                    </div>
                    <span>{range === 7 ? weekdayLabel(entry.key) : entry.date.getDate()}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">REPARTO</span>
            <h2>Balance del periodo</h2>
          </div>
          <span className="muted">{totals.cyclesCompleted} ciclos completados</span>
        </div>
        <div className="stats-grid">
          {MODES.map((mode) => (
            <div className="stat-card" key={mode}>
              <div className="stat-icon">{modeIcon(mode, 19)}</div>
              <div>
                <span>{MODE_LABEL[mode]}</span>
                <strong>{formatDuration(totals[mode], "compact")}</strong>
              </div>
            </div>
          ))}
        </div>
        <BreakdownBar totals={totals} />
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">HOY</span>
            <h2>Detalle de hoy</h2>
          </div>
          <span className="muted">{goalProgress(today, goalSeconds)}% del objetivo</span>
        </div>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon"><Monitor size={19} /></div>
            <div>
              <span>Sentado</span>
              <strong>{formatDuration(today.sitting, "compact")}</strong>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><UserRound size={19} /></div>
            <div>
              <span>De pie</span>
              <strong>{formatDuration(today.standing, "compact")}</strong>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><Activity size={19} /></div>
            <div>
              <span>Movimiento</span>
              <strong>{formatDuration(today.moving, "compact")}</strong>
            </div>
          </div>
        </div>
        <div className="progress"><i style={{ width: `${goalProgress(today, goalSeconds)}%` }} /></div>
      </section>
    </div>
  );
}

function BreakdownBar({ totals }: { totals: { sitting: number; standing: number; moving: number } }) {
  const total = totals.sitting + totals.standing + totals.moving;
  if (total <= 0) return null;
  return (
    <div className="breakdown">
      {MODES.map((mode) => (
        <i
          key={mode}
          className={`seg-${mode}`}
          style={{ width: `${(totals[mode] / total) * 100}%` }}
          title={`${MODE_LABEL[mode]}: ${formatDuration(totals[mode], "compact")}`}
        />
      ))}
    </div>
  );
}