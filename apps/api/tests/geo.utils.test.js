import {
  haversineKm,
  midpoint,
  initialBearingRad,
  destinationPoint,
  perpendicularOffsetWaypoint,
  calculateRiskScore,
  calculateCostUsd,
  clamp,
} from "../src/utils/geo.js";

describe("geo utilities", () => {
  describe("haversineKm", () => {
    test("calculates distance between two points", () => {
      const nyc = { lat: 40.7128, lon: -74.006 };
      const la = { lat: 34.0522, lon: -118.2437 };
      const distance = haversineKm(nyc, la);

      expect(distance).toBeGreaterThan(3900);
      expect(distance).toBeLessThan(4000);
    });

    test("returns 0 for identical points", () => {
      const point = { lat: 40.7128, lon: -74.006 };
      expect(haversineKm(point, point)).toBe(0);
    });
  });

  describe("midpoint", () => {
    test("returns a point between two coordinates", () => {
      const a = { lat: 0, lon: 0 };
      const b = { lat: 10, lon: 10 };
      const mid = midpoint(a, b);

      expect(mid.lat).toBeGreaterThan(0);
      expect(mid.lat).toBeLessThan(10);
      expect(mid.lon).toBeGreaterThan(0);
      expect(mid.lon).toBeLessThan(10);
    });
  });

  describe("initialBearingRad", () => {
    test("returns bearing from north in radians", () => {
      const a = { lat: 40.7128, lon: -74.006 };
      const b = { lat: 34.0522, lon: -118.2437 };
      const bearing = initialBearingRad(a, b);

      expect(bearing).toBeGreaterThan(-Math.PI);
      expect(bearing).toBeLessThan(Math.PI);
    });
  });

  describe("destinationPoint", () => {
    test("returns point at given distance and bearing", () => {
      const start = { lat: 0, lon: 0 };
      const point = destinationPoint(start, 0, 100);

      expect(point.lat).toBeGreaterThan(0);
      expect(point.lon).toBe(0);
    });
  });

  describe("perpendicularOffsetWaypoint", () => {
    test("returns a point offset from the midpoint", () => {
      const source = { lat: 0, lon: 0 };
      const destination = { lat: 0, lon: 1 };
      const offset = perpendicularOffsetWaypoint(source, destination, 10);

      expect(offset.lat).not.toBe(0);
      expect(offset.lon).toBeGreaterThan(0);
      expect(offset.lon).toBeLessThan(1);
    });
  });

  describe("calculateRiskScore", () => {
    test("returns base risk without disruption", () => {
      const score = calculateRiskScore(100000, 3600, null);
      expect(score).toBeGreaterThanOrEqual(5);
      expect(score).toBeLessThanOrEqual(100);
    });

    test("adds boost for disruption type", () => {
      const base = calculateRiskScore(100000, 3600, null);
      const withDisruption = calculateRiskScore(100000, 3600, "natural_disaster");

      expect(withDisruption).toBeGreaterThan(base);
    });

    test("clamps to maximum of 100", () => {
      const score = calculateRiskScore(10000000, 86400, "natural_disaster");
      expect(score).toBe(100);
    });
  });

  describe("calculateCostUsd", () => {
    test("returns cost based on distance and duration", () => {
      const cost = calculateCostUsd(100000, 3600);

      expect(cost).toBeGreaterThan(0);
      expect(typeof cost).toBe("number");
    });
  });

  describe("clamp", () => {
    test("returns value within range", () => {
      expect(clamp(0, 10, 5)).toBe(5);
    });

    test("returns min when below range", () => {
      expect(clamp(0, 10, -5)).toBe(0);
    });

    test("returns max when above range", () => {
      expect(clamp(0, 10, 15)).toBe(10);
    });
  });
});

