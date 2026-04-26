import { Router } from "express";
import { ApiError } from "../middleware/error.js";
import { getScenarioById, listScenarios } from "../services/db/firestore.js";

const router = Router();

const eventOrder = {
  initial_route: 0,
  disruption: 1,
  reroute: 2,
};

router.get("/", async (_req, res, next) => {
  try {
    const scenarios = await listScenarios();
    const summaries = scenarios.map((scenario) => ({
      scenario_id: scenario.scenario_id,
      label: scenario.label,
      source: scenario.source,
      destination: scenario.destination,
      created_at: scenario.created_at,
      updated_at: scenario.updated_at,
      active_disruption: scenario.active_disruption,
    }));

    res.json({ scenarios: summaries });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const scenario = await getScenarioById(req.params.id);
    if (!scenario) {
      throw new ApiError(404, "Scenario not found", "SCENARIO_NOT_FOUND");
    }

    res.json(scenario);
  } catch (error) {
    next(error);
  }
});

router.get("/:id/playback", async (req, res, next) => {
  try {
    const scenario = await getScenarioById(req.params.id);
    if (!scenario) {
      throw new ApiError(404, "Scenario not found", "SCENARIO_NOT_FOUND");
    }

    const events = [...(scenario.events || [])].sort((a, b) => {
      const orderDiff = (eventOrder[a.kind] ?? 99) - (eventOrder[b.kind] ?? 99);
      if (orderDiff !== 0) {
        return orderDiff;
      }
      return String(a.ts).localeCompare(String(b.ts));
    });

    res.json({
      source: scenario.source,
      destination: scenario.destination,
      events,
      reasoning: scenario.reasoning,
      active_disruption: scenario.active_disruption,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
