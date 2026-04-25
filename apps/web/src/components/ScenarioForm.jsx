function formatDisruptionTitle(disruption) {
  const category = disruption.category?.replace(/_/g, " ") || disruption.type?.replace(/_/g, " ") || "Unknown";
  const severity = disruption.severity != null ? String(disruption.severity).toUpperCase() : "UNKNOWN";
  return `${category} · ${severity}`;
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
}) {
  return (
    <div className="scenario-form">
      <div className="section-title-row">
        <span className="dot" />
        <span className="section-title">Route setup</span>
      </div>

      <div className="field-note">
        Click the map to select source and destination points, or enter coordinates directly.
      </div>

      <div className="map-selection-controls">
        <button
          type="button"
          className={`btn ${mapSelectionMode === "source" ? "active" : "btn-subtle"}`}
          onClick={() => onMapSelectionModeChange("source")}
          data-testid="select-source-button"
        >
          Select source on map
        </button>
        <button
          type="button"
          className={`btn ${mapSelectionMode === "destination" ? "active" : "btn-subtle"}`}
          onClick={() => onMapSelectionModeChange("destination")}
          data-testid="select-destination-button"
        >
          Select destination on map
        </button>
      </div>

      <div className="coord-grid">
        <label className="field-label" htmlFor="source-lat-input">
          Source lat
        </label>
        <input
          id="source-lat-input"
          className="input mono"
          value={sourceInput.lat}
          onInput={(event) => onCoordinateChange("source", "lat", event.currentTarget.value)}
          data-testid="source-lat-input"
        />

        <label className="field-label" htmlFor="source-lon-input">
          Source lon
        </label>
        <input
          id="source-lon-input"
          className="input mono"
          value={sourceInput.lon}
          onInput={(event) => onCoordinateChange("source", "lon", event.currentTarget.value)}
          data-testid="source-lon-input"
        />

        <label className="field-label" htmlFor="destination-lat-input">
          Dest lat
        </label>
        <input
          id="destination-lat-input"
          className="input mono"
          value={destinationInput.lat}
          onInput={(event) =>
            onCoordinateChange("destination", "lat", event.currentTarget.value)
          }
          data-testid="destination-lat-input"
        />

        <label className="field-label" htmlFor="destination-lon-input">
          Dest lon
        </label>
        <input
          id="destination-lon-input"
          className="input mono"
          value={destinationInput.lon}
          onInput={(event) =>
            onCoordinateChange("destination", "lon", event.currentTarget.value)
          }
          data-testid="destination-lon-input"
        />
      </div>

      <button
        type="button"
        className="btn btn-primary"
        onClick={onCompute}
        disabled={isComputing}
        data-testid="compute-optimized-route-button"
      >
        {isComputing ? "Computing..." : "Compute optimized route"}
      </button>

      <div className="section-title-row">
        <span className="dot" />
        <span className="section-title">Disruptions</span>
      </div>

      {liveDisruptions.length > 0 ? (
        <div className="live-disruptions-selection">
          <div className="field-note">
            Select one or more disruptions to consider for alternate route calculation.
          </div>
          <div className="disruption-list">
            {liveDisruptions.map((incident) => {
              const location = incident.location || (incident.lat != null && incident.lon != null ? { lat: incident.lat, lon: incident.lon } : null);
              const incidentId = incident.id || `${incident.type || "incident"}-${location?.lat ?? "na"}-${location?.lon ?? "na"}`;

              return (
                <button
                  type="button"
                  key={incidentId}
                  className={`disruption-card ${selectedLiveDisruptions && selectedLiveDisruptions.some(d => d.id === incidentId) ? "selected" : ""}`}
                  onClick={() => onSelectLiveDisruption({ ...incident, id: incidentId, location })}
                  data-testid={`select-live-disruption-${incidentId}`}
                >
                  <div className="disruption-title">{formatDisruptionTitle(incident)}</div>
                  <div className="disruption-description">{incident.description}</div>
                  <div className="disruption-meta">
                    <span>{incident.provider}</span>
                    {location ? (
                      <span>
                        {location.lat.toFixed(4)}, {location.lon.toFixed(4)}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="field-note">
          No disruptions found near the route. Configure real traffic/incident APIs and refresh the route to load live events.
        </div>
      )}

      <button
        type="button"
        className="btn btn-amber"
        onClick={onComputeAlternateRoute}
        disabled={!canComputeAlternate || isComputingAlternate || !selectedLiveDisruptions || selectedLiveDisruptions.length === 0}
        data-testid="compute-alternate-route-button"
      >
        {isComputingAlternate ? "Computing..." : `Compute alternate route (${selectedLiveDisruptions ? selectedLiveDisruptions.length : 0} disruption${selectedLiveDisruptions && selectedLiveDisruptions.length !== 1 ? 's' : ''})`}
      </button>

      <div className="section-title-row">
        <span className="dot" />
        <span className="section-title">Saved scenarios</span>
      </div>

      <div className="saved-scenarios" data-testid="saved-scenarios-list">
        {savedScenarios.length === 0 ? (
          <div className="empty-label">No scenarios yet</div>
        ) : (
          savedScenarios.map((scenario) => (
            <button
              type="button"
              key={scenario.scenario_id}
              className="saved-scenario-item"
              onClick={() => onLoadScenario(scenario.scenario_id)}
              data-testid={`saved-scenario-${scenario.scenario_id}`}
            >
              {formatScenarioLabel(scenario)}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
