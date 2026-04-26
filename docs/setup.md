# Setup Guide

Complete instructions to get RouteForge running locally.

---

## Quick Setup

```bash
yarn install
cp apps/api/.env.example apps/api/.env
yarn dev
```

> API keys are required for real disruption data. Without API keys, disruption results may be empty.

>Routing APIs are required for route computation.  
>If routing services are not available, route generation may fail.
---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 18+ | LTS recommended |
| Package Manager | Yarn 1.22+ | Required for workspaces |
| Git | Any | For cloning |

Verify your environment:

```bash
node --version   # Should print v18.x.x or higher
yarn --version   # Should print 1.22.x or higher
```

---

## Installation

### 1. Clone the repository

```bash
git clone <repository-url>
cd smart-supply-chain-v2-main
```

### 2. Install dependencies

```bash
yarn install
```

This installs dependencies for the root workspace and all apps (`apps/api`, `apps/web`).

---

## Environment Setup

### 1. Create the API environment file

```bash
cp apps/api/.env.example apps/api/.env
```

> If `.env.example` does not exist, create `apps/api/.env` manually.

### 2. Add your API keys

Open `apps/api/.env` and add the keys you have:

```bash
# ==== DISRUPTION SOURCES ====
OPENWEATHER_API_KEY=your_openweather_key
GOOGLE_MAPS_API_KEY=your_google_maps_key
HERE_API_KEY=your_here_key
NASA_FIRMS_API_KEY=your_nasa_key
USGS_API_ENABLED=true

# ==== AI / REASONING (optional) ====
GEMINI_API_KEY=your_gemini_key

# ==== ROUTING (optional — improves speed/reliability) ====
# OSRM_BASE_URL=http://localhost:5000
# GRAPHHOPPER_URL=http://localhost:8989
# GRAPHHOPPER_API_KEY=
# ORS_API_KEY=

# ==== DATABASE (optional — defaults to in-memory) ====
# GCP_PROJECT_ID=your-gcp-project-id
# FIRESTORE_COLLECTION=scenarios
# USE_IN_MEMORY_DB=false

# ==== SERVER ====
PORT=8080
NODE_ENV=development
```

### 3. Key overview

| Key | Service | What it enables |
|-----|---------|-----------------|
| `OPENWEATHER_API_KEY` | [OpenWeatherMap](https://openweathermap.org/api) | Real weather alerts along routes |
| `GOOGLE_MAPS_API_KEY` | [Google Cloud](https://developers.google.com/maps/documentation) | Real traffic incidents |
| `HERE_API_KEY` | [HERE Developer](https://developer.here.com/) | Traffic incidents (fallback) |
| `NASA_FIRMS_API_KEY` | [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/) | Wildfire detection |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/app/apikey) | AI-powered route reasoning |
| `GCP_PROJECT_ID` | [Google Cloud](https://console.cloud.google.com/) | Firestore cloud persistence |

> **API keys are required for real disruption data.** Without API keys, disruption results may be empty.

---

## Running the Project

### Option A: Run both concurrently (recommended)

```bash
yarn dev
```

This starts the API on `http://localhost:8080` and the web UI on `http://localhost:5173`.

### Option B: Run separately

Terminal 1 — Backend:
```bash
yarn workspace @routeforge/api dev
```

Terminal 2 — Frontend:
```bash
yarn workspace @routeforge/web dev
```

### Open the app

Navigate to [http://localhost:5173](http://localhost:5173).

---

## Running Tests

### API tests
```bash
yarn test:api
```

### Web tests
```bash
yarn test:web
```

### All tests
```bash
yarn test
```

### E2E tests
```bash
yarn test:e2e
```

---

## Common Issues

### "No disruption sources configured"

**Cause**: No disruption API keys are set.  
**Fix**: Add at least one key to `apps/api/.env` (e.g., `OPENWEATHER_API_KEY`). Without API keys, disruption results may be empty.

### "No routing service is available"

**Cause**: Routing APIs are unavailable or not configured  
**Fix**:  
- Check your internet connection  
- Configure at least one routing service (ORS, GraphHopper, or OSRM)  

### "Gemini disabled"

**Cause**: No `GEMINI_API_KEY` set.  
**Fix**: Add `GEMINI_API_KEY` to `apps/api/.env` for AI-powered reasoning.

### Port already in use

**Cause**: Another process is using port `8080` (API) or `5173` (web).  
**Fix**:
```bash
# Use a different port for the API
PORT=9000 yarn workspace @routeforge/api dev
```

### CORS errors in browser

**Cause**: The API rejects requests from your frontend URL.  
**Fix**: Add your frontend URL to `CORS_ORIGINS` in `apps/api/.env`:
```bash
CORS_ORIGINS=http://localhost:5173,http://localhost:5174
```

### Scenarios lost on restart

**Cause**: No database configured — scenarios are stored in memory.  
**Fix**: Set `GCP_PROJECT_ID` for Firestore, or scenarios auto-save to `.scenarios.json` in `apps/api/`.

### Build errors

**Cause**: Missing dependencies or Node version mismatch.  
**Fix**:
```bash
# Clean and reinstall
rm -rf node_modules apps/*/node_modules
yarn install
```

---

## Next Steps

- Read the [Architecture Guide](architecture.md) to understand the system design.
- Read the [Technical Deep Dive](technical.md) for backend internals.
- Read the [API Reference](api.md) for endpoint details.

