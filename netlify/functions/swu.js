// Netlify Function to proxy SWU-DB JSON and images (to avoid CORS)
export async function handler(event, context) {
  const params = event.queryStringParameters || {};
  const path = params.path || null;
  const img  = params.img  || null;

  const hdr = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };

  try {
    if (img) {
      const r = await fetch(img);
      if (!r.ok) return { statusCode: r.status, headers: hdr, body: await r.text() };
      const buf = Buffer.from(await r.arrayBuffer());
      return {
        statusCode: 200,
        headers: { ...hdr, 'Content-Type': r.headers.get('content-type') || 'image/png' },
        body: buf.toString('base64'),
        isBase64Encoded: true
      };
    }

    if (!path) return { statusCode: 400, headers: hdr, body: JSON.stringify({ error: 'missing path' }) };
    const passthrough = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([k]) => k !== 'path'))
    );
    const url = `https://api.swu-db.com${path}${passthrough.toString()?`?${passthrough.toString()}`:''}`;
    const r = await fetch(url);
    const text = await r.text();
    return { statusCode: r.status, headers: { ...hdr, 'Content-Type': r.headers.get('content-type') || 'application/json' }, body: text };
  } catch (e) {
    return { statusCode: 500, headers: hdr, body: JSON.stringify({ error: e.message }) };
  }
}
