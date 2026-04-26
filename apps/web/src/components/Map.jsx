import { useEffect, useRef } from "preact/hooks";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

function toLatLngList(route) {
  if (!route?.geometry?.coordinates) {
    return [];
  }
  return route.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
}

function createPinIcon(label, className, testId) {
  return L.divIcon({
    className: "",
    html: `<div class=\"map-pin ${className}\" data-testid=\"${testId}\">${label}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function createDisruptionIcon(disruption) {
  return L.divIcon({
    className: "",
    html: `
      <div class="map-disruption" data-cause="${disruption?.description || 'Unknown cause'}" data-testid="disruption-marker">
        !
      </div>
    `,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  });
}

export default function Map({
  source,
  destination,
  baselineRoute,
  rerouteRoute,
  activeDisruption,
  playbackStep,
  laneLabel,
  selectionMode,
  onMapClick,
  zoomToLocation,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef(null);
  const clickIndicatorRef = useRef(null);
  const onMapClickRef = useRef(onMapClick);
  const selectionModeRef = useRef(selectionMode);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    selectionModeRef.current = selectionMode;
  }, [selectionMode]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return undefined;
    }

    const map = L.map(containerRef.current, {
      zoomControl: true,
      worldCopyJump: true,
    }).setView([20, 0], 2);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
     
      crossOrigin: true,
      subdomains: "abcd",
    }).addTo(map);

    layersRef.current = {
      markers: L.layerGroup().addTo(map),
      routes: L.layerGroup().addTo(map),
      alerts: L.layerGroup().addTo(map),
    };

    const clickHandler = (event) => {
      if (!selectionModeRef.current) {
        return;
      }

      const callback = onMapClickRef.current;
      if (typeof callback === "function") {
        callback(event.latlng);
      }

      if (clickIndicatorRef.current) {
        clickIndicatorRef.current.remove();
      }

      clickIndicatorRef.current = L.marker([event.latlng.lat, event.latlng.lng], {
        icon: createPinIcon("?", "map-pin-click", "click-indicator"),
      }).addTo(layersRef.current.markers);
    };

    map.on("click", clickHandler);

    setTimeout(() => {
      map.invalidateSize();
    }, 100);

    mapRef.current = map;

    return () => {
      map.off("click", clickHandler);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !layersRef.current) {
      return;
    }

    mapRef.current.invalidateSize();
    mapRef.current.getContainer().style.cursor = selectionMode ? "crosshair" : "";

    const { markers, routes, alerts } = layersRef.current;
    markers.clearLayers();
    routes.clearLayers();
    alerts.clearLayers();

    const boundsPoints = [];

    if (source) {
      const sourcePoint = [source.lat, source.lon];
      boundsPoints.push(sourcePoint);
      L.marker(sourcePoint, {
        icon: createPinIcon("A", "map-pin-a", "origin-marker"),
      }).addTo(markers);
    }

    if (destination) {
      const destinationPoint = [destination.lat, destination.lon];
      boundsPoints.push(destinationPoint);
      L.marker(destinationPoint, {
        icon: createPinIcon("B", "map-pin-b", "destination-marker"),
      }).addTo(markers);
    }

    const baselineLine = toLatLngList(baselineRoute);
    const rerouteLine = toLatLngList(rerouteRoute);

    if (baselineLine.length > 1 && playbackStep <= 1) {
      L.polyline(baselineLine, {
        color: "#0A5E63",
        weight: 5,
        opacity: 1,
      }).addTo(routes);
      boundsPoints.push(...baselineLine);
    }

    if (baselineLine.length > 1 && playbackStep === 2) {
      L.polyline(baselineLine, {
        color: "#0A5E63",
        weight: 5,
        opacity: rerouteLine.length > 1 ? 0.35 : 1,
        dashArray: rerouteLine.length > 1 ? "10 8" : undefined,
      }).addTo(routes);
      boundsPoints.push(...baselineLine);
    }

    if (playbackStep === 2 && rerouteLine.length > 1) {
      L.polyline(rerouteLine, {
        color: "#E8642C",
        weight: 5,
        opacity: 1,
      }).addTo(routes);
      boundsPoints.push(...rerouteLine);
    }

    if (playbackStep >= 1 && activeDisruption?.locations) {
      activeDisruption.locations.forEach((location, index) => {
        const disruptionPoint = [location.lat, location.lon];
        boundsPoints.push(disruptionPoint);
        L.marker(disruptionPoint, { icon: createDisruptionIcon() }).addTo(alerts);
      });
    }

    if (boundsPoints.length > 1) {
      const bounds = L.latLngBounds(boundsPoints);
      mapRef.current.fitBounds(bounds, { padding: [32, 32], maxZoom: 12 });
    }
  }, [source, destination, baselineRoute, rerouteRoute, activeDisruption, playbackStep]);

  const disruptionLabel = activeDisruption?.type
    ? activeDisruption.type === "multiple_disruptions"
      ? `${activeDisruption.locations.length} disruptions`
      : activeDisruption.type.replace(/_/g, " ")
    : "no active disruption";

  const selectionHint = selectionMode
    ? `Click the map to choose ${selectionMode}`
    : "Click source/destination above to activate map selection";

  return (
    <div className="map-shell" data-testid="map-shell">
      <div ref={containerRef} className="map-canvas" data-testid="route-map-canvas" />

      <div className="floating-banner" data-testid="lane-banner">
        <span>{laneLabel || "Custom lane"}</span>
        <span className="banner-chip" data-testid="active-disruption-chip">
          {disruptionLabel}
        </span>
        <div className="banner-hint">{selectionHint}</div>
      </div>

      <div className="floating-legend" data-testid="map-legend">
        <div className="legend-item">
          <span className="legend-line legend-original" />
          <span>Original</span>
        </div>
        <div className="legend-item">
          <span className="legend-line legend-reroute" />
          <span>Reroute</span>
        </div>
      </div>
    </div>
  );
}
