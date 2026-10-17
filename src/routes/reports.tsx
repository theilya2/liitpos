import { createFileRoute } from "@tanstack/react-router";
import { ReportsPage } from "@/components/pos/reports-page";

export const Route = createFileRoute("/reports")({
  component: ReportsPage,
});
