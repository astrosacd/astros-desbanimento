import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/status-health")({
  server: {
    handlers: {
      GET: () =>
        Response.json(
          { service: "astros-mais", status: "ok", timestamp: new Date().toISOString() },
          { headers: { "Cache-Control": "no-store" } },
        ),
    },
  },
});
