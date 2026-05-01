import { Readable } from "node:stream";
import { get } from "@vercel/blob";

const BLOB_ACCESS = "private";

function blobTokenIsMissing() {
  return !process.env.BLOB_READ_WRITE_TOKEN;
}

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed" });
  }

  if (blobTokenIsMissing()) {
    return response
      .status(500)
      .json({ error: "BLOB_READ_WRITE_TOKEN is missing." });
  }

  const url = new URL(request.url, `https://${request.headers.host}`);
  const pathname = url.searchParams.get("pathname");

  if (!pathname || !pathname.startsWith("events/")) {
    return response.status(400).json({ error: "Invalid blob pathname." });
  }

  try {
    const result = await get(pathname, { access: BLOB_ACCESS });

    if (!result || result.statusCode !== 200 || !result.stream) {
      return response.status(404).json({ error: "Blob not found." });
    }

    response.setHeader(
      "Content-Type",
      result.blob.contentType || "application/octet-stream"
    );
    response.setHeader("Cache-Control", "public, max-age=300");

    return Readable.fromWeb(result.stream).pipe(response);
  } catch (error) {
    return response.status(500).json({
      error: error instanceof Error ? error.message : "Blob read failed.",
    });
  }
}
