import { createFileRoute } from "@tanstack/react-router";
import { InventoryPage } from "@/components/pos/inventory-page";

export const Route = createFileRoute("/inventory")({
  component: InventoryPage,
});
