import { renderSVG } from "uqr";

export function qrSvg(text: string): string {
  return renderSVG(text, { ecc: "M", border: 1, pixelSize: 6, whiteColor: "#ffffff", blackColor: "#1c1917" });
}
