import "dotenv/config";
import cors from "cors";
import express from "express";
import chatRouter from "./routes/chat.js";
import reasoningRouter from "./routes/reasoning.js";
import routesRouter from "./routes/routes.js";
import scenariosRouter from "./routes/scenarios.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { storageMode } from "./services/db/firestore.js";

function parseOrigins() {
  const raw = process.env.CORS_ORIGINS || "http://localhost:5173,http://localhost:5174,http://localhost:5175";
  const list = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return list.length > 0 ? list : ["*"];
}

async function checkRoutingHealth() {
  const osrmBase = (process.env.OSRM_BASE_URL || "https://router.project-osrm.org").replace(/\/$/, "");

  const testUrl = `${osrmBase}/route/v1/driving/13.388860,52.517037;13.397634,52.529407?overview=false`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(testUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: parseOrigins(),
      credentials: true,
    })
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", async (_req, res) => {
    const routingHealthy = await checkRoutingHealth();
    res.status(routingHealthy ? 200 : 503).json({
      ok: routingHealthy,
      storage_mode: storageMode(),
      route_provider: "osrm",
      routing_available: routingHealthy,
    });
  });

  app.use("/api/routes", routesRouter);
  app.use("/api/scenarios", scenariosRouter);
  app.use("/api/reasoning", reasoningRouter);
  app.use("/api/chat", chatRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

const isRunningInJest = process.env.JEST_WORKER_ID !== undefined;
const isRunningInVercel = process.env.VERCEL === "1" || process.env.VERCEL === "true";

const app = createApp();

export default app;

if (!isRunningInJest && !isRunningInVercel) {
  const port = Number(process.env.PORT || 8080);

  const server = app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(
        `Port ${port} is already in use. Stop the existing process or start the API on a different port with PORT=XXXX.`
      );
      process.exit(1);
    }
    throw error;
  });
}
