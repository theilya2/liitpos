import { createFileRoute } from "@tanstack/react-router";
import { SalePage } from "@/components/pos/sale-page";

export const Route = createFileRoute("/")({
  component: SalePage,
});
