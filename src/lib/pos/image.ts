/** Synced images stay under the same cap as the business logo. */
export const MAX_IMAGE_CHARS = 150_000;

function paint(image: CanvasImageSource, width: number, height: number, quality: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas");
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

export function compressImage(file: File, max = 240): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      try {
        let side = Math.min(800, Math.max(64, max), Math.max(image.width, image.height));
        let quality = 0.72;
        let data = "";
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const scale = Math.min(1, side / Math.max(image.width, image.height));
          const width = Math.max(1, Math.round(image.width * scale));
          const height = Math.max(1, Math.round(image.height * scale));
          data = paint(image, width, height, quality);
          if (data.length <= MAX_IMAGE_CHARS) {
            resolve(data);
            return;
          }
          if (side > 160) side = Math.round(side * 0.75);
          else quality = Math.max(0.4, quality - 0.12);
        }
        reject(new Error("large"));
      } catch (error) {
        reject(error instanceof Error ? error : new Error("canvas"));
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image"));
    };
    image.src = url;
  });
}

export function usableImage(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("data:image/") && value.length > MAX_IMAGE_CHARS) return null;
  return value;
}
