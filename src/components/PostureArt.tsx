import { MODE_LABEL, type Mode } from "../core/types";

import sittingArt from "../assets/posture/sitting.png";
import standingArt from "../assets/posture/standing.png";
import movingArt from "../assets/posture/moving.png";

/** Illustration for each posture, bundled through Vite so it hashes + minifies. */
export const POSTURE_ART: Record<Mode, string> = {
  sitting: sittingArt,
  standing: standingArt,
  moving: movingArt,
};

interface PostureArtProps {
  mode: Mode;
  /** Rendered width/height in px. The sources are square. */
  size?: number;
  className?: string;
  /**
   * Decorative by default. The mode is always announced by adjacent text, so
   * pass `alt=""` for the small repeated thumbnails to keep the a11y tree clean.
   */
  alt?: string;
}

/**
 * The posture indicator. Each mode has a flat-vector illustration so a posture
 * change is readable at a glance without having to read the label.
 */
export function PostureArt({ mode, size = 120, className = "", alt }: PostureArtProps) {
  return (
    <img
      src={POSTURE_ART[mode]}
      alt={alt ?? `Ilustración: ${MODE_LABEL[mode].toLowerCase()}`}
      width={size}
      height={size}
      className={`posture-art ${className}`.trim()}
      style={{ width: size, height: size }}
      draggable={false}
    />
  );
}

interface PostureTransitionProps {
  mode: Mode;
  /** Duration of the step that is starting, in seconds. */
  seconds: number;
  hint: string;
  onDismiss: () => void;
  /** Seconds left on the dismiss button; null renders a plain button. */
  countdown: number | null;
}

/**
 * Full-screen posture change prompt.
 *
 * The timer is paused while this is open on purpose: the entire point of
 * DeskFlow is that you physically change posture, so the new step should not
 * start burning away while you are still standing up.
 */
export function PostureTransition({ mode, seconds, hint, onDismiss, countdown }: PostureTransitionProps) {
  const minutes = Math.round(seconds / 60);

  return (
    <div className="posture-overlay" role="dialog" aria-modal="true" aria-label={`Cambio de postura: ${MODE_LABEL[mode]}`}>
      <div className="posture-sheet">
        <span className="eyebrow">CAMBIO DE POSTURA</span>

        <div className="posture-figure">
          <PostureArt mode={mode} size={240} />
        </div>

        <h2 className="posture-title">{MODE_LABEL[mode]}</h2>
        <p className="posture-hint">{hint}</p>
        <span className="posture-duration">{minutes} min</span>

        <button className="primary-button wide" onClick={onDismiss} autoFocus>
          {countdown === null ? "Empezar" : `Empezar (${countdown}s)`}
        </button>
      </div>
    </div>
  );
}