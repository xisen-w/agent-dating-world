import { handle } from 'hono/vercel';
import app from '../server/src/index.js';

const honoHandler = handle(app);
const forwardedRoutePattern = /^\/(?:api|auth)(?:\/|$)/;

/**
 * Vercel's Vite integration sends both BFF route families to this one Node
 * Function. The explicit query value makes the original Hono path deterministic
 * after the rewrite instead of depending on provider-specific URL behavior.
 */
export function handler(request: Request): Response | Promise<Response> {
  const url = new URL(request.url);
  const forwardedRoute = url.searchParams.get('__route');

  if (forwardedRoute) {
    const pathname = forwardedRoute.startsWith('/') ? forwardedRoute : `/${forwardedRoute}`;
    if (!forwardedRoutePattern.test(pathname)) {
      return Response.json({ error: true, message: 'Invalid BFF route.' }, { status: 400 });
    }
    url.pathname = pathname;
    url.searchParams.delete('__route');
    request = new Request(url, request);
  }

  return honoHandler(request);
}

export default handler;
