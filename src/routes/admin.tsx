import { createFileRoute } from "@tanstack/react-router";
import { AdminPage } from "@/components/pos/admin-page";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});
