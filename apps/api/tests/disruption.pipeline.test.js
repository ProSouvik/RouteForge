import request from "supertest";

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

describe("route to disruption pipeline", () => {
  test("compute returns live disruptions near route", async () => {
    const response = await request(app).post("/api/routes/compute").send({
      source: { lat: 40.7128, lon: -74.006 },
      destination: { lat: 25.7617, lon: -80.1918 },
    });

    expect(response.status).toBe(200);
    expect(response.body.scenario_id).toBeDefined();
    expect(Array.isArray(response.body.live_disruptions)).toBe(true);
    expect(response.body.route.distance_m).toBeGreaterThan(0);
    expect(response.body.route.duration_s).toBeGreaterThan(0);
  });

  test("disruption endpoint rejects far-away incidents", async () => {
    const baseline = await createScenario();
    const response = await request(app).post("/api/routes/disruption").send({
      scenario_id: baseline.scenario_id,
      incidents: [
        {
          id: "far-away",
          category: "weather",
          type: "Severe Weather",
          description: "Weather far from route",
          severity: "high",
          location: { lat: 60.0, lon: 10.0 },
        },
      ],
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("DISRUPTIONS_NOT_ON_ROUTE");
  });

  test("disruption endpoint accepts near-route incidents", async () => {
    const baseline = await createScenario();
    const nearRouteLocation = { lat: 33.2373, lon: -77.0989 };

    const response = await request(app).post("/api/routes/disruption").send({
      scenario_id: baseline.scenario_id,
      incidents: [
        {
          id: "near-route",
          category: "weather",
          type: "Severe Weather",
          description: "Heavy rain causing delays",
          severity: "high",
          location: nearRouteLocation,
        },
      ],
    });

    expect(response.status).toBe(200);
    expect(response.body.disruption.type).toBe("weather");
    expect(response.body.reroute.distance_m).toBeGreaterThan(0);
    expect(response.body.reroute.duration_s).toBeGreaterThan(0);
  });

  test("multi-disruption creates multiple_disruptions type", async () => {
    const baseline = await createScenario();
    const nearRouteLocation = { lat: 33.2373, lon: -77.0989 };

    const response = await request(app).post("/api/routes/disruption").send({
      scenario_id: baseline.scenario_id,
      incidents: [
        {
          id: "inc-1",
          category: "weather",
          type: "Severe Weather",
          description: "Heavy rain",
          severity: "high",
          location: nearRouteLocation,
        },
        {
          id: "inc-2",
          category: "accident",
          type: "ACCIDENT",
          description: "Multi-vehicle collision",
          severity: "high",
          location: { lat: 33.24, lon: -77.10 },
        },
      ],
    });

    expect(response.status).toBe(200);
    expect(response.body.disruption.type).toBe("multiple_disruptions");
    expect(response.body.disruption.severity).toBe("high");
  });
});

