function trimToWordLimit(text, wordLimit) {
  const words = text.trim().split(/\s+/);
  if (words.length <= wordLimit) {
    return text.trim();
  }
  return `${words.slice(0, wordLimit).join(" ")}...`;
}

function formatRouteSummary(route) {
  if (!route) {
    return "N/A";
  }

  const distanceKm = (route.distance_m / 1000).toFixed(1);
  const durationMin = Math.round(route.duration_s / 60);
  return `${distanceKm} km in about ${durationMin} min`;
}

export function fallbackReasoning(context) {
  const baseline = formatRouteSummary(context.baselineRoute);
  const reroute = context.rerouteRoute ? formatRouteSummary(context.rerouteRoute) : null;

  if (!context.disruptionType || !reroute) {
    return `Baseline lane ${context.label} is currently estimated at ${baseline}. No active disruption is present, so this remains the preferred path for now.`;
  }

  return `A ${context.disruptionType.replace(/_/g, " ")} was injected on lane ${context.label}. The baseline route (${baseline}) was re-evaluated and rerouted to ${reroute} to avoid the disruption zone. The reroute prioritizes continuity of movement over shortest-time travel.`;
}

export function fallbackChat(context, message) {
  const disruption = context.activeDisruption?.type
    ? context.activeDisruption.type.replace(/_/g, " ")
    : "no active disruption";
  const baseline = formatRouteSummary(context.baselineRoute);
  const reroute = formatRouteSummary(context.rerouteRoute);

  return trimToWordLimit(
    `Scenario ${context.label} currently has ${disruption}. Baseline is ${baseline}. Latest reroute is ${reroute}. In response to "${message}", focus on execution risk, delay exposure, and whether to continue with reroute or defer dispatch based on tolerance for added transit time.`,
    120
  );
}

async function callGemini(prompt, { temperature = 0.4, maxOutputTokens = 220 } = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  if (!apiKey || process.env.USE_MOCK_SERVICES === "true") {
    throw new Error("Gemini disabled in current environment");
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature,
        maxOutputTokens,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text || typeof text !== "string") {
    throw new Error("Gemini returned an empty response");
  }

  return text.trim();
}

export async function generateReasoning(context) {
  const prompt = [
    "You are a supply-chain route reasoning assistant.",
    "Write a concise plain-English explanation in <=120 words.",
    `Lane label: ${context.label}`,
    `Source: ${JSON.stringify(context.source)}`,
    `Destination: ${JSON.stringify(context.destination)}`,
    `Disruption type: ${context.disruptionType || "none"}`,
    `Baseline route: ${formatRouteSummary(context.baselineRoute)}`,
    `Reroute route: ${formatRouteSummary(context.rerouteRoute)}`,
  ].join("\n");

  try {
    const text = await callGemini(prompt, { temperature: 0.4, maxOutputTokens: 220 });
    return trimToWordLimit(text, 120);
  } catch (_error) {
    return fallbackReasoning(context);
  }
}

export async function generateChatReply(context, message) {
  const prompt = [
    "You are a supply-chain ops assistant.",
    "Given this scenario context, answer the user's question in <=120 words.",
    JSON.stringify(
      {
        label: context.label,
        active_disruption: context.activeDisruption,
        baseline_route: context.baselineRoute,
        reroute_route: context.rerouteRoute,
        reasoning: context.reasoning,
      },
      null,
      2
    ),
    `User question: ${message}`,
  ].join("\n\n");

  try {
    const text = await callGemini(prompt, { temperature: 0.4, maxOutputTokens: 220 });
    return trimToWordLimit(text, 120);
  } catch (_error) {
    return fallbackChat(context, message);
  }
}

