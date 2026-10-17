import { createFileRoute } from "@tanstack/react-router";
import { KioskPage } from "@/components/pos/kiosk-page";

export const Route = createFileRoute("/kiosk")({
  component: KioskPage,
});
