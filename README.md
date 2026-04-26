# RouteForge

> Real-time route intelligence for resilient supply chains.

Production-grade route optimization and live disruption management for supply chain logistics.

## Features

- **Real Route Calculation** — OSRM, GraphHopper, OpenRouteService with automatic fallback
- **Live Disruption Detection** — NewsAPI, TomTom Traffic, Open511
- **Smart Classification Engine** — Structured type mapping + weighted keyword matching with confidence scores (0–1)
- **Geo-Spatial Filtering** — `@turf/turf` point-to-line distance for precise route proximity detection
- **Multi-Disruption Analysis** — Select multiple incidents, compute alternate routes
- **Risk Scoring** — `risk = severity * (1 / (distance + 1))` for prioritization
- **Fact-Based Metrics** — Distance, time, cost, and risk from real data
- **Scenario Persistence** — Firestore or in-memory storage with audit trail
- **AI-Powered Reasoning** — Gemini-powered route explanations with fallback

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│  React/Vite │────▶│  Express API│────▶│ Routing Services│
│   (Preact)  │     │   (Node.js) │     │ OSRM/GH/ORS     │
└─────────────┘     └──────┬──────┘     └─────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌─────────┐ ┌──────────┐ ┌──────────┐
        │ NewsAPI │ │  TomTom  │ │ Open511  │
        └─────────┘ └──────────┘ └──────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  Firestore   │
                    │  (or memory) │
                    └──────────────┘
```

## Quick Start

```bash
# Install dependencies
npm install -g yarn
yarn install

# Terminal 1 — API
yarn workspace @bal/api dev

# Terminal 2 — Web
yarn workspace @bal/web dev

# Open http://localhost:5173
```

### With Live Disruptions

```bash
export NEWSAPI_KEY=your_key_here
yarn workspace @bal/api dev
```

## Configuration

| Variable | Purpose |
|----------|---------|
| `OSRM_BASE_URL` | Self-hosted OSRM instance |
| `GRAPHHOPPER_URL` / `GRAPHHOPPER_API_KEY` | GraphHopper routing |
| `ORS_API_KEY` | OpenRouteService API key |
| `NEWSAPI_KEY` | News-based disruptions |
| `TOMTOM_API_KEY` | Real-time traffic incidents |
| `OPEN511_BASE_URL` | Standardized traffic data |
| `GEMINI_API_KEY` | AI reasoning generation |
| `GCP_PROJECT_ID` | Firestore persistence |
| `USE_IN_MEMORY_DB=true` | Force in-memory storage |

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

## Tech Stack

- **Frontend**: Preact, Vite, Leaflet, OpenStreetMap
- **Backend**: Express, Zod, UUID, @turf/turf
- **Routing**: OSRM, GraphHopper, OpenRouteService
- **Disruptions**: NewsAPI, TomTom, Open511 with weighted classification + geo-filtering
- **Storage**: Firestore / in-memory with disk backup
- **AI**: Google Gemini (with graceful fallback)
- **Testing**: Jest, Vitest, Playwright

## Disruption Engine API

The upgraded disruption engine (`trafficIncidents.js`) exposes these utilities:

```javascript
import {
  normalizeIncident,      // Normalize + classify any raw incident
  isNearRoute,            // Turf point-to-line distance check
  distanceFromRoute,      // Exact km distance from route
  getRouteDisruptions,    // Main pipeline: normalize -> classify -> filter -> sort -> risk
} from "./services/trafficIncidents.js";
```

### `normalizeIncident(rawIncident)`
Returns `{ id, lat, lon, category, confidence, severity (1-10), source, description, type, reported_at, raw }`

### `getRouteDisruptions(routeCoords, incidents, options)`
- `routeCoords`: `[[lon, lat], ...]` GeoJSON coordinates
- `incidents`: Raw incident array from any provider
- `options.thresholdKm`: Proximity filter (default 50)
- `options.includeRisk`: Compute risk score (default true)
- Returns sorted array by severity desc, then distance asc

## License

MIT License

Copyright (c) 2026 Sayan Sanki

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
