import { Firestore } from "@google-cloud/firestore";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const COLLECTION = process.env.FIRESTORE_COLLECTION || "scenarios";
const DATA_FILE = process.env.SCENARIOS_DATA_FILE || join(process.cwd(), ".scenarios.json");

let firestoreClient;
let forceMemory =
  process.env.USE_IN_MEMORY_DB === "true" ||
  process.env.NODE_ENV === "test" ||
  !process.env.GCP_PROJECT_ID;

const memoryStore = new Map();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function loadFromDisk() {
  if (process.env.NODE_ENV === "test") return;
  try {
    if (existsSync(DATA_FILE)) {
      const raw = readFileSync(DATA_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach((scenario) => {
          if (scenario?.scenario_id) {
            memoryStore.set(scenario.scenario_id, scenario);
          }
        });
      }
    }
  } catch (error) {
    console.warn("Failed to load scenarios from disk:", error.message);
  }
}

function saveToDisk() {
  if (process.env.NODE_ENV === "test") return;
  try {
    const scenarios = [...memoryStore.values()].map(clone);
    writeFileSync(DATA_FILE, JSON.stringify(scenarios, null, 2));
  } catch (error) {
    console.warn("Failed to save scenarios to disk:", error.message);
  }
}

loadFromDisk();

async function getCollection() {
  if (forceMemory) {
    return null;
  }

  if (!firestoreClient) {
    try {
      firestoreClient = new Firestore({ projectId: process.env.GCP_PROJECT_ID });
      await firestoreClient.collection(COLLECTION).limit(1).get();
    } catch (_error) {
      forceMemory = true;
      return null;
    }
  }

  return firestoreClient.collection(COLLECTION);
}

async function writeScenario(scenario) {
  const collection = await getCollection();
  if (!collection) {
    memoryStore.set(scenario.scenario_id, clone(scenario));
    saveToDisk();
    return;
  }

  await collection.doc(scenario.scenario_id).set(scenario, { merge: false });
}

async function readScenario(id) {
  const collection = await getCollection();
  if (!collection) {
    return memoryStore.has(id) ? clone(memoryStore.get(id)) : null;
  }

  const snap = await collection.doc(id).get();
  if (!snap.exists) {
    return null;
  }
  return snap.data();
}

export async function createScenario(scenario) {
  const created = {
    ...scenario,
    created_at: scenario.created_at || nowIso(),
    updated_at: scenario.updated_at || nowIso(),
  };

  await writeScenario(created);
  return clone(created);
}

export async function getScenarioById(scenarioId) {
  return readScenario(scenarioId);
}

export async function listScenarios() {
  const collection = await getCollection();

  if (!collection) {
    return [...memoryStore.values()]
      .map((scenario) => clone(scenario))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }

  const snap = await collection.orderBy("created_at", "desc").get();
  return snap.docs.map((doc) => doc.data());
}

export async function updateScenario(scenarioId, updater) {
  const existing = await readScenario(scenarioId);
  if (!existing) {
    return null;
  }

  const updated = updater(clone(existing));
  updated.updated_at = nowIso();
  await writeScenario(updated);
  return clone(updated);
}

export function storageMode() {
  return forceMemory ? "memory" : "firestore";
}

export function __resetInMemoryStore() {
  memoryStore.clear();
}

