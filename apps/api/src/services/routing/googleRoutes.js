import { v4 as uuidv4 } from "uuid";
import { haversineKm } from "../../utils/geo.js";

const ROUTE_CACHE_TTL_MS = 5 * 60 * 1000;
const ROUTE_CACHE_MAX_SIZE = 100;

const routeCache = new Map();

function buildCacheKey(points) {
  return points.map((p) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`).join("|");
}

function getCachedRoute(key) {
  const entry = routeCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    routeCache.delete(key);
    return null;
  }
  return entry.route;
}

function setCachedRoute(key, route) {
  if (routeCache.size >= ROUTE_CACHE_MAX_SIZE) {
    const oldestKey = routeCache.keys().next().value;
    routeCache.delete(oldestKey);
  }
  routeCache.set(key, {
    route,
    expiresAt: Date.now() + ROUTE_CACHE_TTL_MS,
  });
}

const DEFAULT_OSRM_BASE_URL = "https://router.project-osrm.org";
const ALTERNATIVE_OSRM_URLS = [
  "https://routing.openstreetmap.de/routed-car",
  "https://osrm.gypsylab.net",
  "https://osrm.dakotahogan.com",
];

function getOsrmBaseUrl() {
  return (process.env.OSRM_BASE_URL || DEFAULT_OSRM_BASE_URL).replace(/\/$/, "");
}

const OPEN_ROUTE_SERVICE_URL = "https://api.openrouteservice.org/v2/directions/driving-car";
const GRAPH_HOPPER_URL = "https://graphhopper.com/api/1/route";

function getOpenRouteServiceApiKey() {
  return process.env.ORS_API_KEY || null;
}

function getGraphHopperConfig() {
  const selfHostedUrl = process.env.GRAPHHOPPER_URL;
  const apiKey = process.env.GRAPHHOPPER_API_KEY;

  if (selfHostedUrl) {
    return { url: selfHostedUrl.replace(/\/$/, ""), key: null };
  }
  if (apiKey) {
    return { url: GRAPH_HOPPER_URL, key: apiKey };
  }
  return null;
}

function createMockRoute(points) {
  const coordinates = [];

  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];

    const intermediatePoints = [];
    const numIntermediates = Math.max(2, Math.floor(haversineKm(start, end) / 100));

    for (let j = 1; j <= numIntermediates; j += 1) {
      const t = j / (numIntermediates + 1);
      const curveOffset = Math.sin(t * Math.PI * 2) * 0.01;
      const lat = start.lat + (end.lat - start.lat) * t + curveOffset;
      const lon = start.lon + (end.lon - start.lon) * t + curveOffset * Math.cos(t * Math.PI);
      intermediatePoints.push({ lat, lon });
    }

    coordinates.push([Number(start.lon.toFixed(6)), Number(start.lat.toFixed(6))]);

    for (let j = 0; j < intermediatePoints.length; j += 1) {
      const point = intermediatePoints[j];
      coordinates.push([Number(point.lon.toFixed(6)), Number(point.lat.toFixed(6))]);
    }

    coordinates.push([Number(end.lon.toFixed(6)), Number(end.lat.toFixed(6))]);
  }

  let totalDistanceKm = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    totalDistanceKm += haversineKm(points[i], points[i + 1]);
  }

  const avgKmh = 74;
  const durationS = Math.max(1, Math.round((totalDistanceKm / avgKmh) * 3600));

  return {
    distance_m: Math.round(totalDistanceKm * 1000),
    duration_s: durationS,
    geometry: {
      type: "LineString",
      coordinates,
    },
  };
}

function normalizeRoute(rawRoute) {
  return {
    route_id: uuidv4(),
    distance_m: Math.round(rawRoute.distance_m),
    duration_s: Math.max(1, Math.round(rawRoute.duration_s)),
    geometry: rawRoute.geometry,
  };
}

async function fetchOsrmRoute(points) {
  const coords = points.map((point) => `${point.lon},${point.lat}`).join(";");
  const isAlternateRoute = points.length > 2;
  const radiuses = isAlternateRoute
    ? `&radiuses=${["unlimited", ...Array(points.length - 2).fill(5000), "unlimited"].join(";")}`
    : "";
  const continueStraight = isAlternateRoute ? "&continue_straight=false" : "";
  const urls = [
    `${getOsrmBaseUrl()}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false&alternatives=false${radiuses}${continueStraight}`,
    ...ALTERNATIVE_OSRM_URLS.map(baseUrl =>
      `${baseUrl}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false&alternatives=false${radiuses}${continueStraight}`
    )
  ];

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        continue;
      }

      const payload = await response.json();
      const primary = payload?.routes?.[0];
      if (!primary || !primary.geometry || !Array.isArray(primary.geometry.coordinates)) {
        continue;
      }

      return {
        distance_m: Math.round(primary.distance),
        duration_s: Math.max(1, Math.round(primary.duration)),
        geometry: {
          type: "LineString",
          coordinates: primary.geometry.coordinates,
        },
      };
    } catch (error) {
      if (error.name === "AbortError") {
        console.warn(`OSRM instance ${url} timed out`);
      } else {
        console.warn(`OSRM instance ${url} failed:`, error.message);
      }
      continue;
    }
  }

  throw new Error("All OSRM instances failed");
}

async function fetchOpenRouteService(points) {
  const apiKey = getOpenRouteServiceApiKey();
  if (!apiKey) {
    throw new Error("OpenRouteService API key not configured");
  }

  const coordinates = points.map((point) => [point.lon, point.lat]);
  const url = OPEN_ROUTE_SERVICE_URL;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": apiKey,
      },
      body: JSON.stringify({
        coordinates,
        format: "geojson",
        instructions: false,
        geometry_simplify: false,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`OpenRouteService request failed with status ${response.status}`);
    }

    const payload = await response.json();
    const feature = payload?.features?.[0];
    if (!feature || !feature.geometry || !Array.isArray(feature.geometry.coordinates)) {
      throw new Error("OpenRouteService did not return a valid route payload");
    }

    const segments = Array.isArray(feature.properties?.segments)
      ? feature.properties.segments
      : [];
    const distanceM = segments.reduce(
      (sum, segment) => sum + Number(segment?.distance || 0),
      0
    );
    const durationS = segments.reduce(
      (sum, segment) => sum + Number(segment?.duration || 0),
      0
    );

    return {
      distance_m: Math.round(distanceM),
      duration_s: Math.max(1, Math.round(durationS)),
      geometry: {
        type: "LineString",
        coordinates: feature.geometry.coordinates,
      },
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error("OpenRouteService request timed out after 10000ms");
    }
    throw error;
  }
}

async function fetchGraphHopperRoute(points) {
  const config = getGraphHopperConfig();
  if (!config) {
    throw new Error("GraphHopper not configured. Set GRAPHHOPPER_URL (self-hosted) or GRAPHHOPPER_API_KEY (cloud).");
  }

  const coords = points.map((point) => `${point.lon},${point.lat}`).join("&point=");
  let url = `${config.url}?point=${coords}&vehicle=car&debug=false&calc_points=true&type=json&points_encoded=false`;
  if (config.key) {
    url += `&key=${encodeURIComponent(config.key)}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`GraphHopper request failed with status ${response.status}`);
    }

    const payload = await response.json();
    const path = payload?.paths?.[0];
    if (!path || !path.points || !Array.isArray(path.points.coordinates)) {
      throw new Error("GraphHopper did not return a valid route payload");
    }

    return {
      distance_m: Math.round(path.distance),
      duration_s: Math.max(1, Math.round(path.time / 1000)),
      geometry: {
        type: "LineString",
        coordinates: path.points.coordinates,
      },
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error("GraphHopper request timed out after 10000ms");
    }
    throw error;
  }
}

export async function computeRoute({ source, destination, intermediates = [] }) {
  const points = [source, ...intermediates, destination];
  const useMock = process.env.USE_MOCK_SERVICES === "true";

  if (useMock) {
    return normalizeRoute(createMockRoute(points));
  }

  const cacheKey = buildCacheKey(points);
  const cached = getCachedRoute(cacheKey);
  if (cached) {
    return { ...cached, route_id: uuidv4() };
  }

  let route = null;

  try {
    route = await fetchOsrmRoute(points);
  } catch (error) {
    console.warn("OSRM failed:", error.message);
  }

  if (!route) {
    try {
      route = await fetchGraphHopperRoute(points);
    } catch (error) {
      console.warn("GraphHopper failed:", error.message);
    }
  }

  if (!route) {
    try {
      route = await fetchOpenRouteService(points);
    } catch (error) {
      console.warn("OpenRouteService failed:", error.message);
    }
  }

  if (!route) {
    throw new Error("No routing service is available to compute a real route. Configure OSRM_BASE_URL, GRAPHHOPPER_URL, GRAPHHOPPER_API_KEY, or ORS_API_KEY.");
  }

  const normalized = normalizeRoute(route);
  setCachedRoute(cacheKey, normalized);
  return normalized;
}

