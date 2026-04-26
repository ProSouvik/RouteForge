import { Router } from "express";
import * as turf from "@turf/turf";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { ApiError } from "../middleware/error.js";
import { computeRoute } from "../services/routing/googleRoutes.js";
import { createScenario, getScenarioById, updateScenario } from "../services/db/firestore.js";
import { generateReasoning } from "../services/ai/gemini.js";
import {
  ROUTE_DISRUPTION_THRESHOLD_KM,
  collectAllDisruptions,
  getRouteImpactThresholdKm,
} from "../services/disruptions/collectors.js";
import {
  DISRUPTION_DURATION_MULTIPLIER,
  calculateCostUsd,
  calculateRiskScore,
  haversineKm,
  reverseGeocode,
} from "../utils/geo.js";

const router = Router();

const coordinateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

const computeSchema = z.object({
  source: coordinateSchema,
  destination: coordinateSchema,
  label: z.string().max(120).optional(),
});

const incidentSchema = z.object({
  id: z.string().optional(),
  category: z.string().optional().default("other"),
  type: z.string().optional().default("UNKNOWN"),
  description: z.string().optional().default("Disruption near route"),
  severity: z.union([z.string(), z.number()]).optional().transform((value) =>
    value == null ? "unknown" : String(value)
  ),
  location: z.object({
    lat: z.number(),
    lon: z.number(),
  }),
  provider: z.string().optional(),
});

const disruptionSchema = z.object({
  scenario_id: z.string().min(1),
  incidents: z.array(incidentSchema).min(1),
});

async function buildLabel(source, destination, provided) {
  if (provided && provided.trim()) {
    return provided.trim();
  }

  const [sourceName, destinationName] = await Promise.all([
    reverseGeocode(source),
    reverseGeocode(destination),
  ]);

  if (sourceName && destinationName) {
    return `${sourceName} → ${destinationName}`;
  }

  return `${source.lat.toFixed(2)},${source.lon.toFixed(2)} → ${destination.lat.toFixed(
    2
  )},${destination.lon.toFixed(2)}`;
}

function makeReasoningContext({
  label,
  source,
  destination,
  baselineRoute,
  rerouteRoute = null,
  disruptionType = null,
}) {
  return {
    label,
    source,
    destination,
    baselineRoute,
    rerouteRoute,
    disruptionType,
  };
}

function coordToPoint([lon, lat]) {
  return { lat, lon };
}

function calculateGeometryDistanceM(coordinates) {
  let distanceKm = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    distanceKm += haversineKm(
      coordToPoint(coordinates[index - 1]),
      coordToPoint(coordinates[index])
    );
  }
  return Math.round(distanceKm * 1000);
}

function findNearestCoordinateIndex(coordinates, point) {
  let nearestIndex = 0;
  let nearestDistance = Infinity;

  coordinates.forEach((coordinate, index) => {
    const distance = haversineKm(coordToPoint(coordinate), point);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}

function createFallbackDetourRoute({ baselineRoute, waypoints }) {
  const baselineCoords = baselineRoute?.geometry?.coordinates || [];

  if (baselineCoords.length < 2 || waypoints.length === 0) {
    const coordinates = waypoints.map((point) => [point.lon, point.lat]);
    if (coordinates.length < 2) {
      return {
        route_id: uuidv4(),
        distance_m: 1,
        duration_s: 1,
        geometry: { type: "LineString", coordinates: coordinates.length ? coordinates : [[0, 0], [1, 1]] },
        provider: "fallback_detour",
      };
    }
    const distanceM = calculateGeometryDistanceM(coordinates);
    return {
      route_id: uuidv4(),
      distance_m: Math.max(1, distanceM),
      duration_s: Math.max(1, Math.round((distanceM / 1000 / 74) * 3600)),
      geometry: { type: "LineString", coordinates },
      provider: "fallback_detour",
    };
  }

  const routeLine = turf.lineString(baselineCoords);
  const routeLengthKm = turf.length(routeLine, { units: "kilometers" });

  const waypointZones = waypoints.map((point) => {
    const pt = turf.point([point.lon, point.lat]);
    const nearest = turf.nearestPointOnLine(routeLine, pt, { units: "kilometers" });
    const routeKm = clampNumber(Number(nearest.properties?.location || 0), 0, routeLengthKm);
    const distanceFromRoute = turf.distance(pt, nearest, { units: "kilometers" });
    return { point, routeKm, distanceFromRoute };
  }).sort((a, b) => a.routeKm - b.routeKm);

  const coordinates = [];
  let lastAddedKm = 0;

  for (const zone of waypointZones) {
    const approachKm = clampNumber(zone.routeKm - Math.max(3, zone.distanceFromRoute * 0.5), lastAddedKm, routeLengthKm);
    const departKm = clampNumber(zone.routeKm + Math.max(3, zone.distanceFromRoute * 0.5), approachKm, routeLengthKm);

    if (approachKm > lastAddedKm) {
      const segment = turf.lineSliceAlong(routeLine, lastAddedKm, approachKm, { units: "kilometers" });
      if (segment && segment.geometry && segment.geometry.coordinates) {
        coordinates.push(...segment.geometry.coordinates);
      }
    }

    const approachPoint = turf.along(routeLine, approachKm, { units: "kilometers" });
    const departPoint = turf.along(routeLine, departKm, { units: "kilometers" });

    coordinates.push([Number(approachPoint.geometry.coordinates[0].toFixed(6)), Number(approachPoint.geometry.coordinates[1].toFixed(6))]);
    coordinates.push([Number(zone.point.lon.toFixed(6)), Number(zone.point.lat.toFixed(6))]);
    coordinates.push([Number(departPoint.geometry.coordinates[0].toFixed(6)), Number(departPoint.geometry.coordinates[1].toFixed(6))]);

    lastAddedKm = departKm;
  }

  if (lastAddedKm < routeLengthKm) {
    const tail = turf.lineSliceAlong(routeLine, lastAddedKm, routeLengthKm, { units: "kilometers" });
    if (tail && tail.geometry && tail.geometry.coordinates) {
      const tailCoords = tail.geometry.coordinates;
      if (tailCoords.length > 0 && coordinates.length > 0) {
        const lastCoord = coordinates[coordinates.length - 1];
        const firstTail = tailCoords[0];
        if (lastCoord[0] === firstTail[0] && lastCoord[1] === firstTail[1]) {
          coordinates.push(...tailCoords.slice(1));
        } else {
          coordinates.push(...tailCoords);
        }
      } else {
        coordinates.push(...tailCoords);
      }
    }
  }

  const deduped = [];
  for (const coord of coordinates) {
    const last = deduped[deduped.length - 1];
    if (!last || last[0] !== coord[0] || last[1] !== coord[1]) {
      deduped.push(coord);
    }
  }

  const distanceM = calculateGeometryDistanceM(deduped);
  const baselineDistanceM = baselineRoute.distance_m || calculateGeometryDistanceM(baselineCoords);
  const baselineDurationS = baselineRoute.duration_s || Math.round((baselineDistanceM / 1000 / 74) * 3600);
  const baselineKmh = baselineDistanceM > 0 && baselineDurationS > 0
    ? (baselineDistanceM / 1000) / (baselineDurationS / 3600)
    : 74;
  const durationS = Math.max(
    Math.round(baselineDurationS * 1.05),
    Math.round((distanceM / 1000 / baselineKmh) * 3600)
  );

  return {
    route_id: uuidv4(),
    distance_m: Math.max(1, distanceM),
    duration_s: Math.max(1, durationS),
    geometry: {
      type: "LineString",
      coordinates: deduped,
    },
    provider: "fallback_detour",
  };
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function featureToPoint(feature) {
  const [lon, lat] = feature.geometry.coordinates;
  return {
    lat: Number(lat.toFixed(6)),
    lon: Number(lon.toFixed(6)),
  };
}

function getAvoidRadiusKm(incident) {
  const thresholds = {
    accident: 4,
    congestion: 4,
    construction: 4,
    hazard: 5,
    road_closure: 6,
    vehicle_breakdown: 3,
    police_activity: 4,
    special_event: 5,
    weather: 14,
    natural_disaster: 24,
    other: 5,
  };
  const category = incident.category || "other";
  const base = thresholds[category] || thresholds.other;
  const distanceFromRoute = Number(incident.distance_from_route_km || 0);
  return clampNumber(Math.max(base, distanceFromRoute + 1.5), 2, 35);
}

function analyzeIncidentAgainstRoute(incident, baselineRoute) {
  const coordinates = baselineRoute?.geometry?.coordinates;
  if (!coordinates || coordinates.length < 2) {
    return null;
  }

  const lat = Number(incident.location?.lat);
  const lon = Number(incident.location?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  const routeLine = turf.lineString(coordinates);
  const routeLengthKm = turf.length(routeLine, { units: "kilometers" });
  const incidentPoint = turf.point([lon, lat]);
  const nearest = turf.nearestPointOnLine(routeLine, incidentPoint, {
    units: "kilometers",
  });
  const routeKm = clampNumber(Number(nearest.properties?.location || 0), 0, routeLengthKm);
  const distanceFromRouteKm = turf.distance(incidentPoint, nearest, {
    units: "kilometers",
  });
  const avoidRadiusKm = getAvoidRadiusKm({
    ...incident,
    distance_from_route_km: distanceFromRouteKm,
  });
  const windowKm = clampNumber(avoidRadiusKm * 2.5, 5, 70);
  const beforeKm = clampNumber(routeKm - windowKm, 0, routeLengthKm);
  const afterKm = clampNumber(routeKm + windowKm, 0, routeLengthKm);
  const beforeFeature = turf.along(routeLine, beforeKm, { units: "kilometers" });
  const afterFeature = turf.along(routeLine, afterKm, { units: "kilometers" });
  let bearingDeg = turf.bearing(beforeFeature, afterFeature);

  if (!Number.isFinite(bearingDeg)) {
    bearingDeg = 0;
  }

  return {
    incident,
    routeKm,
    routeLengthKm,
    beforeKm,
    afterKm,
    nearestFeature: nearest,
    beforePoint: featureToPoint(beforeFeature),
    afterPoint: featureToPoint(afterFeature),
    bearingDeg,
    avoidRadiusKm,
    distanceFromRouteKm,
  };
}

function buildBypassWaypoint(analysis, side, offsetFactor) {
  const offsetKm = clampNumber(analysis.avoidRadiusKm * offsetFactor, 12, 80);
  const bypass = turf.destination(
    analysis.nearestFeature,
    offsetKm,
    analysis.bearingDeg + side * 90,
    { units: "kilometers" }
  );
  return featureToPoint(bypass);
}

function dedupeWaypoints(orderedWaypoints, source, destination) {
  const waypoints = [];

  for (const item of orderedWaypoints) {
    const point = item.point;
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) {
      continue;
    }
    if (haversineKm(source, point) < 0.5 || haversineKm(destination, point) < 0.5) {
      continue;
    }

    const previous = waypoints[waypoints.length - 1];
    if (previous && haversineKm(previous, point) < 0.5) {
      continue;
    }

    waypoints.push(point);
  }

  return waypoints;
}

function clusterAnalyses(analyses) {
  if (analyses.length <= 1) {
    return analyses.map((a) => [a]);
  }

  const sorted = [...analyses].sort((a, b) => a.routeKm - b.routeKm);
  const clusters = [];
  let currentCluster = [sorted[0]];

  for (let i = 1; i < sorted.length; i += 1) {
    const last = currentCluster[currentCluster.length - 1];
    const current = sorted[i];

    if (current.beforeKm <= last.afterKm + 2) {
      currentCluster.push(current);
    } else {
      clusters.push(currentCluster);
      currentCluster = [current];
    }
  }

  clusters.push(currentCluster);
  return clusters;
}

function buildClusterBypassWaypoint(cluster, side, offsetFactor, baselineCoords) {
  const first = cluster[0];
  const last = cluster[cluster.length - 1];

  if (!baselineCoords || baselineCoords.length < 2) {
    return buildBypassWaypoint(first, side, offsetFactor);
  }

  const routeLine = turf.lineString(baselineCoords);
  const routeLengthKm = first.routeLengthKm;

  const midKm = clampNumber((first.beforeKm + last.afterKm) / 2, 0, routeLengthKm);
  const midOnRoute = turf.along(routeLine, midKm, { units: "kilometers" });

  const lookAheadKm = clampNumber(midKm + Math.min(5, routeLengthKm * 0.02), 0, routeLengthKm);
  const lookBehindKm = clampNumber(midKm - Math.min(5, routeLengthKm * 0.02), 0, routeLengthKm);
  const ahead = turf.along(routeLine, lookAheadKm, { units: "kilometers" });
  const behind = turf.along(routeLine, lookBehindKm, { units: "kilometers" });
  let segmentBearing = turf.bearing(behind, ahead);

  if (!Number.isFinite(segmentBearing)) {
    segmentBearing = first.bearingDeg || 0;
  }

const maxAvoid = Math.max(...cluster.map((a) => a.avoidRadiusKm));
  const offsetKm = clampNumber(maxAvoid * offsetFactor, 12, 80);

  const bypass = turf.destination(
    midOnRoute,
    offsetKm,
    segmentBearing + side * 90,
    { units: "kilometers" }
  );

  return featureToPoint(bypass);
}

function buildBypassWaypoints({ analyses, source, destination, side, offsetFactor, baselineRoute }) {
  if (!analyses || analyses.length === 0) {
    return [];
  }

  const baselineCoords = baselineRoute?.geometry?.coordinates || [];
  const clusters = clusterAnalyses(analyses);
  const waypoints = [];

  for (const cluster of clusters) {
    const bypassPoint = buildClusterBypassWaypoint(cluster, side, offsetFactor, baselineCoords);
    const first = cluster[0];
    const last = cluster[cluster.length - 1];
    const order = (first.beforeKm + last.afterKm) / 2;

    waypoints.push({ order, point: bypassPoint });
  }

  waypoints.sort((a, b) => a.order - b.order);
  return dedupeWaypoints(waypoints, source, destination);
}

function routeDistanceFromIncidentKm(route, incident) {
  const coordinates = route?.geometry?.coordinates;
  if (!coordinates || coordinates.length < 2) {
    return Infinity;
  }

  const lat = Number(incident.location?.lat);
  const lon = Number(incident.location?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return Infinity;
  }

  return turf.pointToLineDistance(
    turf.point([lon, lat]),
    turf.lineString(coordinates),
    { units: "kilometers" }
  );
}

function calculateProjectedBacktrackKm(route, baselineRoute) {
  const routeCoords = route?.geometry?.coordinates || [];
  const baselineCoords = baselineRoute?.geometry?.coordinates || [];

  if (routeCoords.length < 2 || baselineCoords.length < 2) {
    return 0;
  }

  const baselineLine = turf.lineString(baselineCoords);
  let furthestKm = 0;
  let backtrackKm = 0;
  const sampleEvery = Math.max(1, Math.floor(routeCoords.length / 80));

  for (let index = 0; index < routeCoords.length; index += sampleEvery) {
    const locationKm = Number(
      turf.nearestPointOnLine(
        baselineLine,
        turf.point(routeCoords[index]),
        { units: "kilometers" }
      ).properties?.location || 0
    );

    if (locationKm + 3 < furthestKm) {
      backtrackKm += furthestKm - locationKm;
    } else {
      furthestKm = Math.max(furthestKm, locationKm);
    }
  }

  return Number(backtrackKm.toFixed(2));
}

function scoreAlternateRoute({ route, baselineRoute, analyses }) {
  const baselineDistanceM = Math.max(1, baselineRoute.distance_m || 1);
  const baselineDurationS = Math.max(1, baselineRoute.duration_s || 1);
  const distanceRatio = route.distance_m / baselineDistanceM;
  const durationRatio = route.duration_s / baselineDurationS;
  const backtrackKm = calculateProjectedBacktrackKm(route, baselineRoute);
  let avoidPenaltyKm = 0;

  const incidentDistances = analyses.map((analysis) => {
    const distanceKm = routeDistanceFromIncidentKm(route, analysis.incident);
    const minimumClearanceKm = Math.max(1.5, analysis.avoidRadiusKm * 0.75);

    if (distanceKm < minimumClearanceKm) {
      avoidPenaltyKm += minimumClearanceKm - distanceKm;
    }

    return Number(distanceKm.toFixed(2));
  });

  const ratioPenalty =
    Math.max(0, distanceRatio - 1.6) * 100 +
    Math.max(0, durationRatio - 2.0) * 100;
  const score =
    route.duration_s +
    route.distance_m / 30 +
    avoidPenaltyKm * 120000 +
    backtrackKm * 80000 +
    ratioPenalty * 1000;

  return {
    score,
    avoidPenaltyKm: Number(avoidPenaltyKm.toFixed(2)),
    backtrackKm,
    distanceRatio: Number(distanceRatio.toFixed(2)),
    durationRatio: Number(durationRatio.toFixed(2)),
    incidentDistances,
    isPractical:
      avoidPenaltyKm < 0.25 &&
      backtrackKm < 15 &&
      distanceRatio < 2.0 &&
      durationRatio < 2.5,
  };
}

async function computeBestAlternateRoute({ scenario, baselineRoute, analyses }) {
  const candidateSpecs = [];
  for (const side of [1, -1]) {
    for (const offsetFactor of [1.0, 1.5, 2.0, 3.0]) {
      candidateSpecs.push({
        side,
        offsetFactor,
        waypoints: buildBypassWaypoints({
          analyses,
          source: scenario.source,
          destination: scenario.destination,
          side,
          offsetFactor,
          baselineRoute,
        }),
      });
    }
  }

  const scoredRoutes = [];
  let lastError = null;

  for (const spec of candidateSpecs) {
    if (spec.waypoints.length === 0) {
      continue;
    }

    try {
      const route = await computeRoute({
        source: scenario.source,
        destination: scenario.destination,
        intermediates: spec.waypoints,
      });
      const quality = scoreAlternateRoute({ route, baselineRoute, analyses });
      scoredRoutes.push({ route, quality, spec });
    } catch (error) {
      lastError = error;
      console.warn(
        `Alternate candidate side=${spec.side} offset=${spec.offsetFactor} failed:`,
        error.message
      );
    }
  }

  scoredRoutes.sort((a, b) => {
    if (a.quality.isPractical !== b.quality.isPractical) {
      return a.quality.isPractical ? -1 : 1;
    }
    return a.quality.score - b.quality.score;
  });

  if (scoredRoutes.length > 0) {
    const best = scoredRoutes[0];
    return {
      ...best.route,
      provider: best.route.provider || "routed_bypass",
      bypass_waypoints: best.spec.waypoints,
      route_quality: best.quality,
    };
  }

  const fallbackSpec = candidateSpecs.find((spec) => spec.waypoints.length > 0);
  if (!fallbackSpec) {
    throw lastError || new Error("No bypass waypoints could be generated");
  }

  const fallback = createFallbackDetourRoute({
    baselineRoute,
    waypoints: fallbackSpec.waypoints,
  });

  return {
    ...fallback,
    bypass_waypoints: fallbackSpec.waypoints,
    route_quality: scoreAlternateRoute({
      route: fallback,
      baselineRoute,
      analyses,
    }),
  };
}

function getIncidentDistanceFromRouteKm(incident, routeLine) {
  const lat = Number(incident.location?.lat);
  const lon = Number(incident.location?.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return Infinity;
  }

  return turf.pointToLineDistance(turf.point([lon, lat]), routeLine, {
    units: "kilometers",
  });
}

function filterSelectedIncidentsNearRoute(incidents, baselineRoute) {
  const coordinates = baselineRoute?.geometry?.coordinates;
  if (!coordinates || coordinates.length < 2) {
    return [];
  }

  const routeLine = turf.lineString(coordinates);

  return incidents
    .map((incident) => {
      const distanceKm = getIncidentDistanceFromRouteKm(incident, routeLine);
      const thresholdKm = getRouteImpactThresholdKm(incident);
      return {
        ...incident,
        distance_from_route_km: Number.isFinite(distanceKm)
          ? Number(distanceKm.toFixed(2))
          : Infinity,
        route_impact_threshold_km: thresholdKm,
      };
    })
    .filter(
      (incident) =>
        Number.isFinite(incident.distance_from_route_km) &&
        incident.distance_from_route_km <=
          Math.min(ROUTE_DISRUPTION_THRESHOLD_KM, incident.route_impact_threshold_km)
    );
}

router.post("/compute", async (req, res, next) => {
  try {
    const body = computeSchema.parse(req.body);
    const route = await computeRoute({
      source: body.source,
      destination: body.destination,
    });

    const liveDisruptions = await collectAllDisruptions(route.geometry.coordinates);

    const scenarioId = uuidv4();
    const label = await buildLabel(body.source, body.destination, body.label);
    const riskScore = calculateRiskScore(route.distance_m, route.duration_s, null);
    const costUsd = calculateCostUsd(route.distance_m, route.duration_s);

    const initialEvent = {
      event_id: uuidv4(),
      kind: "initial_route",
      ts: new Date().toISOString(),
      route,
      risk_score: riskScore,
      cost_usd: costUsd,
    };

    const reasoning = await generateReasoning(
      makeReasoningContext({
        label,
        source: body.source,
        destination: body.destination,
        baselineRoute: route,
      })
    );

    const scenario = await createScenario({
      scenario_id: scenarioId,
      label,
      source: body.source,
      destination: body.destination,
      active_disruption: null,
      reasoning,
      events: [initialEvent],
    });

    res.json({
      scenario_id: scenario.scenario_id,
      label: scenario.label,
      route: {
        ...route,
        risk_score: riskScore,
        cost_usd: costUsd,
      },
      live_disruptions: liveDisruptions,
      risk_score: riskScore,
      cost_usd: costUsd,
      reasoning,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/disruption", async (req, res, next) => {
  try {
    const body = disruptionSchema.parse(req.body);
    const scenario = await getScenarioById(body.scenario_id);

    if (!scenario) {
      throw new ApiError(404, "Scenario not found", "SCENARIO_NOT_FOUND");
    }

    const initialRouteEvent = scenario.events.find((event) => event.kind === "initial_route");
    if (!initialRouteEvent?.route) {
      throw new ApiError(
        409,
        "Scenario has no initial route event",
        "INVALID_SCENARIO_STATE"
      );
    }

    const relevantIncidents = filterSelectedIncidentsNearRoute(
      body.incidents,
      initialRouteEvent.route
    );

    if (relevantIncidents.length === 0) {
      throw new ApiError(
        400,
        `Selected disruptions are outside the ${ROUTE_DISRUPTION_THRESHOLD_KM} km route corridor`,
        "DISRUPTIONS_NOT_ON_ROUTE"
      );
    }

    const analyses = relevantIncidents
      .map((incident) => analyzeIncidentAgainstRoute(incident, initialRouteEvent.route))
      .filter(Boolean)
      .sort((a, b) => a.routeKm - b.routeKm);

    if (analyses.length === 0) {
      throw new ApiError(
        400,
        "Selected disruptions could not be matched to the baseline route",
        "INVALID_INCIDENT_LOCATION"
      );
    }

    const disruptionType = relevantIncidents.length > 1 ? "multiple_disruptions" : relevantIncidents[0].category || "other";
    const severity = relevantIncidents.length > 1 ? "high" : relevantIncidents[0].severity || "unknown";

    const rerouteRaw = await computeBestAlternateRoute({
      scenario,
      baselineRoute: initialRouteEvent.route,
      analyses,
    });

    const dominantCategory = relevantIncidents[0].category || "other";
    const typeMultiplier = DISRUPTION_DURATION_MULTIPLIER[dominantCategory] || 1.25;
    const countMultiplier = 1.0 + (relevantIncidents.length * 0.15);
    const multiplier = Number(Math.max(1.05, typeMultiplier * countMultiplier).toFixed(2));

    const baselineDurationS = initialRouteEvent.route.duration_s;
    const detourDurationS = Math.max(0, rerouteRaw.duration_s - baselineDurationS);
    const adjustedDurationS = Math.round(baselineDurationS + (detourDurationS * multiplier));

    const reroute = {
      ...rerouteRaw,
      duration_s: Math.max(1, adjustedDurationS),
    };

    const riskScore = calculateRiskScore(
      reroute.distance_m,
      reroute.duration_s,
      disruptionType
    );
    const costUsd = calculateCostUsd(reroute.distance_m, reroute.duration_s);

    const disruption = {
      type: disruptionType,
      severity,
      locations: relevantIncidents.map((incident) => incident.location),
      bypass_waypoints: rerouteRaw.bypass_waypoints || [],
      route_quality: rerouteRaw.route_quality,
      incidents: relevantIncidents.map((incident) => ({
        id: incident.id,
        category: incident.category,
        type: incident.type,
        description: incident.description,
        severity: incident.severity,
        location: incident.location,
        provider: incident.provider,
        distance_from_route_km: incident.distance_from_route_km,
        route_impact_threshold_km: incident.route_impact_threshold_km,
      })),
      ignored_incident_count: body.incidents.length - relevantIncidents.length,
      notes: relevantIncidents.map((incident, index) => `Disruption ${index + 1}: ${incident.description}`),
    };

    const disruptionEvent = {
      event_id: uuidv4(),
      kind: "disruption",
      ts: new Date().toISOString(),
      disruption_type: disruption.type,
      severity: disruption.severity,
      locations: disruption.locations,
      notes: disruption.notes,
    };

    const rerouteEvent = {
      event_id: uuidv4(),
      kind: "reroute",
      ts: new Date().toISOString(),
      route: reroute,
      risk_score: riskScore,
      cost_usd: costUsd,
    };

    const reasoning = await generateReasoning(
      makeReasoningContext({
        label: scenario.label,
        source: scenario.source,
        destination: scenario.destination,
        baselineRoute: initialRouteEvent.route,
        rerouteRoute: reroute,
        disruptionType: relevantIncidents.length > 1 ? "multiple live disruptions" : relevantIncidents[0].category || "other",
      })
    );

    await updateScenario(body.scenario_id, (draft) => {
      const initialOnly = draft.events.filter((event) => event.kind === "initial_route");
      draft.events = [...initialOnly, disruptionEvent, rerouteEvent];
      draft.active_disruption = disruption;
      draft.reasoning = reasoning;
      return draft;
    });

    res.json({
      scenario_id: body.scenario_id,
      disruption,
      reroute: {
        ...reroute,
        risk_score: riskScore,
        cost_usd: costUsd,
        multiplier_applied: multiplier,
      },
      reasoning,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
