function formatDistance(distanceM) {
  if (!Number.isFinite(distanceM)) {
    return "—";
  }
  return (distanceM / 1000).toFixed(1);
}

function formatDuration(durationS) {
  if (!Number.isFinite(durationS)) {
    return "—";
  }

  const totalMinutes = Math.round(durationS / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;

  const parts = [];
  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0 || parts.length === 0) {
    parts.push(`${minutes}m`);
  }

  return parts.join(" ");
}

function formatDurationDelta(currentS, baselineS) {
  if (!Number.isFinite(currentS) || !Number.isFinite(baselineS)) {
    return null;
  }
  const delta = currentS - baselineS;
  const formatted = formatDuration(Math.abs(delta));
  const sign = delta >= 0 ? "+" : "−";
  return `${sign}${formatted}`;
}

function formatCurrency(value) {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return `$${value.toFixed(0)}`;
}

function formatDelta(current, baseline, suffix = "") {
  if (!Number.isFinite(current) || !Number.isFinite(baseline)) {
    return null;
  }

  const delta = current - baseline;
  const sign = delta >= 0 ? "+" : "−";
  const absolute = Math.abs(delta);
  return `${sign}${absolute.toFixed(1)}${suffix}`;
}

function MetricCard({ title, value, baseline, delta, testId, suffix = "", icon, iconColor = "teal" }) {
  const deltaClass = delta ? (delta.startsWith("+") ? "negative" : "positive") : "";

  return (
    <div className="metric-card" data-testid={testId}>
      <div className={`metric-icon ${iconColor}`}>
        <span className="lucide" data-lucide={icon} style={{ width: 16, height: 16 }} />
      </div>
      <div className="metric-title">{title}</div>
      <div className="metric-value mono">
        {value}{suffix}
      </div>
      {baseline ? <div className="metric-baseline">was {baseline}{suffix}</div> : null}
      {delta ? <div className={`metric-delta ${deltaClass}`}>{delta}</div> : null}
    </div>
  );
}

function calculateDurationSeconds(distanceM, speedKmh) {
  if (!Number.isFinite(distanceM) || !Number.isFinite(speedKmh) || speedKmh <= 0) {
    return NaN;
  }
  return (distanceM / 1000 / speedKmh) * 3600;
}

export default function MetricsPanel({
  baselineMetrics,
  rerouteMetrics,
  activeDisruption,
  vehicleSpeed,
  onVehicleSpeedChange,
}) {
  const currentMetrics = rerouteMetrics || baselineMetrics;
  const hasReroute = Boolean(rerouteMetrics && baselineMetrics);
  const currentDurationS = calculateDurationSeconds(currentMetrics?.distance_m, vehicleSpeed);
  const baselineDurationS = hasReroute
    ? calculateDurationSeconds(baselineMetrics.distance_m, vehicleSpeed)
    : null;

  return (
    
    <section className="metrics-panel" data-testid="metrics-panel">
      
      <div className="section-header">
        <div className="section-icon">
          <span className="lucide" data-lucide="bar-chart-3" style={{ width: 16, height: 16 }} />
        </div>
        <span className="section-title">Metrics</span>
      
        
      </div>
      

      <MetricCard
        title="Distance"
        value={formatDistance(currentMetrics?.distance_m)}
        baseline={hasReroute ? formatDistance(baselineMetrics.distance_m) : null}
        delta={
          hasReroute
            ? formatDelta(currentMetrics.distance_m / 1000, baselineMetrics.distance_m / 1000, " km")
            : null
        }
        suffix=" km"
        icon="route"
        iconColor="teal"
        testId="metric-distance-card"
      />

      <MetricCard
        title="Est. Duration"
        value={formatDuration(currentDurationS)}
        baseline={hasReroute ? formatDuration(baselineDurationS) : null}
        delta={hasReroute ? formatDurationDelta(currentDurationS, baselineDurationS) : null}
        icon="clock"
        iconColor="amber"
        testId="metric-time-card"
      />

      <div className="metric-card speed-card full-width" data-testid="metric-speed-card">
        <div className="section-header" style={{ marginBottom: 0 }}>
          <div className="section-icon emerald">
            <span className="lucide" data-lucide="gauge" style={{ width: 16, height: 16 }} />
          </div>
          <div>
            <div className="metric-title">Vehicle Speed</div>
            <div className="metric-value mono">{vehicleSpeed} <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 500 }}>km/h</span></div>
          </div>
        </div>
        <input
          type="range"
          min="20"
          max="120"
          step="5"
          value={vehicleSpeed ?? 80}
          onInput={(event) => onVehicleSpeedChange(Number(event.currentTarget.value))}
          className="speed-slider"
          data-testid="speed-slider"
        />
      </div>

      <div className="metric-card" data-testid="metric-cost-risk-card">
        <div className="metric-icon rose">
          <span className="lucide" data-lucide="wallet" style={{ width: 16, height: 16 }} />
        </div>
        <div className="metric-title">Cost · Risk Score</div>
        <div className="metric-value mono">
          {formatCurrency(currentMetrics?.cost_usd)} <span style={{ color: "var(--text-muted)" }}>·</span> {currentMetrics?.risk_score ?? "—"}<span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>/100</span>
        </div>
        {hasReroute ? (
          <div className="metric-baseline">
            was {formatCurrency(baselineMetrics.cost_usd)} · {baselineMetrics.risk_score}/100
          </div>
        ) : null}
      </div>

      <div className="metric-card" data-testid="metric-active-disruption-card">
        <div className={`metric-icon ${activeDisruption?.type ? "rose" : "emerald"}`}>
          <span className="lucide" data-lucide={activeDisruption?.type ? "alert-triangle" : "shield-check"} style={{ width: 16, height: 16 }} />
        </div>
        <div className="metric-title">Active Disruption</div>
        <div className="metric-value" style={{ color: activeDisruption?.type ? "var(--rose)" : "var(--emerald)" }}>
          {activeDisruption?.type
            ? activeDisruption.type.replace(/_/g, " ")
            : "None"}
        </div>
      </div>
    </section>
  );
}

