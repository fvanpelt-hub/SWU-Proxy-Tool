// SWU proxy (API + CDN + ?url= passthrough)
const API_ORIGIN = 'https://api.swu-db.com';
const CDN_ORIGIN = 'https://cdn.swu-db.com';

export async function handler(event) {
  try {
    const qs = event.queryStringParameters || {};
    let targetUrl;

    if (qs.url) {
      const u = new URL(qs.url);
      const allow = new Set(['api.swu-db.com', 'cdn.swu-db.com', 'www.swu-db.com', 'swu-db.com']);
      if (!allow.has(u.hostname)) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Host not allowed' }) };
      }
      targetUrl = u.toString();
    } else {
      const path = qs.path || '/cards/search';
      const base = path.startsWith('/images/') ? CDN_ORIGIN : API_ORIGIN;
      const u = new URL(base + path);
      for (const [k, v] of Object.entries(qs)) {
        if (k !== 'path' && k !== 'url' && v != null) u.searchParams.set(k, v);
      }
      targetUrl = u.toString();
    }

    const upstream = await fetch(targetUrl, { redirect: 'follow' });
    const contentType = upstream.headers.get('content-type') || '';
    const arrayBuf = await upstream.arrayBuffer();

    const isImage = contentType.startsWith('image/') ||
      /\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i.test(new URL(targetUrl).pathname);

    return {
      statusCode: upstream.status,
      headers: {
        'Content-Type': contentType || (isImage ? 'image/png' : 'application/json'),
        'Cache-Control': 'public, max-age=3600',
      },
      body: isImage ? Buffer.from(arrayBuf).toString('base64') : Buffer.from(arrayBuf).toString('utf8'),
      isBase64Encoded: isImage,
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
}
