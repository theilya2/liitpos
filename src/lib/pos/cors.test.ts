import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { corsHeaders } from "./http.server.ts";

function preflight(origin: string, requestHeaders = "authorization, content-type") {
  return corsHeaders(
    new Request("https://liitpos.vercel.app/api/pos/sync", {
      method: "OPTIONS",
      headers: {
        origin,
        "access-control-request-method": "POST",
        "access-control-request-headers": requestHeaders,
      },
    }),
  );
}

describe("pos CORS for the Capacitor WebView", () => {
  it("allows https://localhost and the Authorization preflight", () => {
    const headers = preflight("https://localhost");
    assert.equal(headers.get("access-control-allow-origin"), "https://localhost");
    assert.match(headers.get("access-control-allow-headers") ?? "", /authorization/);
    assert.match(headers.get("access-control-allow-headers") ?? "", /content-type/);
    assert.match(headers.get("access-control-allow-methods") ?? "", /POST/);
    assert.match(headers.get("access-control-allow-methods") ?? "", /OPTIONS/);
  });

  it("allows the same preflight on the update route origin", () => {
    const headers = corsHeaders(
      new Request("https://liitpos.vercel.app/api/pos/update", {
        method: "OPTIONS",
        headers: {
          origin: "https://localhost",
          "access-control-request-method": "GET",
          "access-control-request-headers": "authorization",
        },
      }),
    );
    assert.equal(headers.get("access-control-allow-origin"), "https://localhost");
    assert.match(headers.get("access-control-allow-headers") ?? "", /authorization/);
  });

  it("keeps an extra requested header on an allowed local origin", () => {
    const headers = preflight("https://localhost:8080", "authorization, content-type, x-requested-with");
    assert.equal(headers.get("access-control-allow-origin"), "https://localhost:8080");
    assert.match(headers.get("access-control-allow-headers") ?? "", /x-requested-with/);
  });

  it("does not open CORS to other sites", () => {
    const headers = preflight("https://evil.example");
    assert.equal(headers.get("access-control-allow-origin"), null);
  });
});
