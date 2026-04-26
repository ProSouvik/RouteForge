# RouteForge

> Real-time route intelligence for resilient supply chains.

Compute real-world supply routes, detect live disruptions (traffic, weather, disasters), and adapt routing decisions with AI-powered reasoning.

## Why This Project Matters

Supply chains depend on predictable transit times. A single unplanned disruption — a hurricane, a bridge closure, a wildfire — can cascade into millions in delays. RouteForge surfaces these risks in real time and suggests alternate paths before the cargo is stuck.

## Features

- **Real Route Calculation** — OSRM, GraphHopper, OpenRouteService with automatic fallback
- **Live Disruption Detection** — OpenWeatherMap, Google Maps Traffic, HERE Traffic, NASA FIRMS, USGS
- **Smart Classification Engine** — Structured type mapping + weighted keyword matching with confidence scores (0–1)
- **Geo-Spatial Filtering** — `@turf/turf` point-to-line distance for precise route proximity detection
- **Multi-Disruption Analysis** — Select multiple incidents, compute alternate routes
- **Risk Scoring** — `risk = severity * (1 / (distance + 1))` for prioritization
- **Fact-Based Metrics** — Distance, time, cost, and risk from real data
- **Scenario Persistence** — Firestore or in-memory storage with audit trail
- **AI-Powered Reasoning** — Gemini-powered route explanations

## Demo

(Screenshots / GIFs will be added here)

## Quick Start

```bash
# Install dependencies
yarn install

# Terminal 1 — API
yarn workspace @routeforge/api dev

# Terminal 2 — Web
yarn workspace @routeforge/web dev

# Open http://localhost:5173
```

> ⚠️ **Environment Variables**: Create `apps/api/.env` and add your API keys. See [docs/setup.md](docs/setup.md) for details.

## Architecture Preview

```
Frontend (Preact + Vite)  <--HTTP-->  API (Express)
                                          |
                    +---------------------+---------------------+
                    |                     |                     |
               Routing Services     Disruption Sources      Storage
               OSRM / GraphHopper   OpenWeatherMap          Firestore
               OpenRouteService     Google Maps             (or in-memory)
                                    HERE Traffic
                                    NASA FIRMS
                                    USGS
```

## Tech Stack

- **Frontend**: Preact, Vite, Leaflet, OpenStreetMap
- **Backend**: Express, Zod, UUID, @turf/turf
- **Routing**: OSRM, GraphHopper, OpenRouteService
- **Disruptions**: OpenWeatherMap, Google Maps, HERE Traffic, NASA FIRMS, USGS
- **Storage**: Firestore / in-memory with disk backup
- **AI**: Google Gemini (with graceful fallback)
- **Testing**: Jest, Vitest, Playwright

## Configuration

| Variable | Purpose | Required |
|----------|---------|----------|
| `OPENWEATHER_API_KEY` | Weather data along routes | Required for disruption data |
| `GOOGLE_MAPS_API_KEY` | Traffic incidents | Required for disruption data |
| `HERE_API_KEY` | Traffic incidents (alternative provider) | Optional (alternative to Google Maps) |
| `NASA_FIRMS_API_KEY` | Wildfire detection | Optional (specific disaster source) |
| `USGS_API_ENABLED` | Earthquake data (`true`/`false`) | Optional (specific disaster source) |
| `GEMINI_API_KEY` | AI reasoning generation | Required for reasoning |
| `GCP_PROJECT_ID` | Firestore persistence | Optional (required only for cloud storage) |
| `OSRM_BASE_URL` | Self-hosted OSRM instance | Optional (advanced/self-hosted routing) |
| `GRAPHHOPPER_URL` / `GRAPHHOPPER_API_KEY` | GraphHopper routing | Required for routing (if using GraphHopper) |
| `ORS_API_KEY` | OpenRouteService API key | Required for routing (if using ORS) |
| `USE_IN_MEMORY_DB` | Force in-memory storage | Optional (development/testing only) |

>> At least one routing service and one disruption data source must be configured for full functionality. Routing APIs are required for reliable route computation.If routing services are unavailable, route generation may fail.

## API

### Compute Route
```bash
POST /api/routes/compute
{
  "source": {"lat": 40.7128, "lon": -74.0060},
  "destination": {"lat": 34.0522, "lon": -118.2437},
  "label": "NYC to LA"}
```

### Compute Alternate Route
```bash
POST /api/routes/disruption
{
  "scenario_id": "uuid",
  "incidents": [
    {"id": "i1", "category": "construction", "severity": "high",
     "location": {"lat": 38.5, "lon": -120.0}, "description": "..."}
  ]
}
```

### Chat
```bash
POST /api/chat
{"scenario_id": "uuid", "message": "Should we dispatch?"}
```

## Scripts

| Command | Description |
|---------|-------------|
| `yarn dev` | Run API + Web concurrently |
| `yarn test` | Run all tests |
| `yarn test:api` | API tests (Jest) |
| `yarn test:web` | Web tests (Vitest) |
| `yarn test:e2e` | E2E tests (Playwright) |
| `yarn build` | Build for production |

## Documentation

- [Setup Guide](docs/setup.md) — Environment setup, API keys, and configuration
- [Architecture](docs/architecture.md) — High-level system architecture and data flow
- [Technical Deep Dive](docs/technical.md) — Backend services, algorithms, and internals
- [API Reference](docs/api.md) — REST API endpoint reference
- [Roadmap](docs/roadmap.md) — Future improvements and planned features

## License

MIT License

