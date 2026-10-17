import { createFileRoute } from "@tanstack/react-router";
import { ReceiptsPage } from "@/components/pos/receipts-page";

export const Route = createFileRoute("/receipts")({
  component: ReceiptsPage,
});
