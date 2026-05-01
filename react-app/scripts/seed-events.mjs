import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { put } from "@vercel/blob";

const EVENTS_PATH = "data/events.json";
const eventsPath = resolve(process.cwd(), "../shared/events.json");
const eventsJson = await readFile(eventsPath, "utf8");
const events = JSON.parse(eventsJson);

if (!Array.isArray(events)) {
  throw new Error("shared/events.json must contain an array.");
}

const blob = await put(EVENTS_PATH, JSON.stringify(events, null, 2), {
  access: "public",
  allowOverwrite: true,
  cacheControlMaxAge: 60,
  contentType: "application/json",
});

console.log(`Seeded ${events.length} events to ${blob.url}`);
