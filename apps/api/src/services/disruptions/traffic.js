import * as turf from "@turf/turf";
import { haversineKm } from "../../utils/geo.js";


export const DISRUPTION_CATEGORIES = {
  accident: "accident",
  congestion: "congestion",
  construction: "construction",
  hazard: "hazard",
  weather: "weather",
  natural_disaster: "natural_disaster",
  road_closure: "road_closure",
  vehicle_breakdown: "vehicle_breakdown",
  police_activity: "police_activity",
  special_event: "special_event",
  other: "other",
};


const WEIGHTED_KEYWORDS = [
  {
    category: DISRUPTION_CATEGORIES.accident,
    keywords: [
      { term: "accident", weight: 1.0 },
      { term: "crash", weight: 1.0 },
      { term: "collision", weight: 1.0 },
      { term: "wreck", weight: 0.9 },
      { term: "pileup", weight: 0.9 },
      { term: "multi-vehicle", weight: 0.8 },
    ],
  },
  {
    category: DISRUPTION_CATEGORIES.congestion,
    keywords: [
      { term: "congestion", weight: 1.0 },
      { term: "traffic jam", weight: 1.0 },
      { term: "gridlock", weight: 0.95 },
      { term: "bottleneck", weight: 0.85 },
      { term: "slow traffic", weight: 0.75 },
      { term: "heavy traffic", weight: 0.75 },
      { term: "standstill", weight: 0.9 },
    ],
  },
  {
    category: DISRUPTION_CATEGORIES.construction,
    keywords: [
      { term: "construction", weight: 1.0 },
      { term: "roadwork", weight: 1.0 },
      { term: "road work", weight: 1.0 },
      { term: "maintenance", weight: 0.85 },
      { term: "repair", weight: 0.8 },
      { term: "resurfacing", weight: 0.85 },
      { term: "lane closure", weight: 0.9 },
      { term: "bridge work", weight: 0.9 },
    ],
  },
  {
    category: DISRUPTION_CATEGORIES.hazard,
    keywords: [
      { term: "hazard", weight: 1.0 },
      { term: "debris", weight: 0.95 },
      { term: "obstruction", weight: 0.9 },
      { term: "spill", weight: 0.85 },
      { term: "ice", weight: 0.8 },
      { term: "oil spill", weight: 0.9 },
      { term: "fallen tree", weight: 0.85 },
      { term: "sinkhole", weight: 0.9 },
    ],
  },
  {
    category: DISRUPTION_CATEGORIES.weather,
    keywords: [
      { term: "weather", weight: 0.7 },
      { term: "storm", weight: 1.0 },
      { term: "fog", weight: 0.85 },
      { term: "snow", weight: 0.9 },
      { term: "rain", weight: 0.8 },
      { term: "hail", weight: 0.9 },
      { term: "blizzard", weight: 1.0 },
      { term: "tornado", weight: 1.0 },
      { term: "hurricane", weight: 1.0 },
      { term: "icy", weight: 0.85 },
    ],
  },
  {
    category: DISRUPTION_CATEGORIES.natural_disaster,
    keywords: [
      { term: "flood", weight: 1.0 },
      { term: "landslide", weight: 1.0 },
      { term: "mudslide", weight: 0.95 },
      { term: "earthquake", weight: 1.0 },
      { term: "wildfire", weight: 1.0 },
      { term: "forest fire", weight: 0.95 },
      { term: "avalanche", weight: 1.0 },
      { term: "tsunami", weight: 1.0 },
    ],
  },
  {
    category: DISRUPTION_CATEGORIES.road_closure,
    keywords: [
      { term: "closure", weight: 1.0 },
      { term: "road closed", weight: 1.0 },
      { term: "blocked", weight: 0.9 },
      { term: "closed", weight: 0.9 },
      { term: "shutdown", weight: 0.85 },
      { term: "no access", weight: 0.8 },
      { term: "detour", weight: 0.75 },
    ],
  },
  {
    category: DISRUPTION_CATEGORIES.vehicle_breakdown,
    keywords: [
      { term: "breakdown", weight: 1.0 },
      { term: "disabled vehicle", weight: 1.0 },
      { term: "stall", weight: 0.85 },
      { term: "broken down", weight: 0.95 },
      { term: "mechanical failure", weight: 0.9 },
    ],
  },
  {
    category: DISRUPTION_CATEGORIES.police_activity,
    keywords: [
      { term: "police", weight: 0.85 },
      { term: "incident", weight: 0.7 },
      { term: "checkpoint", weight: 0.95 },
      { term: "investigation", weight: 0.85 },
      { term: "police activity", weight: 1.0 },
      { term: "law enforcement", weight: 0.9 },
    ],
  },
  {
    category: DISRUPTION_CATEGORIES.special_event,
    keywords: [
      { term: "event", weight: 0.7 },
      { term: "parade", weight: 1.0 },
      { term: "festival", weight: 1.0 },
      { term: "marathon", weight: 1.0 },
      { term: "procession", weight: 0.95 },
      { term: "demonstration", weight: 0.85 },
      { term: "protest", weight: 0.85 },
      { term: "sporting event", weight: 0.9 },
    ],
  },
];


const STRUCTURED_TYPE_MAPPING = {

  ACCIDENT: DISRUPTION_CATEGORIES.accident,
  TRAFFIC_ACCIDENT: DISRUPTION_CATEGORIES.accident,
  VEHICLE_ACCIDENT: DISRUPTION_CATEGORIES.accident,
  COLLISION: DISRUPTION_CATEGORIES.accident,
  TRAFFIC_JAM: DISRUPTION_CATEGORIES.congestion,
  CONGESTION: DISRUPTION_CATEGORIES.congestion,
  QUEUE: DISRUPTION_CATEGORIES.congestion,
  STATIONARY_TRAFFIC: DISRUPTION_CATEGORIES.congestion,
  SLOW_TRAFFIC: DISRUPTION_CATEGORIES.congestion,
  HEAVY_TRAFFIC: DISRUPTION_CATEGORIES.congestion,
  ROAD_CLOSED: DISRUPTION_CATEGORIES.road_closure,
  ROAD_CLOSURE: DISRUPTION_CATEGORIES.road_closure,
  LANE_CLOSED: DISRUPTION_CATEGORIES.construction,
  LANE_CLOSURE: DISRUPTION_CATEGORIES.construction,
  BRIDGE_CLOSED: DISRUPTION_CATEGORIES.road_closure,
  CONSTRUCTION: DISRUPTION_CATEGORIES.construction,
  ROADWORK: DISRUPTION_CATEGORIES.construction,
  MAINTENANCE: DISRUPTION_CATEGORIES.construction,
  ROAD_MAINTENANCE: DISRUPTION_CATEGORIES.construction,
  HAZARD: DISRUPTION_CATEGORIES.hazard,
  ROAD_HAZARD: DISRUPTION_CATEGORIES.hazard,
  WEATHER: DISRUPTION_CATEGORIES.weather,
  SNOW: DISRUPTION_CATEGORIES.weather,
  ICE: DISRUPTION_CATEGORIES.weather,
  RAIN: DISRUPTION_CATEGORIES.weather,
  FOG: DISRUPTION_CATEGORIES.weather,
  FLOOD: DISRUPTION_CATEGORIES.natural_disaster,
  LANDSLIDE: DISRUPTION_CATEGORIES.natural_disaster,
  EARTHQUAKE: DISRUPTION_CATEGORIES.natural_disaster,
  WILDFIRE: DISRUPTION_CATEGORIES.natural_disaster,
  VEHICLE_BREAKDOWN: DISRUPTION_CATEGORIES.vehicle_breakdown,
  DISABLED_VEHICLE: DISRUPTION_CATEGORIES.vehicle_breakdown,
  BROKEN_DOWN_VEHICLE: DISRUPTION_CATEGORIES.vehicle_breakdown,
  POLICE_ACTIVITY: DISRUPTION_CATEGORIES.police_activity,
  POLICE: DISRUPTION_CATEGORIES.police_activity,
  SPECIAL_EVENT: DISRUPTION_CATEGORIES.special_event,
  EVENT: DISRUPTION_CATEGORIES.special_event,
};


function classifyByKeywords(text) {
  const normalized = String(text || "").toLowerCase();
  let bestCategory = DISRUPTION_CATEGORIES.other;
  let bestScore = 0;
  let totalWeight = 0;

  for (const group of WEIGHTED_KEYWORDS) {
    let groupScore = 0;

    for (const { term, weight } of group.keywords) {
      if (normalized.includes(term.toLowerCase())) {
        groupScore += weight;
      }
    }

    totalWeight = Math.max(totalWeight, groupScore);

    if (groupScore > bestScore) {
      bestScore = groupScore;
      bestCategory = group.category;
    }
  }


  const bestGroup = WEIGHTED_KEYWORDS.find((g) => g.category === bestCategory);
  const maxPossible = bestGroup
    ? bestGroup.keywords.reduce((sum, k) => sum + k.weight, 0)
    : 1;
  const confidence = Math.min(1, bestScore / Math.max(maxPossible * 0.3, 1));

  return { category: bestCategory, confidence: Number(confidence.toFixed(3)) };
}


function classifyIncident(structuredType, text) {

  if (structuredType) {
    const upper = String(structuredType).toUpperCase().trim();
    const mapped = STRUCTURED_TYPE_MAPPING[upper];
    if (mapped) {
      return { category: mapped, confidence: 1.0 };
    }
  }


  return classifyByKeywords(text);
}


function normalizeSeverity(raw) {
  if (typeof raw === "number") {
    if (raw >= 1 && raw <= 10) return Math.round(raw);
    if (raw >= 0 && raw <= 1) return Math.max(1, Math.round(raw * 10));
    return Math.min(10, Math.max(1, Math.round(raw)));
  }

  const str = String(raw || "").toLowerCase().trim();

  const map = {
    critical: 10,
    severe: 9,
    extreme: 10,
    high: 8,
    major: 8,
    moderate: 5,
    medium: 5,
    minor: 3,
    low: 2,
    minimal: 1,
    unknown: 3,
  };

  return map[str] || 3;
}


export function normalizeIncident(rawIncident) {
  const lat = Number(rawIncident.latitude ?? rawIncident.location?.lat ?? rawIncident.lat ?? 0);
  const lon = Number(rawIncident.longitude ?? rawIncident.location?.lon ?? rawIncident.lon ?? 0);

  const rawType = rawIncident.type || rawIncident.event_type || rawIncident.eventType || "";
  const rawDescription = rawIncident.description || rawIncident.summary || rawIncident.event || "";


  const { category, confidence } = classifyIncident(
    rawType,
    `${rawType} ${rawDescription}`
  );

  const severity = normalizeSeverity(
    rawIncident.severity ?? rawIncident.impact ?? rawIncident.priority
  );

  const source = String(rawIncident.provider || rawIncident.source || "unknown").toLowerCase();

  return {
    id: rawIncident.id || rawIncident.incident_id || `${source}-${Math.random().toString(36).slice(2, 10)}`,
    lat,
    lon,
    category,
    confidence,
    severity,
    source,
    description: rawDescription || "Incident reported near route",
    type: rawType || "unknown",
    reported_at: rawIncident.reported_at || rawIncident.timestamp || rawIncident.startTime || null,
    raw: rawIncident,
  };
}


export function isNearRoute(point, routeCoords, thresholdKm) {
  if (!routeCoords || routeCoords.length < 2) return false;
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return false;

  const pt = turf.point([point.lon, point.lat]);
  const line = turf.lineString(routeCoords);


  const distance = turf.pointToLineDistance(pt, line, { units: "kilometers" });

  return distance < thresholdKm;
}


export function distanceFromRoute(point, routeCoords) {
  if (!routeCoords || routeCoords.length < 2) return Infinity;
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return Infinity;

  const pt = turf.point([point.lon, point.lat]);
  const line = turf.lineString(routeCoords);

  return turf.pointToLineDistance(pt, line, { units: "kilometers" });
}


export function getRouteDisruptions(routeCoords, incidents, options = {}) {
  const { thresholdKm = 50, includeRisk = true } = options;

  if (!routeCoords || routeCoords.length < 2) {
    return [];
  }

  if (!Array.isArray(incidents) || incidents.length === 0) {
    return [];
  }


  const routeLine = turf.lineString(routeCoords);


  const results = [];

  for (const raw of incidents) {
    const incident = normalizeIncident(raw);


    if (!Number.isFinite(incident.lat) || !Number.isFinite(incident.lon)) {
      continue;
    }


    const pt = turf.point([incident.lon, incident.lat]);
    const distanceKm = turf.pointToLineDistance(pt, routeLine, { units: "kilometers" });


    if (distanceKm >= thresholdKm) {
      continue;
    }


    const risk = includeRisk
      ? Number((incident.severity * (1 / (distanceKm + 1))).toFixed(2))
      : 0;

    results.push({
      category: incident.category,
      severity: incident.severity,
      distanceFromRoute: Number(distanceKm.toFixed(2)),
      lat: incident.lat,
      lon: incident.lon,
      confidence: incident.confidence,
      source: incident.source,
      description: incident.description,
      risk,
    });
  }


  results.sort((a, b) => {
    if (b.severity !== a.severity) return b.severity - a.severity;
    return a.distanceFromRoute - b.distanceFromRoute;
  });

  return results;
}


export const ROUTE_DISRUPTION_TYPES = Object.values(DISRUPTION_CATEGORIES);


export async function fetchLiveIncidentsForRoute(route) {
  if (!route?.geometry?.coordinates || route.geometry.coordinates.length === 0) {
    return [];
  }


  return [];
}

export default {
  DISRUPTION_CATEGORIES,
  ROUTE_DISRUPTION_TYPES,
  normalizeIncident,
  isNearRoute,
  distanceFromRoute,
  getRouteDisruptions,
  fetchLiveIncidentsForRoute,
};

