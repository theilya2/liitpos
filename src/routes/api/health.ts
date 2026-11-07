import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const sql = await getSql();
          await sql`select 1 as ok`;
          return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          console.error("[health]", error instanceof Error ? error.name : "unavailable");
          return Response.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
        }
      },
    },
  },
});
