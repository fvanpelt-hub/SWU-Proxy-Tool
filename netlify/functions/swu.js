// Netlify Function: swu proxy
// Usage: /.netlify/functions/swu?path=/cards/search&q=name%3A%22luke%22
// Also supports binary image passthrough: path like /cards/{set}/{num}?format=image
export default async (request, context) => {
  const url = new URL(request.url);
  const path = url.searchParams.get('path') || '/';
  // Rebuild target SWU-DB URL
  const target = new URL(`https://api.swu-db.com${path}`);
  // Forward all other query params except 'path'
  for (const [k,v] of url.searchParams.entries()) {
    if(k !== 'path') target.searchParams.set(k, v);
  }

  // Fetch upstream
  const upstream = await fetch(target, {
    method: 'GET',
    headers: {
      'accept': '*/*',
      // Add a UA to be polite
      'user-agent': 'swu-proxy-netlify/0.2 (+https://netlify.com)'
    }
  });

  // Clone headers & add CORS
  const resHeaders = new Headers(upstream.headers);
  resHeaders.set('access-control-allow-origin', '*');
  resHeaders.set('access-control-allow-headers', '*');
  resHeaders.set('access-control-allow-methods', 'GET, OPTIONS');
  resHeaders.set('cache-control', 'public, max-age=600');

  // Binary or JSON/text?
  const ct = resHeaders.get('content-type') || '';
  if (ct.includes('image/') || ct.includes('application/octet-stream')) {
    const arrayBuffer = await upstream.arrayBuffer();
    return new Response(arrayBuffer, { status: upstream.status, headers: resHeaders });
  } else {
    const text = await upstream.text();
    return new Response(text, { status: upstream.status, headers: resHeaders });
  }
};
