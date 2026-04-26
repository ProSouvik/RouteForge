import { useEffect, useState } from "preact/hooks";

function formatDisruptionTitle(disruption) {
  const category =
    disruption.category?.replace(/_/g, " ") ||
    disruption.type?.replace(/_/g, " ") ||
    "Unknown";
  return category;
}

function getSeverityClass(severity) {
  switch (String(severity).toLowerCase()) {
    case "low":
      return "severity-low";
    case "medium":
      return "severity-medium";
    case "high":
      return "severity-high";
    default:
      return "severity-high";
  }
}

function getSeverityBadgeClass(severity) {
  switch (String(severity).toLowerCase()) {
    case "low":
      return "severity-badge-low";
    case "medium":
      return "severity-badge-medium";
    case "high":
      return "severity-badge-high";
    default:
      return "severity-badge-high";
  }
}

function formatScenarioLabel(scenario) {
  const disruption = scenario.active_disruption?.type
    ? ` · ${scenario.active_disruption.type.replace(/_/g, " ")}`
    : "";
  return `${scenario.label}${disruption}`;
}

export default function ScenarioForm({
  sourceInput,
  destinationInput,
  onCoordinateChange,
  onCompute,
  isComputing,
  onMapSelectionModeChange,
  mapSelectionMode,
  onComputeAlternateRoute,
  isComputingAlternate,
  canComputeAlternate,
  liveDisruptions,
  selectedLiveDisruptions,
  onSelectLiveDisruption,
  savedScenarios,
  onLoadScenario,
  severityFilter = { low: true, medium: true, high: true },
  onSeverityFilterChange,
  onVoiceInput,
  isListeningSource,
  isListeningDestination,
}) {

  /* ================= LOADER ================= */

  const loaderMessages = [
    "Finding best route...",
    "Analyzing traffic patterns...",
    "Avoiding disruptions...",
    "Running AI engine...",
    "Optimizing path...",
    "Predicting delays...",
    "Re-routing intelligently..."
  ];

  const [displayText, setDisplayText] = useState("");
  const [messageIndex, setMessageIndex] = useState(0);

  const isLoading = isComputing || isComputingAlternate;

  useEffect(() => {
    if (!isLoading) {
      setDisplayText("");
      setMessageIndex(0);
      return;
    }

    let charIndex = 0;
    const currentMessage = loaderMessages[messageIndex];

    const typing = setInterval(() => {
      setDisplayText(currentMessage.slice(0, charIndex + 1));
      charIndex++;

      if (charIndex === currentMessage.length) {
        clearInterval(typing);
        setTimeout(() => {
          setMessageIndex((prev) => (prev + 1) % loaderMessages.length);
        }, 1000);
      }
    }, 40);

    return () => clearInterval(typing);
  }, [messageIndex, isLoading]);

  /* ================= ORIGINAL LOGIC ================= */

  function filteredDisruptions() {
    return liveDisruptions.filter((incident) => {
      const severity = String(incident.severity || "high").toLowerCase();
      return severityFilter[severity] === true;
    });
  }

  function toggleSeverity(level) {
    onSeverityFilterChange?.({
      ...severityFilter,
      [level]: !severityFilter[level],
    });
  }

  return (
    <>
      {/* ================= GLOBAL LOADER ================= */}
      {isLoading && (
        <div className="global-loader">
          <div className="loader-content">
            <div className="loader-title">RouteForge AI</div>
            <div className="loader-text">{displayText}</div>
          </div>
        </div>
      )}

      {/* ================= MAIN UI ================= */}
      <div className="scenario-form">

        <div className="section-title-row">
          <span className="dot" />
          <span className="section-title">Route setup</span>
        </div>

        <div className="input-methods">
          <button
            type="button"
            className={`input-method-btn ${mapSelectionMode === "source" ? "active" : ""}`}
            onClick={() => onMapSelectionModeChange("source")}
          >
            📍 Source
          </button>

          <button
            type="button"
            className={`input-method-btn ${mapSelectionMode === "destination" ? "active" : ""}`}
            onClick={() => onMapSelectionModeChange("destination")}
          >
            📍 Destination
          </button>
        </div>

        <div className="route-inputs-container">

          {/* SOURCE */}
          <div className="location-input-group">
            <div className="location-group-title">From</div>

            <div className="place-name-input-wrapper">
              <input
                type="text"
                className="input place-name-input"
                placeholder="City, address, or place name"
                value={sourceInput.placeName || ""}
                onInput={(event) =>
                  onCoordinateChange("source", "placeName", event.currentTarget.value)
                }
              />
              <button
                type="button"
                className={`mic-btn ${isListeningSource ? "listening" : ""}`}
                onClick={() => onVoiceInput?.("source")}
              >
                {isListeningSource ? "🎤🔴" : "🎤"}
              </button>
            </div>

            <div className="coords-label">Or coordinates:</div>
            <div className="coord-grid-compact">
              <input
                type="text"
                className="input mono"
                placeholder="Latitude"
                value={sourceInput.lat}
                onInput={(e) =>
                  onCoordinateChange("source", "lat", e.currentTarget.value)
                }
              />
              <input
                type="text"
                className="input mono"
                placeholder="Longitude"
                value={sourceInput.lon}
                onInput={(e) =>
                  onCoordinateChange("source", "lon", e.currentTarget.value)
                }
              />
            </div>
          </div>

          {/* DESTINATION */}
          <div className="location-input-group">
            <div className="location-group-title">To</div>

            <div className="place-name-input-wrapper">
              <input
                type="text"
                className="input place-name-input"
                placeholder="City, address, or place name"
                value={destinationInput.placeName || ""}
                onInput={(event) =>
                  onCoordinateChange("destination", "placeName", event.currentTarget.value)
                }
              />
              <button
                type="button"
                className={`mic-btn ${isListeningDestination ? "listening" : ""}`}
                onClick={() => onVoiceInput?.("destination")}
              >
                {isListeningDestination ? "🎤🔴" : "🎤"}
              </button>
            </div>

            <div className="coords-label">Or coordinates:</div>
            <div className="coord-grid-compact">
              <input
                type="text"
                className="input mono"
                placeholder="Latitude"
                value={destinationInput.lat}
                onInput={(e) =>
                  onCoordinateChange("destination", "lat", e.currentTarget.value)
                }
              />
              <input
                type="text"
                className="input mono"
                placeholder="Longitude"
                value={destinationInput.lon}
                onInput={(e) =>
                  onCoordinateChange("destination", "lon", e.currentTarget.value)
                }
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={onCompute}
          disabled={isComputing}
        >
          {isComputing ? "Computing..." : "Compute optimized route"}
        </button>

        <div className="section-title-row">
          <span className="dot" />
          <span className="section-title">Disruptions</span>
        </div>

        <div className="disruption-list">
          {filteredDisruptions().map((incident) => {
            const location =
              incident.location ||
              (incident.lat != null && incident.lon != null
                ? { lat: incident.lat, lon: incident.lon }
                : null);

            const incidentId =
              incident.id ||
              `${incident.type}-${location?.lat}-${location?.lon}`;

            return (
              <button
                key={incidentId}
                className={`disruption-card ${getSeverityClass(
                  incident.severity
                )}`}
                onClick={() =>
                  onSelectLiveDisruption({ ...incident, id: incidentId, location })
                }
              >
                <div className="disruption-title">
                  {formatDisruptionTitle(incident)}
                </div>
              </button>
            );
          })}
        </div>

        <button
          className="btn btn-amber"
          onClick={onComputeAlternateRoute}
          disabled={!canComputeAlternate || isComputingAlternate}
        >
          {isComputingAlternate ? "Computing..." : "Compute alternate route"}
        </button>

        <div className="saved-scenarios">
          {savedScenarios.length === 0 ? (
            <div className="empty-label">No scenarios yet</div>
          ) : (
            savedScenarios.map((scenario) => (
              <button
                key={scenario.scenario_id}
                className="saved-scenario-item"
                onClick={() => onLoadScenario(scenario.scenario_id)}
              >
                {formatScenarioLabel(scenario)}
              </button>
            ))
          )}
        </div>
      </div>

      {/* ================= LOADER CSS ================= */}
      <style>
        {`
        .global-loader {
          position: fixed;
          inset: 0;
          background: #000;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 999999;
        }

        .loader-content {
          text-align: center;
          color: #fff;
        }

        .loader-title {
          font-size: 32px;
          font-weight: 700;
          margin-bottom: 12px;
        }

        .loader-text {
          font-family: monospace;
          border-right: 2px solid #fff;
          padding-right: 5px;
          animation: blink 0.8s infinite;
        }

        @keyframes blink {
          0%, 50%, 100% { border-color: #fff; }
          25%, 75% { border-color: transparent; }
        }
        `}
      </style>
    </>
  );
}
