/** Next may construct request.url with its bind hostname rather than the browser's Host. */
export function requestOrigin(request: Request): URL {
  const internal = new URL(request.url);
  const host = request.headers.get("host");
  if (!host) return new URL(internal.origin);
  const external = new URL(`${internal.protocol}//${host}`);
  if (external.username || external.password || external.pathname !== "/" || external.search || external.hash) {
    throw new Error("Invalid Host header");
  }
  // Do not trust arbitrary X-Forwarded-Host headers as allowed origins.
  return external;
}

export function hasSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // CLI callers still require the route's bearer authentication.
  try { return origin === requestOrigin(request).origin; }
  catch { return false; }
}
