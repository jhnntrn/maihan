import { put } from "@vercel/blob";

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

function safeFilename(filename = "event-photo.jpg") {
  return filename
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function dataUrlToBuffer(dataUrl) {
  const match = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Expected a base64 data URL.");
  }

  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

function blobTokenIsMissing() {
  return !process.env.BLOB_READ_WRITE_TOKEN;
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  if (!isAuthed(request)) {
    return response.status(401).json({ error: "Unauthorized" });
  }

  if (blobTokenIsMissing()) {
    return response
      .status(500)
      .json({ error: "BLOB_READ_WRITE_TOKEN is missing." });
  }

  try {
    const body = await readJsonBody(request);
    const { dataUrl, filename } = body || {};

    if (!dataUrl) {
      return response.status(400).json({ error: "Missing image data." });
    }

    const { buffer, contentType } = dataUrlToBuffer(dataUrl);
    const blob = await put(`events/${safeFilename(filename)}`, buffer, {
      access: "public",
      addRandomSuffix: true,
      contentType,
    });

    return response.status(200).json({ url: blob.url, pathname: blob.pathname });
  } catch (error) {
    return response.status(500).json({
      error: error instanceof Error ? error.message : "Blob upload failed.",
    });
  }
}
