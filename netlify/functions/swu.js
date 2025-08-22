// netlify/functions/swu.js
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

exports.handler = async (event) => {
  try {
    const { queryStringParameters = {} } = event;
    const path = queryStringParameters.path || '';
    const url  = queryStringParameters.url || '';
    const format = (queryStringParameters.format || '').toLowerCase();

    const CORS = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
    };
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: CORS, body: '' };
    }

    // Direct proxy to arbitrary URL (safest way to bypass CORS for cdn.swu-db.com)
    if (url) {
      const resp = await fetch(url);
      const buf = await resp.buffer();
      const ct = resp.headers.get('content-type') || 'application/octet-stream';
      return { statusCode: resp.status, headers: { ...CORS, 'Content-Type': ct }, body: buf.toString('base64'), isBase64Encoded: true };
    }

    // API base
    const API_BASE = 'https://api.swu-db.com';
    const CDN_BASE = 'https://cdn.swu-db.com/images/cards';

    // If asked for an image with /cards/<set>/<num>, build CDN URL directly
    if (format === 'image' && path.startsWith('/cards/')) {
      const parts = path.replace(/^\/cards\//, '').split('/');
      const set = (parts[0] || '').toUpperCase();
      const num = String(parts[1] || '').padStart(3, '0');
      const cdn = `${CDN_BASE}/${set}/${num}.png`;
      const resp = await fetch(cdn);
      const buf = await resp.buffer();
      return { statusCode: resp.status, headers: { ...CORS, 'Content-Type': 'image/png' }, body: buf.toString('base64'), isBase64Encoded: true };
    }

    // Otherwise proxy to API JSON
    const target = `${API_BASE}${path || '/catalog/card-names'}`;
    const resp = await fetch(target);
    const text = await resp.text();
    const ct = resp.headers.get('content-type') || 'application/json; charset=utf-8';
    return { statusCode: resp.status, headers: { ...CORS, 'Content-Type': ct }, body: text };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
};
