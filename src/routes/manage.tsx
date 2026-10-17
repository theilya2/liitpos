import { createFileRoute } from "@tanstack/react-router";
import { ManagePage } from "@/components/pos/manage-page";

export const Route = createFileRoute("/manage")({
  component: ManagePage,
});
