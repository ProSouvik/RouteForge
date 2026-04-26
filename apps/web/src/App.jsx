import { useEffect, useState, useRef } from "preact/hooks";
import ChatBox from "./components/ChatBox.jsx";
import Map from "./components/Map.jsx";
import MetricsPanel from "./components/MetricsPanel.jsx";
import PlaybackBar from "./components/PlaybackBar.jsx";
import ReasoningCard from "./components/ReasoningCard.jsx";
import ScenarioForm from "./components/ScenarioForm.jsx";
import {
  computeOptimizedRoute,
  computeAlternateRoute,
  fetchReasoning,
  fetchScenario,
  fetchScenarios,
  sendScenarioChat,
} from "./lib/api.js";

function toFixedInput(value) {
  return Number(value).toFixed(4);
}

function parsePoint(point) {
  const lat = Number.parseFloat(point.lat);
  const lon = Number.parseFloat(point.lon);

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    throw new Error("Coordinates must be valid numbers");
  }

  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new Error("Coordinates are out of range (lat: -90 to 90, lon: -180 to 180)");
  }

  return { lat, lon };
}

function safeParsePoint(point) {
  try {
    return parsePoint(point);
  } catch (_error) {
    return null;
  }
}

function findEvent(events, kind) {
  return events.find((event) => event.kind === kind) || null;
}

export default function App() {
  const [sourceInput, setSourceInput] = useState({
    lat: "",
    lon: "",
    placeName: "",
  });
  const [destinationInput, setDestinationInput] = useState({
    lat: "",
    lon: "",
    placeName: "",
  });
  const [isListeningSource, setIsListeningSource] = useState(false);
  const [isListeningDestination, setIsListeningDestination] = useState(false);
  const voiceRecognitionRef = useRef(null);
  const [routeLabel, setRouteLabel] = useState("Custom route");
  const [mapSelectionMode, setMapSelectionMode] = useState(null);
  const [scenarioId, setScenarioId] = useState(null);
  const [baselineRoute, setBaselineRoute] = useState(null);
  const [baselineMetrics, setBaselineMetrics] = useState(null);
  const [rerouteRoute, setRerouteRoute] = useState(null);
  const [rerouteMetrics, setRerouteMetrics] = useState(null);
  const [activeDisruption, setActiveDisruption] = useState(null);
  const [reasoning, setReasoning] = useState("Compute a route to begin.");
  const [savedScenarios, setSavedScenarios] = useState([]);
  const [playbackStep, setPlaybackStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [vehicleSpeed, setVehicleSpeed] = useState(80);
  const [liveDisruptions, setLiveDisruptions] = useState([]);
  const [selectedLiveDisruptions, setSelectedLiveDisruptions] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [isComputing, setIsComputing] = useState(false);
  const [isComputingAlternate, setIsComputingAlternate] = useState(false);
  const [isRefreshingReasoning, setIsRefreshingReasoning] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [severityFilter, setSeverityFilter] = useState({low: true, medium: true, high: true});

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      voiceRecognitionRef.current = new SpeechRecognition();
      voiceRecognitionRef.current.continuous = false;
      voiceRecognitionRef.current.interimResults = true;
      voiceRecognitionRef.current.lang = 'en-US';
    }
  }, []);

  async function refreshScenarios() {
    const payload = await fetchScenarios();
    setSavedScenarios(payload.scenarios || []);
  }

  useEffect(() => {
    refreshScenarios().catch(() => {
      setSavedScenarios([]);
    });
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      return undefined;
    }

    const interval = setInterval(() => {
      setPlaybackStep((current) => {
        if (current >= 2) {
          setIsPlaying(false);
          return 2;
        }
        return current + 1;
      });
    }, 1100);

    return () => clearInterval(interval);
  }, [isPlaying]);

  function updateCoordinates(scope, key, value) {
    if (scope === "source") {
      setSourceInput((current) => ({ ...current, [key]: value }));
      setRouteLabel("Custom route");
      return;
    }

    setDestinationInput((current) => ({ ...current, [key]: value }));
    setRouteLabel("Custom route");
  }

  function handleVoiceInput(scope) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setErrorMessage("Voice input is not supported in your browser");
      return;
    }

    if (scope === "source") {
      setIsListeningSource(true);
    } else {
      setIsListeningDestination(true);
    }

    const recognition = voiceRecognitionRef.current || new SpeechRecognition();
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      transcript = transcript.trim();
      
      if (transcript) {
        if (scope === "source") {
          setSourceInput((current) => ({ ...current, placeName: transcript }));
        } else {
          setDestinationInput((current) => ({ ...current, placeName: transcript }));
        }
        setRouteLabel("Custom route");
      }
    };

    recognition.onerror = (event) => {
      setErrorMessage(`Voice input error: ${event.error}`);
    };

    recognition.onend = () => {
      if (scope === "source") {
        setIsListeningSource(false);
      } else {
        setIsListeningDestination(false);
      }
    };

    recognition.start();
  }

  function handleMapClick(point) {
    if (!mapSelectionMode || !point) {
      return;
    }

    const lat = point.lat.toFixed(6);
    const lon = point.lng.toFixed(6);

    if (mapSelectionMode === "source") {
      setSourceInput({ lat, lon });
    } else if (mapSelectionMode === "destination") {
      setDestinationInput({ lat, lon });
    }

    setRouteLabel("Custom route");
    setMapSelectionMode(null);
  }

  function handleMapSelectionMode(mode) {
    setMapSelectionMode(mode);
  }

  async function handleComputeRoute() {
    try {
      setErrorMessage("");
      setIsComputing(true);

      const source = parsePoint(sourceInput);
      const destination = parsePoint(destinationInput);
      const payload = await computeOptimizedRoute({
        source,
        destination,
        label: routeLabel,
      });

      setScenarioId(payload.scenario_id);
      setBaselineRoute(payload.route);
      setBaselineMetrics({
        distance_m: payload.route.distance_m,
        duration_s: payload.route.duration_s,
        risk_score: payload.route.risk_score ?? payload.risk_score,
        cost_usd: payload.route.cost_usd ?? payload.cost_usd,
      });
      setRerouteRoute(null);
      setRerouteMetrics(null);
      setActiveDisruption(null);
      setLiveDisruptions(payload.live_disruptions || []);
      setSelectedLiveDisruptions([]);
      setReasoning(payload.reasoning || "Route computed.");
      setChatMessages([]);
      setPlaybackStep(0);
      setIsPlaying(false);
      await refreshScenarios();
    } catch (error) {
      setErrorMessage(error.message || "Failed to compute route");
    } finally {
      setIsComputing(false);
    }
  }

  async function handleComputeAlternateRoute() {
    if (!scenarioId || selectedLiveDisruptions.length === 0) {
      return;
    }

    try {
      setErrorMessage("");
      setIsComputingAlternate(true);
      const payload = await computeAlternateRoute({
        scenario_id: scenarioId,
        incidents: selectedLiveDisruptions,
      });

      setRerouteRoute(payload.reroute);
      setRerouteMetrics({
        distance_m: payload.reroute.distance_m,
        duration_s: payload.reroute.duration_s,
        risk_score: payload.reroute.risk_score,
        cost_usd: payload.reroute.cost_usd,
      });
      setActiveDisruption(payload.disruption);
      setReasoning(payload.reasoning || "Alternate route computed.");
      setPlaybackStep(2);
      setIsPlaying(false);
      await refreshScenarios();
    } catch (error) {
      setErrorMessage(error.message || "Failed to compute alternate route");
    } finally {
      setIsComputingAlternate(false);
    }
  }

  function handleSelectLiveDisruption(disruption) {
    setSelectedLiveDisruptions((current) => {
      const isSelected = current.some(d => d.id === disruption.id);
      if (isSelected) {
        return current.filter(d => d.id !== disruption.id);
      } else {
        return [...current, disruption];
      }
    });
  }

  async function handleLoadScenario(nextScenarioId) {
    try {
      setErrorMessage("");
      const scenario = await fetchScenario(nextScenarioId);
      setScenarioId(scenario.scenario_id);

      setSourceInput({
        lat: toFixedInput(scenario.source.lat),
        lon: toFixedInput(scenario.source.lon),
      });
      setDestinationInput({
        lat: toFixedInput(scenario.destination.lat),
        lon: toFixedInput(scenario.destination.lon),
      });

      const initial = findEvent(scenario.events || [], "initial_route");
      const reroute = findEvent(scenario.events || [], "reroute");

      setBaselineRoute(initial?.route || null);
      setBaselineMetrics(
        initial
          ? {
              distance_m: initial.route.distance_m,
              duration_s: initial.route.duration_s,
              risk_score: initial.risk_score,
              cost_usd: initial.cost_usd,
            }
          : null
      );

      setRerouteRoute(reroute?.route || null);
      setRerouteMetrics(
        reroute
          ? {
              distance_m: reroute.route.distance_m,
              duration_s: reroute.route.duration_s,
              risk_score: reroute.risk_score,
              cost_usd: reroute.cost_usd,
            }
          : null
      );

      setActiveDisruption(scenario.active_disruption || null);
      setLiveDisruptions([]);
      setRouteLabel(scenario.label || "Custom route");
      setMapSelectionMode(null);
      setReasoning(scenario.reasoning || "Loaded scenario");
      setPlaybackStep(reroute ? 2 : 0);
      setIsPlaying(false);
      setChatMessages([]);
    } catch (error) {
      setErrorMessage(error.message || "Failed to load scenario");
    }
  }

  async function handleRefreshReasoning() {
    if (!scenarioId || isRefreshingReasoning) {
      return;
    }

    try {
      setErrorMessage("");
      setIsRefreshingReasoning(true);
      const payload = await fetchReasoning(scenarioId);
      setReasoning(payload.reasoning || "Reasoning refreshed.");
    } catch (error) {
      setErrorMessage(error.message || "Failed to refresh reasoning");
    } finally {
      setIsRefreshingReasoning(false);
    }
  }

  async function handleSendChat(message) {
    if (!scenarioId) {
      setErrorMessage("Compute a route before using chat");
      return;
    }

    setChatMessages((current) => [...current, { role: "user", text: message }]);
    setIsChatLoading(true);

    try {
      const payload = await sendScenarioChat(scenarioId, message);
      setChatMessages((current) => [
        ...current,
        { role: "assistant", text: payload.reply },
      ]);
    } catch (error) {
      setChatMessages((current) => [
        ...current,
        { role: "assistant", text: error.message || "Chat unavailable right now." },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  }

  function handleTogglePlay() {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }

    setPlaybackStep((current) => (current === 2 ? 0 : current));
    setIsPlaying(true);
  }

  function handleStepChange(step) {
    setIsPlaying(false);
    setPlaybackStep(step);
  }

  return (
    <div className="app-shell" data-testid="app-shell">
      <header className="topbar" data-testid="topbar">
        <div className="brand">
          <div className="brand-icon">RF</div>
          RouteForge
        </div>
        <div className="topbar-meta">
          <span className={`status-dot ${scenarioId ? "" : "offline"}`} />
          {scenarioId ? "Scenario active" : "No scenario"}
          <span style={{ color: "var(--border-default)" }}>|</span>
          DarthVaders
        </div>
      </header>

      <main className="dashboard-grid">
        <section className="panel left-panel">
          <ScenarioForm
            sourceInput={sourceInput}
            destinationInput={destinationInput}
            onCoordinateChange={updateCoordinates}
            onCompute={handleComputeRoute}
            isComputing={isComputing}
            onMapSelectionModeChange={handleMapSelectionMode}
            mapSelectionMode={mapSelectionMode}
            onComputeAlternateRoute={handleComputeAlternateRoute}
            isComputingAlternate={isComputingAlternate}
            canComputeAlternate={!!scenarioId}
            liveDisruptions={liveDisruptions}
            selectedLiveDisruptions={selectedLiveDisruptions}
            onSelectLiveDisruption={handleSelectLiveDisruption}
            savedScenarios={savedScenarios}
            onLoadScenario={handleLoadScenario}
            severityFilter={severityFilter}
            onSeverityFilterChange={setSeverityFilter}
            onVoiceInput={handleVoiceInput}
            isListeningSource={isListeningSource}
            isListeningDestination={isListeningDestination}
          />
        </section>

        <section className="panel map-panel">
          <Map
            source={safeParsePoint(sourceInput)}
            destination={safeParsePoint(destinationInput)}
            baselineRoute={baselineRoute}
            rerouteRoute={rerouteRoute}
            activeDisruption={activeDisruption}
            playbackStep={playbackStep}
            laneLabel={routeLabel}
            selectionMode={mapSelectionMode}
            onMapClick={handleMapClick}
          />
        </section>

        <section className="panel right-panel">
          <MetricsPanel
            baselineMetrics={baselineMetrics}
            rerouteMetrics={rerouteMetrics}
            activeDisruption={activeDisruption}
            vehicleSpeed={vehicleSpeed}
            onVehicleSpeedChange={setVehicleSpeed}
          />
          <ReasoningCard
            reasoning={reasoning}
            onRefresh={handleRefreshReasoning}
            canRefresh={!!scenarioId}
            isRefreshing={isRefreshingReasoning}
          />
          <ChatBox
            messages={chatMessages}
            onSend={handleSendChat}
            isLoading={isChatLoading}
            isDisabled={!scenarioId}
          />
        </section>
      </main>

      {errorMessage ? (
        <div className="error-toast" data-testid="error-toast">
          <span className="lucide" data-lucide="alert-circle" style={{ width: 16, height: 16, flexShrink: 0 }} />
          <span>{errorMessage}</span>
          <button
            type="button"
            className="btn btn-subtle btn-sm"
            onClick={() => setErrorMessage("")}
            data-testid="error-toast-dismiss-button"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <footer className="playback-footer">
        <PlaybackBar
          playbackStep={playbackStep}
          onStepChange={handleStepChange}
          isPlaying={isPlaying}
          onTogglePlay={handleTogglePlay}
        />
      </footer>
    </div>
  );
}
