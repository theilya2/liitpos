import type { KioskSlide } from "@/lib/pos/types";

const EMPTY_SLIDES: KioskSlide[] = [];

export function cleanCustomerSlides(value: unknown): KioskSlide[] {
  if (!Array.isArray(value)) return [];
  const slides: KioskSlide[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Partial<KioskSlide>;
    const image = typeof raw.image === "string" && raw.image.startsWith("data:image/") && raw.image.length <= 150_000 ? raw.image : "";
    if (!image) continue;
    slides.push({
      id: typeof raw.id === "string" && raw.id ? raw.id.slice(0, 40) : `slide-${slides.length}`,
      image,
      caption: typeof raw.caption === "string" ? raw.caption.slice(0, 80) : "",
    });
    if (slides.length >= 8) break;
  }
  return slides;
}

export function selectCustomerSlides(slides: KioskSlide[] | null | undefined): KioskSlide[] {
  return slides ?? EMPTY_SLIDES;
}
