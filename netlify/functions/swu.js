// Netlify Function: SWU API/CDN proxy (v0.2.6c-hotfix)
// - Uses native fetch (Node 18+) — no node-fetch import
// - Forwards ALL query params (e.g., q=...) to the API
// - Adds CORS headers and handles binary image passthrough

export async function handler(event) {
  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With"
  };

  try {
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 204, headers: CORS, body: "" };
    }

    const qs = event.queryStringParameters || {};
    const path   = qs.path || "";
    const url    = qs.url || "";
    const format = (qs.format || "").toLowerCase();

    // Forward all query params to the upstream, except our control params
    const forward = new URLSearchParams(qs);
    forward.delete("path");
    forward.delete("url");
    forward.delete("format");
    const forwardQS = forward.toString();

    // Direct URL passthrough (used for CDN images when needed)
    if (url) {
      const resp = await fetch(url);
      const buf = Buffer.from(await resp.arrayBuffer());
      const ct = resp.headers.get("content-type") || "application/octet-stream";
      return {
        statusCode: resp.status,
        headers: { ...CORS, "Content-Type": ct },
        body: buf.toString("base64"),
        isBase64Encoded: true
      };
    }

    const API_BASE = "https://api.swu-db.com";
    const CDN_BASE = "https://cdn.swu-db.com/images/cards";

    // Card image passthrough (set + number)
    if (format === "image" && path.startsWith("/cards/")) {
      const parts = path.replace(/^\/cards\//, "").split("/");
      const set = (parts[0] || "").toUpperCase();
      const num = String(parts[1] || "").padStart(3, "0");
      const cdn = `${CDN_BASE}/${set}/${num}.png`;
      const resp = await fetch(cdn);
      const buf = Buffer.from(await resp.arrayBuffer());
      return {
        statusCode: resp.status,
        headers: { ...CORS, "Content-Type": "image/png" },
        body: buf.toString("base64"),
        isBase64Encoded: true
      };
    }

    // Default: proxy to SWU-DB API with forwarded query string
    const target = `${API_BASE}${path || "/catalog/card-names"}${forwardQS ? ("?" + forwardQS) : ""}`;
    const resp = await fetch(target);
    const text = await resp.text();
    const ct = resp.headers.get("content-type") || "application/json; charset=utf-8";
    return { statusCode: resp.status, headers: { ...CORS, "Content-Type": ct }, body: text };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: String(err) }) };
  }
}
