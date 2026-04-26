import { Router } from "express";
import { z } from "zod";
import { ApiError } from "../middleware/error.js";
import { getScenarioById } from "../services/db/firestore.js";
import { generateChatReply } from "../services/ai/gemini.js";

const router = Router();

const chatSchema = z.object({
  scenario_id: z.string().min(1),
  message: z.string().min(1).max(800),
});

router.post("/", async (req, res, next) => {
  try {
    const body = chatSchema.parse(req.body);
    const scenario = await getScenarioById(body.scenario_id);

    if (!scenario) {
      throw new ApiError(404, "Scenario not found", "SCENARIO_NOT_FOUND");
    }

    const baselineRoute = scenario.events.find((event) => event.kind === "initial_route")?.route || null;
    const rerouteRoute = scenario.events.find((event) => event.kind === "reroute")?.route || null;

    const reply = await generateChatReply(
      {
        label: scenario.label,
        activeDisruption: scenario.active_disruption,
        baselineRoute,
        rerouteRoute,
        reasoning: scenario.reasoning,
      },
      body.message
    );

    res.json({ reply });
  } catch (error) {
    next(error);
  }
});

export default router;
