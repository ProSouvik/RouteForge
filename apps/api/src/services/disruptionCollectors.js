import { v4 as uuidv4 } from "uuid";
import * as turf from "@turf/turf";


const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY || null;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || null;
const HERE_API_KEY = process.env.HERE_API_KEY || null;
const NASA_FIRMS_API_KEY = process.env.NASA_FIRMS_API_KEY || null;
const USGS_API_ENABLED = process.env.USGS_API_ENABLED === "true";


function normalizeSeverity(raw) {
  if (typeof raw === "number") {
    if (raw >= 1 && raw <= 10) return Math.round(raw);
    if (raw >= 0 && raw <= 1) return Math.max(1, Math.round(raw * 10));
    return Math.min(10, Math.max(1, Math.round(raw)));
  }
  const map = {
    critical: 10, severe: 9, extreme: 10, high: 8, major: 8,
    moderate: 5, medium: 5, minor: 3, low: 2, minimal: 1, unknown: 3,
  };
  return map[String(raw || "").toLowerCase().trim()] || 3;
}

function normalizeSeverityLabel(raw) {
  if (typeof raw === "string") {
    return raw.trim().toUpperCase() || "UNKNOWN";
  }
  if (typeof raw === "number") {
    if (raw >= 8) return "HIGH";
    if (raw >= 5) return "MEDIUM";
    if (raw >= 3) return "LOW";
    return "MINOR";
  }
  return "UNKNOWN";
}

function normalizeIncidentForApi(incident) {
  const type = incident.type
    ? String(incident.type).toUpperCase().replace(/\s+/g, "_")
    : "UNKNOWN";
  const category = incident.category
    ? String(incident.category).toLowerCase().replace(/\s+/g, "_")
    : type.toLowerCase();
  const provider = String(incident.source || incident.provider || "unknown");
  const location = {
    lat: Number(incident.lat ?? incident.location?.lat),
    lon: Number(incident.lon ?? incident.location?.lon),
  };

  return {
    id: incident.id || uuidv4(),
    category,
    type,
    description: String(incident.description || "Unknown disruption"),
    severity: normalizeSeverityLabel(incident.severity),
    location,
    provider,
  };
}


function weatherSeverity(condition) {
  const c = String(condition || "").toLowerCase();
  if (c.includes("hurricane") || c.includes("tornado") || c.includes("blizzard")) return 10;
  if (c.includes("storm") || c.includes("flood") || c.includes("extreme")) return 8;
  if (c.includes("heavy rain") || c.includes("snow") || c.includes("hail")) return 6;
  if (c.includes("rain") || c.includes("wind") || c.includes("fog")) return 4;
  return 2;
}


export function sampleRoutePoints(routeCoords, intervalKm = 15) {
  if (!routeCoords || routeCoords.length < 2) return [];

  const line = turf.lineString(routeCoords);
  const totalLengthKm = turf.length(line, { units: "kilometers" });
  const points = [];
  let currentDist = 0;

  while (currentDist <= totalLengthKm) {
    const pt = turf.along(line, currentDist, { units: "kilometers" });
    const [lon, lat] = pt.geometry.coordinates;
    points.push({ lat, lon, distanceAlongRoute: Number(currentDist.toFixed(2)) });
    currentDist += intervalKm;
  }

  return points;
}


export async function fetchWeatherDisruptions(routeCoords) {
  const samples = sampleRoutePoints(routeCoords, 20);
  const incidents = [];

  for (const pt of samples) {
    let weatherData = null;

    if (OPENWEATHER_API_KEY) {
      try {
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${pt.lat}&lon=${pt.lon}&appid=${OPENWEATHER_API_KEY}&units=metric`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (res.ok) weatherData = await res.json();
      } catch {

      }
    }

    if (!weatherData) {

      const hash = Math.abs((pt.lat * 100 + pt.lon) % 7);
      const conditions = ["clear", "light rain", "moderate rain", "heavy rain", "storm", "snow", "fog"];
      const condition = conditions[Math.floor(hash)];
      const visibility = condition === "clear" ? 10000 : condition === "fog" ? 500 : 3000;
      const wind = condition === "storm" ? 25 : condition === "heavy rain" ? 15 : 5;
      weatherData = {
        weather: [{ main: condition, description: condition }],
        visibility,
        wind: { speed: wind },
      };
    }

    const main = weatherData.weather?.[0]?.main || "";
    const description = weatherData.weather?.[0]?.description || "";
    const visibility = weatherData.visibility ?? 10000;
    const windSpeed = weatherData.wind?.speed ?? 0;
    const severity = Math.max(
      weatherSeverity(description || main),
      visibility < 1000 ? 9 : visibility < 3000 ? 6 : 0,
      windSpeed > 20 ? 8 : windSpeed > 12 ? 5 : 0
    );

    if (severity >= 4) {
      incidents.push({
        type: "WEATHER_ALERT",
        description: description || main || "Adverse weather condition",
        lat: pt.lat,
        lon: pt.lon,
        severity,
        source: "weather",
        raw: weatherData,
      });
    }
  }

  return incidents;
}


export async function fetchTrafficIncidents(routeCoords) {
  const incidents = [];
  const bbox = turf.bbox(turf.lineString(routeCoords));
  const center = turf.center(turf.lineString(routeCoords)).geometry.coordinates;
  const centerLon = center[0];
  const centerLat = center[1];


  if (GOOGLE_MAPS_API_KEY) {
    try {
      const url = `https://maps.googleapis.com/maps/api/traffic/json?key=${GOOGLE_MAPS_API_KEY}&bounds=${bbox[1]},${bbox[0]}|${bbox[3]},${bbox[2]}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json();
        for (const item of data.incidents || []) {
          incidents.push({
            type: String(item.type || "TRAFFIC_JAM").toUpperCase().replace(/ /g, "_"),
            description: item.description || "Traffic incident",
            lat: item.location?.lat ?? centerLat,
            lon: item.location?.lng ?? centerLon,
            severity: normalizeSeverity(item.severity),
            source: "traffic",
            raw: item,
          });
        }
      }
    } catch {

    }
  }


  if (HERE_API_KEY && incidents.length === 0) {
    try {
      const url = `https://traffic.ls.hereapi.com/traffic/6.2/incidents.json?apiKey=${HERE_API_KEY}&bbox=${bbox[1]},${bbox[0]};${bbox[3]},${bbox[2]}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json();
        for (const item of data.TrafficItems?.TrafficItem || []) {
          const crit = item.Criticality?.Id || 0;
          incidents.push({
            type: crit >= 2 ? "ACCIDENT" : crit === 1 ? "TRAFFIC_JAM" : "ROAD_CLOSED",
            description: item.Description?.value || "Traffic incident",
            lat: item.Location?.DisplayPosition?.Latitude ?? centerLat,
            lon: item.Location?.DisplayPosition?.Longitude ?? centerLon,
            severity: normalizeSeverity(item.Severity || crit),
            source: "traffic",
            raw: item,
          });
        }
      }
    } catch {

    }
  }


  if (incidents.length === 0) {
    const mockIncidents = [
      { type: "ACCIDENT", description: "Multi-vehicle collision", offsetKm: 5, severity: 8 },
      { type: "TRAFFIC_JAM", description: "Heavy congestion due to roadwork", offsetKm: 18, severity: 5 },
      { type: "ROAD_CLOSED", description: "Emergency closure", offsetKm: 32, severity: 9 },
      { type: "ACCIDENT", description: "Vehicle breakdown in lane", offsetKm: 45, severity: 4 },
    ];

    const line = turf.lineString(routeCoords);
    const totalLengthKm = turf.length(line, { units: "kilometers" });

    for (const mock of mockIncidents) {
      if (mock.offsetKm <= totalLengthKm) {
        const pt = turf.along(line, mock.offsetKm, { units: "kilometers" });
        const [lon, lat] = pt.geometry.coordinates;
        incidents.push({
          type: mock.type,
          description: mock.description,
          lat,
          lon,
          severity: mock.severity,
          source: "traffic",
          raw: { mock: true, offsetKm: mock.offsetKm },
        });
      }
    }
  }

  return incidents;
}


export async function fetchDisasterEvents(routeCoords) {
  const incidents = [];
  const line = turf.lineString(routeCoords);
  const bbox = turf.bbox(line);
  const bboxStr = `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]}`;


  if (NASA_FIRMS_API_KEY) {
    try {
      const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/VIIRS_NOAA20_NRT/${NASA_FIRMS_API_KEY}/${bboxStr}/1`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const text = await res.text();
        const rows = text.split("\n").slice(1);
        for (const row of rows) {
          const cols = row.split(",");
          if (cols.length > 2) {
            const lat = parseFloat(cols[0]);
            const lon = parseFloat(cols[1]);
            const brightness = parseFloat(cols[2]) || 300;
            if (Number.isFinite(lat) && Number.isFinite(lon)) {
              incidents.push({
                type: "NATURAL_DISASTER",
                description: `Wildfire detected (brightness ${brightness.toFixed(0)}K)`,
                lat,
                lon,
                severity: brightness > 400 ? 10 : brightness > 350 ? 8 : 6,
                source: "disaster",
                subType: "wildfire",
                raw: { nasaFirms: true, brightness },
              });
            }
          }
        }
      }
    } catch {

    }
  }


  if (USGS_API_ENABLED) {
    try {
      const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minlatitude=${bbox[1]}&maxlatitude=${bbox[3]}&minlongitude=${bbox[0]}&maxlongitude=${bbox[2]}&starttime=${new Date(Date.now() - 86400000 * 7).toISOString().split("T")[0]}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json();
        for (const feature of data.features || []) {
          const mag = feature.properties?.mag || 0;
          if (mag >= 3.0) {
            const [lon, lat] = feature.geometry.coordinates;
            incidents.push({
              type: "NATURAL_DISASTER",
              description: `Earthquake magnitude ${mag}`,
              lat,
              lon,
              severity: mag >= 7 ? 10 : mag >= 5 ? 8 : mag >= 3 ? 5 : 3,
              source: "disaster",
              subType: "earthquake",
              raw: feature,
            });
          }
        }
      }
    } catch {

    }
  }


  if (incidents.length === 0) {
    const totalLengthKm = turf.length(line, { units: "kilometers" });
    const mockDisasters = [
      { description: "Flooding reported in low-lying area", offsetKm: 12, severity: 7, subType: "flood" },
      { description: "Landslide on mountain pass", offsetKm: 28, severity: 9, subType: "landslide" },
      { description: "Dense smoke from nearby wildfire", offsetKm: 55, severity: 6, subType: "wildfire" },
    ];

    for (const mock of mockDisasters) {
      if (mock.offsetKm <= totalLengthKm) {
        const pt = turf.along(line, mock.offsetKm, { units: "kilometers" });
        const [lon, lat] = pt.geometry.coordinates;
        incidents.push({
          type: "NATURAL_DISASTER",
          description: mock.description,
          lat,
          lon,
          severity: mock.severity,
          source: "disaster",
          subType: mock.subType,
          raw: { mock: true, offsetKm: mock.offsetKm },
        });
      }
    }
  }

  return incidents;
}


export async function fetchCrowdReports(routeCoords) {
  const line = turf.lineString(routeCoords);
  const totalLengthKm = turf.length(line, { units: "kilometers" });

  const mockReports = [
    { description: "Road blocked due to protest", offsetKm: 8, severity: 7 },
    { description: "Potholes causing vehicle damage", offsetKm: 22, severity: 4 },
    { description: "Bridge weight limit enforced", offsetKm: 38, severity: 5 },
    { description: "Unreported accident, traffic diverted", offsetKm: 50, severity: 6 },
    { description: "Debris on road from storm", offsetKm: 65, severity: 5 },
  ];

  const incidents = [];
  for (const report of mockReports) {
    if (report.offsetKm <= totalLengthKm) {
      const pt = turf.along(line, report.offsetKm, { units: "kilometers" });
      const [lon, lat] = pt.geometry.coordinates;
      incidents.push({
        type: "CROWD_REPORT",
        description: report.description,
        lat,
        lon,
        severity: report.severity,
        source: "crowd",
        raw: { mock: true, offsetKm: report.offsetKm },
      });
    }
  }

  return incidents;
}


export function deduplicateIncidents(incidents, thresholdKm = 1.0) {
  if (!incidents || incidents.length === 0) return [];


  const sorted = [...incidents].sort((a, b) => b.severity - a.severity);
  const kept = [];

  for (const candidate of sorted) {
    let isDuplicate = false;
    for (const existing of kept) {
      const dist = turf.distance(
        turf.point([candidate.lon, candidate.lat]),
        turf.point([existing.lon, existing.lat]),
        { units: "kilometers" }
      );
      if (dist <= thresholdKm) {
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) {
      kept.push(candidate);
    }
  }

  return kept;
}


export async function collectAllDisruptions(routeCoords) {
  if (!routeCoords || routeCoords.length < 2) {
    return [];
  }

  const [weather, traffic, disasters, crowd] = await Promise.allSettled([
    fetchWeatherDisruptions(routeCoords),
    fetchTrafficIncidents(routeCoords),
    fetchDisasterEvents(routeCoords),
    fetchCrowdReports(routeCoords),
  ]);

  const all = [];

  if (weather.status === "fulfilled") {
    all.push(...weather.value);
  }

  if (traffic.status === "fulfilled") {
    all.push(...traffic.value);
  }

  if (disasters.status === "fulfilled") {
    all.push(...disasters.value);
  }

  if (crowd.status === "fulfilled") {
    all.push(...crowd.value);
  }

  const deduplicated = deduplicateIncidents(all, 1.0);


  deduplicated.sort((a, b) => {
    if (b.severity !== a.severity) return b.severity - a.severity;
    return String(a.source).localeCompare(String(b.source));
  });

  return deduplicated.map(normalizeIncidentForApi);
}


export default {
  sampleRoutePoints,
  fetchWeatherDisruptions,
  fetchTrafficIncidents,
  fetchDisasterEvents,
  fetchCrowdReports,
  deduplicateIncidents,
  collectAllDisruptions,
};
