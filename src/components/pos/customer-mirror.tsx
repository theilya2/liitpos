import { useEffect, useMemo, useState } from "react";
import { pushCustomerDisplay, useCustomerPhase, type CustomerPayload } from "@/lib/pos/customer-display";
import { selectCustomerSlides } from "@/lib/pos/customer-screen";
import { formatILS } from "@/lib/pos/money";
import { pricedOrPlain, selectPromos } from "@/lib/pos/promo";
import { qrSvg } from "@/lib/pos/qr";
import { receiptUrl } from "@/lib/pos/receipt-link";
import { usePos } from "@/lib/pos/store";

const empty: CustomerPayload = {
  mode: "idle",
  business: "",
  logo: "",
  slides: [],
  lines: [],
  discounts: [],
  total: "",
  pay: "",
  ring: "",
  thanks: "",
  qr: "",
};

export function CustomerMirror() {
  const enabled = usePos((state) => state.settings.customerScreen !== false);
  const business = usePos((state) => state.settings.businessName);
  const logo = usePos((state) => state.settings.logo);
  const slides = usePos((state) => selectCustomerSlides(state.settings.customerSlides));
  const cart = usePos((state) => state.cart);
  const products = usePos((state) => state.products);
  const promos = usePos((state) => selectPromos(state.settings.promos));
  const discount = usePos((state) => state.discount);
  const vatRate = usePos((state) => state.settings.vatRate);
  const sales = usePos((state) => state.sales);
  const phase = useCustomerPhase();
  const [releaseThanks, setReleaseThanks] = useState(false);

  useEffect(() => {
    if (phase.mode !== "thanks") {
      setReleaseThanks(false);
      return;
    }
    const timer = window.setTimeout(() => setReleaseThanks(true), 4000);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const payload = useMemo(() => {
    const base = { ...empty, business };
    if (phase.mode === "thanks" && !releaseThanks) {
      const sale = sales.find((item) => item.id === phase.saleId);
      const url = sale?.publicToken ? receiptUrl(sale.publicToken) : "";
      return {
        ...base,
        mode: "thanks" as const,
        logo: logo || "",
        total: formatILS(sale?.total ?? 0),
        thanks: "תודה שקניתם אצלנו",
        qr: url ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg(url))}` : "",
      };
    }
    if (phase.mode === "pay" || cart.length) {
      const totals = pricedOrPlain(cart, products, promos, discount, vatRate);
      return {
        ...base,
        mode: phase.mode === "pay" ? ("pay" as const) : ("cart" as const),
        lines: cart.map((line) => ({ key: line.key, name: line.name, qty: line.qty, total: formatILS(line.unitPrice * line.qty) })),
        discounts: [
          ...totals.hits.map((hit) => ({ name: hit.name, amount: formatILS(hit.amount) })),
          ...(totals.discountAmount > 0 ? [{ name: "הנחה", amount: formatILS(totals.discountAmount) }] : []),
        ],
        total: formatILS(totals.total),
        pay: phase.mode === "pay" ? phase.status : "",
        ring: (phase.mode === "pay" ? phase.ring || "" : "") as "" | "wait" | "ok" | "fail",
      };
    }
    return { ...base, mode: "idle" as const, logo: logo || "", slides: slides.map((slide) => ({ image: slide.image, caption: slide.caption })) };
  }, [business, cart, discount, logo, phase, products, promos, releaseThanks, sales, slides, vatRate]);

  useEffect(() => {
    void pushCustomerDisplay(payload, enabled);
  }, [enabled, payload]);

  return null;
}
