/**
 * The old OAuth popup is gone. Public sign-in is disabled.
 * Kept so the dev server still answers /auth/popup with a plain refusal
 * instead of painting the register inside a popup window.
 */
export function handleAuthPopupRequest(_request: Request): Response {
  return new Response("Sign-in is disabled.", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
