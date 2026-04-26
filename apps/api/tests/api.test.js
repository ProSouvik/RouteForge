import request from "supertest";
import { jest } from "@jest/globals";

process.env.USE_IN_MEMORY_DB = "true";
process.env.USE_MOCK_SERVICES = "true";
process.env.OPENWEATHER_API_KEY = "";
process.env.GOOGLE_MAPS_API_KEY = "";
process.env.HERE_API_KEY = "";
process.env.NASA_FIRMS_API_KEY = "";
process.env.USGS_API_ENABLED = "false";
process.env.GEMINI_API_KEY = "";
process.env.ORS_API_KEY = "";
process.env.GRAPHHOPPER_API_KEY = "";
process.env.GRAPHHOPPER_URL = "";

let app;
let resetInMemoryStore;
const nearRouteIncidentLocation = { lat: 33.2373, lon: -77.0989 };

beforeAll(async () => {
  const [{ createApp }, firestore] = await Promise.all([
    import("../src/index.js"),
    import("../src/services/db/firestore.js"),
  ]);
  app = createApp();
  resetInMemoryStore = firestore.__resetInMemoryStore;
});

beforeEach(() => {
  resetInMemoryStore();
});

async function createScenario() {
  const response = await request(app).post("/api/routes/compute").send({
    source: { lat: 40.7128, lon: -74.006 },
    destination: { lat: 25.7617, lon: -80.1918 },
    label: "New York -> Miami",
  });

  return response.body;
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

test("POST /api/routes/compute creates scenario and route", async () => {
  const response = await request(app).post("/api/routes/compute").send({
    source: { lat: 34.0522, lon: -118.2437 },
    destination: { lat: 41.8781, lon: -87.6298 },
    label: "LA -> Chicago",
  });

  expect(response.status).toBe(200);
  expect(response.body.scenario_id).toBeDefined();
  expect(response.body.route.distance_m).toBeGreaterThan(0);
  expect(response.body.route.duration_s).toBeGreaterThan(0);
});

test("POST /api/routes/compute only returns disruptions near the route corridor", async () => {
  const response = await request(app).post("/api/routes/compute").send({
    source: { lat: 40.7128, lon: -74.006 },
    destination: { lat: 25.7617, lon: -80.1918 },
    label: "New York -> Miami",
  });

  expect(response.status).toBe(200);
  expect(response.body.live_disruptions.length).toBeGreaterThan(0);
  expect(
    response.body.live_disruptions.every(
      (incident) => incident.distance_from_route_km <= 25
    )
  ).toBe(true);
});

test("POST /api/routes/disruption applies multiplier and returns reroute", async () => {
  const baseline = await createScenario();
  const disruption = await request(app).post("/api/routes/disruption").send({
    scenario_id: baseline.scenario_id,
    incidents: [
      {
        id: "test-incident-1",
        category: "weather",
        type: "Severe Weather",
        description: "Heavy rain causing delays",
        severity: "high",
        location: nearRouteIncidentLocation,
        reported_at: new Date().toISOString(),
      },
    ],
  });

  expect(disruption.status).toBe(200);
  expect(disruption.body.disruption.type).toBe("weather");
  expect(disruption.body.disruption.locations[0]).toEqual(nearRouteIncidentLocation);
  expect(disruption.body.reroute.provider).toBe("routed_bypass");
  expect(disruption.body.reroute.bypass_waypoints.length).toBeGreaterThan(0);
  expect(
    disruption.body.reroute.bypass_waypoints.some(
      (point) =>
        point.lat === nearRouteIncidentLocation.lat &&
        point.lon === nearRouteIncidentLocation.lon
    )
  ).toBe(false);


  expect(disruption.body.reroute.distance_m).toBeGreaterThan(baseline.route.distance_m);
  expect(disruption.body.reroute.duration_s).toBeGreaterThan(baseline.route.duration_s);


  expect(disruption.body.reroute.multiplier_applied).toBeGreaterThanOrEqual(1.5);
  expect(disruption.body.reroute.multiplier_applied).toBeLessThanOrEqual(2.0);
});

test("POST /api/routes/disruption falls back when routed detour is unavailable", async () => {
  const baseline = await createScenario();
  const originalFetch = global.fetch;
  const originalUseMock = process.env.USE_MOCK_SERVICES;
  const originalGraphhopperUrl = process.env.GRAPHHOPPER_URL;
  const originalGraphhopperKey = process.env.GRAPHHOPPER_API_KEY;
  const originalOrsKey = process.env.ORS_API_KEY;
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

  process.env.USE_MOCK_SERVICES = "false";
  process.env.GRAPHHOPPER_URL = "";
  process.env.GRAPHHOPPER_API_KEY = "";
  process.env.ORS_API_KEY = "";
  global.fetch = jest.fn().mockResolvedValue({ ok: false });

  try {
    const disruption = await request(app).post("/api/routes/disruption").send({
      scenario_id: baseline.scenario_id,
      incidents: [
        {
          id: "test-incident-fallback",
          category: "road_closure",
          type: "Road Closure",
          description: "Road closure forces fallback detour",
          severity: 8,
          location: nearRouteIncidentLocation,
        },
      ],
    });

    expect(disruption.status).toBe(200);
    expect(disruption.body.reroute.provider).toBe("fallback_detour");
    expect(disruption.body.reroute.geometry.coordinates.length).toBeGreaterThan(2);
    expect(disruption.body.reroute.distance_m).toBeGreaterThan(0);
  } finally {
    warnSpy.mockRestore();
    global.fetch = originalFetch;
    restoreEnv("USE_MOCK_SERVICES", originalUseMock);
    restoreEnv("GRAPHHOPPER_URL", originalGraphhopperUrl);
    restoreEnv("GRAPHHOPPER_API_KEY", originalGraphhopperKey);
    restoreEnv("ORS_API_KEY", originalOrsKey);
  }
});

test("POST /api/routes/disruption rejects disruptions outside the baseline route corridor", async () => {
  const baseline = await createScenario();
  const response = await request(app).post("/api/routes/disruption").send({
    scenario_id: baseline.scenario_id,
    incidents: [
      {
        id: "far-away-incident",
        category: "weather",
        type: "Severe Weather",
        description: "Weather far away from this shipment lane",
        severity: "high",
        location: { lat: 34.0522, lon: -118.2437 },
      },
    ],
  });

  expect(response.status).toBe(400);
  expect(response.body.code).toBe("DISRUPTIONS_NOT_ON_ROUTE");
});

test("POST /api/reasoning returns reasoning text", async () => {
  const baseline = await createScenario();
  const response = await request(app).post("/api/reasoning").send({
    scenario_id: baseline.scenario_id,
  });

  expect(response.status).toBe(200);
  expect(typeof response.body.reasoning).toBe("string");
  expect(response.body.reasoning.length).toBeGreaterThan(0);
});

test("POST /api/chat returns grounded reply", async () => {
  const baseline = await createScenario();
  await request(app).post("/api/routes/disruption").send({
    scenario_id: baseline.scenario_id,
    incidents: [
      {
        id: "test-incident-chat",
        category: "congestion",
        type: "Traffic Delay",
        description: "Heavy traffic causing delays",
        severity: "medium",
        location: nearRouteIncidentLocation,
        reported_at: new Date().toISOString(),
      },
    ],
  });

  const response = await request(app).post("/api/chat").send({
    scenario_id: baseline.scenario_id,
    message: "Should we dispatch now?",
  });

  expect(response.status).toBe(200);
  expect(typeof response.body.reply).toBe("string");
  expect(response.body.reply.toLowerCase()).toContain("scenario");
});

test("GET /api/scenarios lists saved scenarios", async () => {
  await createScenario();

  const response = await request(app).get("/api/scenarios");

  expect(response.status).toBe(200);
  expect(Array.isArray(response.body.scenarios)).toBe(true);
  expect(response.body.scenarios.length).toBe(1);
});

test("GET /api/scenarios/:id returns full scenario", async () => {
  const baseline = await createScenario();

  const response = await request(app).get(`/api/scenarios/${baseline.scenario_id}`);

  expect(response.status).toBe(200);
  expect(response.body.scenario_id).toBe(baseline.scenario_id);
  expect(Array.isArray(response.body.events)).toBe(true);
});

test("GET /api/scenarios/:id/playback returns ordered events", async () => {
  const baseline = await createScenario();
  await request(app).post("/api/routes/disruption").send({
    scenario_id: baseline.scenario_id,
    incidents: [
      {
        id: "test-incident-playback",
        category: "road_closure",
        type: "Road Closure",
        description: "Highway closed for maintenance",
        severity: "medium",
        location: nearRouteIncidentLocation,
        reported_at: new Date().toISOString(),
      },
    ],
  });

  const response = await request(app).get(
    `/api/scenarios/${baseline.scenario_id}/playback`
  );

  expect(response.status).toBe(200);
  expect(response.body.events.map((event) => event.kind)).toEqual([
    "initial_route",
    "disruption",
    "reroute",
  ]);
});

test("unknown scenario returns 404", async () => {
  const response = await request(app).get("/api/scenarios/does-not-exist");

  expect(response.status).toBe(404);
  expect(response.body.code).toBe("SCENARIO_NOT_FOUND");
});
