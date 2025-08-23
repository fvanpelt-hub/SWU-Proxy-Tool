// Netlify Function: SWU API/CDN proxy (v0.2.6d, CommonJS)
// - Compatible with CommonJS runtime on Netlify
// - Forwards ALL query params to SWU-DB API
// - Uses global fetch (Node 18). If your runtime is older, set Functions runtime to Node 18 in Netlify.

exports.handler = async (event) => {
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

    // Forward all additional query params (e.g., q=...)
    const forward = new URLSearchParams(qs);
    forward.delete("path");
    forward.delete("url");
    forward.delete("format");
    const forwardQS = forward.toString();

    // Direct URL passthrough (for CDN images, etc.)
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

    // Card image passthrough (set/number -> PNG)
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

    // Default: API proxy
    const target = `${API_BASE}${path || "/catalog/card-names"}${forwardQS ? ("?" + forwardQS) : ""}`;
    const resp = await fetch(target);
    const text = await resp.text();
    const ct = resp.headers.get("content-type") || "application/json; charset=utf-8";
    return { statusCode: resp.status, headers: { ...CORS, "Content-Type": ct }, body: text };
  } catch (err) {
    console.error("swu function error:", err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: String(err) }) };
  }
};
