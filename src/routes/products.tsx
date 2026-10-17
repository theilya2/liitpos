import { createFileRoute } from "@tanstack/react-router";
import { ProductsPage } from "@/components/pos/products-page";

export const Route = createFileRoute("/products")({
  component: ProductsPage,
});
