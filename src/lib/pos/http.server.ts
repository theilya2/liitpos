const NATIVE_ORIGINS = new Set([
  "https://localhost",
  "http://localhost",
  "https://127.0.0.1",
  "http://127.0.0.1",
  "capacitor://localhost",
]);

/** Capacitor's WebView origin is https://localhost. Some builds add a port. */
export function isNativeOrigin(origin: string): boolean {
  if (NATIVE_ORIGINS.has(origin)) return true;
  try {
    const url = new URL(origin);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    const scheme = url.protocol === "https:" || url.protocol === "http:" || url.protocol === "capacitor:";
    return local && scheme;
  } catch {
    return false;
  }
}

function allowHeaders(request: Request): string {
  const requested = (request.headers.get("access-control-request-headers") ?? "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(["authorization", "content-type", "accept", ...requested])].join(", ");
}

export function corsHeaders(request: Request): Headers {
  const headers = new Headers();
  const origin = request.headers.get("origin") ?? "";
  if (!isNativeOrigin(origin)) return headers;
  headers.set("access-control-allow-origin", origin);
  headers.set("vary", "Origin");
  headers.set("access-control-allow-headers", allowHeaders(request));
  headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  headers.set("access-control-max-age", "86400");
  return headers;
}

export function withCors(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  corsHeaders(request).forEach((value, key) => headers.set(key, value));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function bearerFrom(request: Request): string | undefined {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)/i.exec(header);
  return match?.[1];
}
