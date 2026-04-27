const TIMELINE_STEPS = [
  { value: 0, label: "Baseline" },
  { value: 1, label: "Disruption" },
  { value: 2, label: "Reroute" },
];

export default function PlaybackBar({
  playbackStep,
  onStepChange,
  isPlaying,
  onTogglePlay,
  scenarioLabel,
  disruptionCount,
  estimatedDelayMinutes,
}) {
  return (
    <div className="playback-bar" data-testid="playback-bar">
      <div className="playback-context-row">
        <div className="playback-scenario mono">{scenarioLabel || "Route simulation"}</div>
        <div className="playback-context-chips">
          <span className="playback-context-chip">
            {disruptionCount || 0} disruption{disruptionCount === 1 ? "" : "s"}
          </span>
          <span className="playback-context-chip subtle">
            {estimatedDelayMinutes > 0 ? `+${estimatedDelayMinutes} min delay` : "No added delay"}
          </span>
        </div>
      </div>

      <div className="playback-controls-row">
        <button
          type="button"
          className="playback-toggle"
          onClick={onTogglePlay}
          data-testid="playback-play-pause-button"
        >
          {isPlaying ? "Pause" : "Play"}
        </button>

        <input
          type="range"
          min="0"
          max="2"
          step="1"
          value={playbackStep}
          onInput={(event) => onStepChange(Number(event.currentTarget.value))}
          className="playback-slider"
          data-testid="playback-slider"
        />

        <div className="playback-step-label mono" data-testid="playback-step-label">
          Step {playbackStep}: {playbackStep === 0 ? "baseline" : playbackStep === 1 ? "disruption" : "reroute"}
        </div>
      </div>

      <div className="playback-step-chips" data-testid="playback-step-chips">
        {TIMELINE_STEPS.map((step) => (
          <button
            key={step.value}
            type="button"
            className={`playback-step-chip ${playbackStep === step.value ? "active" : ""}`}
            onClick={() => onStepChange(step.value)}
          >
            {step.label}
          </button>
        ))}
      </div>
    </div>
  );
}
