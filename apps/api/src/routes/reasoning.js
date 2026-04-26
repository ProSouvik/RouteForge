import { Router } from "express";
import { z } from "zod";
import { ApiError } from "../middleware/error.js";
import { getScenarioById, updateScenario } from "../services/db/firestore.js";
import { generateReasoning } from "../services/ai/gemini.js";

const router = Router();

const reasoningSchema = z.object({
  scenario_id: z.string().min(1),
});

router.post("/", async (req, res, next) => {
  try {
    const body = reasoningSchema.parse(req.body);
    const scenario = await getScenarioById(body.scenario_id);

    if (!scenario) {
      throw new ApiError(404, "Scenario not found", "SCENARIO_NOT_FOUND");
    }

    const baselineRoute = scenario.events.find((event) => event.kind === "initial_route")?.route || null;
    const rerouteRoute = scenario.events.find((event) => event.kind === "reroute")?.route || null;
    const disruptionType = scenario.active_disruption?.type || null;

    const reasoning = await generateReasoning({
      label: scenario.label,
      source: scenario.source,
      destination: scenario.destination,
      baselineRoute,
      rerouteRoute,
      disruptionType,
    });

    await updateScenario(body.scenario_id, (draft) => {
      draft.reasoning = reasoning;
      return draft;
    });

    res.json({ reasoning });
  } catch (error) {
    next(error);
  }
});

export default router;
