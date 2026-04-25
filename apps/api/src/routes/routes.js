import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { ApiError } from "../middleware/error.js";
import { computeRoute } from "../services/googleRoutes.js";
import { createScenario, getScenarioById, updateScenario } from "../services/firestore.js";
import { generateReasoning } from "../services/gemini.js";
import { collectAllDisruptions } from "../services/disruptionCollectors.js";
import {
  DISRUPTION_DURATION_MULTIPLIER,
  DISRUPTION_MIN_OFFSET_KM,
  DISRUPTION_OFFSET_PCT,
  calculateCostUsd,
  calculateRiskScore,
  destinationPoint,
  haversineKm,
  initialBearingRad,
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
  id: z.string(),
  category: z.string(),
  type: z.string(),
  description: z.string(),
  severity: z.string(),
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

    const disruptionType = body.incidents.length > 1 ? "multiple_disruptions" : body.incidents[0].category;
    const severity = body.incidents.length > 1 ? "high" : body.incidents[0].severity || "unknown";
    const gcDistanceKm = haversineKm(scenario.source, scenario.destination);
    const routeBearing = initialBearingRad(scenario.source, scenario.destination);

    const waypoints = body.incidents.map((incident, index) => {
      if (!incident.location || !Number.isFinite(incident.location.lat) || !Number.isFinite(incident.location.lon)) {
        throw new ApiError(400, "Incident must include a valid lat/lon location", "INVALID_INCIDENT_LOCATION");
      }

      const minOffset = DISRUPTION_MIN_OFFSET_KM[incident.category] || 25;
      const pctOffset = gcDistanceKm * (DISRUPTION_OFFSET_PCT[incident.category] || 0.10);
      const offsetKm = Math.min(80, Math.max(minOffset, pctOffset));

      const side = index % 2 === 0 ? 1 : -1;
      const perpendicularBearing = routeBearing + (side * Math.PI / 2);

      return destinationPoint(incident.location, perpendicularBearing, offsetKm);
    });

    const rerouteRaw = await computeRoute({
      source: scenario.source,
      destination: scenario.destination,
      intermediates: waypoints,
    });

    const dominantCategory = body.incidents[0].category || "other";
    const typeMultiplier = DISRUPTION_DURATION_MULTIPLIER[dominantCategory] || 1.25;
    const countMultiplier = 1.0 + (body.incidents.length * 0.15);
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
      locations: waypoints,
      notes: body.incidents.map((incident, index) => `Disruption ${index + 1}: ${incident.description}`),
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
        disruptionType: body.incidents.length > 1 ? "multiple live disruptions" : body.incidents[0].category,
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
