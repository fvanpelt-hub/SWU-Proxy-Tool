exports.handler = async function(event, context) {
  try {
    const url = new URL(event.rawUrl);
    const path = url.searchParams.get('path');
    const proxy = url.searchParams.get('proxy');
    const q = url.searchParams.get('q');

    const send = (body, status=200, headers={}) => ({
      statusCode: status,
      headers: Object.assign({
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      }, headers),
      body,
      isBase64Encoded: false
    });

    if (proxy) {
      const resp = await fetch(proxy);
      const arr = new Uint8Array(await resp.arrayBuffer());
      const b64 = Buffer.from(arr).toString('base64');
      return {
        statusCode: resp.status,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': resp.headers.get('content-type') || 'application/octet-stream',
          'Cache-Control': 'public, max-age=86400'
        },
        body: b64,
        isBase64Encoded: true
      };
    }

    if (!path) return send(JSON.stringify({ error: 'missing path' }), 400, { 'Content-Type': 'application/json' });

    let upstream;
    if (path.startsWith('/images/')) {
      upstream = `https://cdn.swu-db.com${path}`;
      const resp = await fetch(upstream);
      const arr = new Uint8Array(await resp.arrayBuffer());
      const b64 = Buffer.from(arr).toString('base64');
      return {
        statusCode: resp.status,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': resp.headers.get('content-type') || 'image/png',
          'Cache-Control': 'public, max-age=86400'
        },
        body: b64,
        isBase64Encoded: true
      };
    } else {
      // API
      const api = new URL(`https://api.swu-db.com${path}`);
      if (q) api.searchParams.set('q', q);
      const resp = await fetch(api.toString());
      const text = await resp.text();
      return send(text, resp.status, { 'Content-Type': resp.headers.get('content-type') || 'application/json' });
    }
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: e.message || String(e) })
    };
  }
}
