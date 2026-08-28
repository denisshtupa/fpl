/** Proxy FPL API requests with browser-like headers (avoids intermittent 403s from redirect proxy). */
export default async (request) => {
  const url = new URL(request.url);
  const target = `https://fantasy.premierleague.com${url.pathname}${url.search}`;

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers: {
        Accept: 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
        'Cache-Control': upstream.headers.get('Cache-Control') ?? 'public, max-age=30',
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'FPL API proxy failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config = {
  path: '/api/*',
};
