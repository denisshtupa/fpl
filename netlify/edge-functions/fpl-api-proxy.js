/** Proxy FPL API requests with browser-like headers and retries (avoids intermittent 403s). */
const FPL_ORIGIN = 'https://fantasy.premierleague.com';
const MAX_ATTEMPTS = 4;
const RETRY_STATUSES = new Set([403, 408, 425, 429, 500, 502, 503, 504]);

const UPSTREAM_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-GB,en;q=0.9',
  Origin: FPL_ORIGIN,
  Referer: `${FPL_ORIGIN}/`,
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Accept, Content-Type',
      },
    });
  }

  const url = new URL(request.url);
  const target = `${FPL_ORIGIN}${url.pathname}${url.search}`;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const upstream = await fetch(target, {
        method: 'GET',
        headers: UPSTREAM_HEADERS,
        redirect: 'follow',
      });

      if (RETRY_STATUSES.has(upstream.status) && attempt < MAX_ATTEMPTS) {
        await upstream.body?.cancel?.();
        await sleep(250 * attempt * attempt);
        continue;
      }

      const body = await upstream.arrayBuffer();
      const ok = upstream.status >= 200 && upstream.status < 300;

      return new Response(body, {
        status: upstream.status,
        headers: {
          'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
          // Never cache failures — a 403 with max-age would stick on Netlify CDN.
          'Cache-Control': ok ? 'public, max-age=15, stale-while-revalidate=30' : 'no-store',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch {
      if (attempt < MAX_ATTEMPTS) {
        await sleep(250 * attempt * attempt);
        continue;
      }
    }
  }

  return new Response(JSON.stringify({ error: 'FPL API proxy failed' }), {
    status: 502,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
};

export const config = {
  path: '/api/*',
};
