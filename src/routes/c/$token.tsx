import { createFileRoute } from "@tanstack/react-router";
import { PublicCredit } from "@/components/pos/public-credit";
import { getPublicCredit } from "@/lib/pos/public-credit.functions";

export const Route = createFileRoute("/c/$token")({
  head: () => ({
    meta: [
      { title: "שובר זיכוי" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ params }) => getPublicCredit({ data: params.token }),
  component: function PublicCreditPage() {
    const data = Route.useLoaderData();
    return <PublicCredit credit={data.credit} />;
  },
});
