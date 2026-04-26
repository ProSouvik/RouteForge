# RouteForge Documentation

> Real-time route intelligence for resilient supply chains.

Welcome to the RouteForge documentation. This directory contains everything you need to understand, set up, and extend the project.

## Quick Links

| Document | Description |
|----------|-------------|
| [setup.md](./setup.md) | Environment setup, API keys, and configuration |
| [architecture.md](./architecture.md) | High-level system architecture and data flow |
| [technical.md](./technical.md) | Deep dive into backend services, algorithms, and internals |
| [api.md](./api.md) | REST API endpoint reference |
| [roadmap.md](./roadmap.md) | Future improvements and planned features |

## Project Overview

RouteForge is a production-grade route optimization and live disruption management platform for supply chain logistics. It computes real-world routes, detects live disruptions (traffic, weather, disasters), and suggests alternate paths with AI-powered reasoning.

## Tech Stack

- **Frontend**: Preact 10, Vite 6, Leaflet 1.9, OpenStreetMap
- **Backend**: Express 4, Node.js 18+ ESM, Zod, UUID, @turf/turf
- **Routing**: OSRM (public + self-hosted), GraphHopper, OpenRouteService
- **Disruptions**: OpenWeatherMap, Google Maps Traffic, HERE Traffic, NASA FIRMS, USGS
- **Storage**: Firestore / in-memory with JSON disk backup
- **AI**: Google Gemini (with graceful template fallback)
- **Testing**: Jest, Vitest, Playwright
