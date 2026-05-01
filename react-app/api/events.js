import { get, put } from "@vercel/blob";

const EVENTS_PATH = "data/events.json";

function isAuthed(request) {
  const expectedSecret = process.env.ADMIN_API_SECRET;
  if (!expectedSecret) return false;
  return request.headers["x-admin-secret"] === expectedSecret;
}

async function readJsonBody(request) {
  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : null;
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  if (request.method === "GET") {
    const blob = await get(EVENTS_PATH, { access: "public" });

    if (!blob) {
      return response.status(200).json([]);
    }

    const eventsResponse = await fetch(blob.url, { cache: "no-store" });
    if (!eventsResponse.ok) {
      return response.status(502).json({ error: "Could not load events." });
    }

    const events = await eventsResponse.json();
    return response.status(200).json(Array.isArray(events) ? events : []);
  }

  if (request.method === "PUT") {
    if (!isAuthed(request)) {
      return response.status(401).json({ error: "Unauthorized" });
    }

    const events = await readJsonBody(request);
    if (!Array.isArray(events)) {
      return response.status(400).json({ error: "Expected an events array." });
    }

    const blob = await put(EVENTS_PATH, JSON.stringify(events, null, 2), {
      access: "public",
      allowOverwrite: true,
      cacheControlMaxAge: 60,
      contentType: "application/json",
    });

    return response.status(200).json({ ok: true, url: blob.url });
  }

  response.setHeader("Allow", "GET, PUT");
  return response.status(405).json({ error: "Method not allowed" });
}
