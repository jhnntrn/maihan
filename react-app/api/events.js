import { get, put } from "@vercel/blob";

const EVENTS_PATH = "data/events.json";
const BLOB_ACCESS = "private";

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

function blobTokenIsMissing() {
  return !process.env.BLOB_READ_WRITE_TOKEN;
}

async function streamToText(stream) {
  const response = new Response(stream);
  return response.text();
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  try {
    if (request.method === "GET") {
      if (blobTokenIsMissing()) {
        return response
          .status(500)
          .json({ error: "BLOB_READ_WRITE_TOKEN is missing." });
      }

      const result = await get(EVENTS_PATH, { access: BLOB_ACCESS });

      if (!result || result.statusCode !== 200 || !result.stream) {
        return response.status(200).json([]);
      }

      const events = JSON.parse(await streamToText(result.stream));
      return response.status(200).json(Array.isArray(events) ? events : []);
    }

    if (request.method === "PUT") {
      if (!isAuthed(request)) {
        return response.status(401).json({ error: "Unauthorized" });
      }

      if (blobTokenIsMissing()) {
        return response
          .status(500)
          .json({ error: "BLOB_READ_WRITE_TOKEN is missing." });
      }

      const events = await readJsonBody(request);
      if (!Array.isArray(events)) {
        return response
          .status(400)
          .json({ error: "Expected an events array." });
      }

      const blob = await put(EVENTS_PATH, JSON.stringify(events, null, 2), {
        access: BLOB_ACCESS,
        allowOverwrite: true,
        cacheControlMaxAge: 60,
        contentType: "application/json",
      });

      return response.status(200).json({ ok: true, url: blob.url });
    }

    response.setHeader("Allow", "GET, PUT");
    return response.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return response.status(500).json({
      error: error instanceof Error ? error.message : "Blob operation failed.",
    });
  }
}
