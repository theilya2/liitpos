import { createFileRoute } from "@tanstack/react-router";
import { PublicReceipt } from "@/components/pos/public-receipt";
import { getPublicReceipt } from "@/lib/pos/public-receipt.functions";

export const Route = createFileRoute("/r/$token")({
  head: () => ({
    meta: [
      { title: "קבלה" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ params }) => getPublicReceipt({ data: params.token }),
  component: function PublicReceiptPage() {
    const data = Route.useLoaderData();
    return <PublicReceipt sale={data.sale} />;
  },
});
