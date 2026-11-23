import { code128Widths } from "@/lib/code128";

const QUIET = 10; // modules of empty space each side, the Code 128 minimum (same as components/shared/barcode.tsx)
const SCALE = 4; // pixels per module: a 12-character code is about 1,000 px wide, sharp when printed
const BAR_HEIGHT = 120;
const MARGIN = 16;
const CAPTION_HEIGHT = 36;

/**
 * Draws the barcode on a canvas, black on white, and saves it as a PNG file.
 * `caption` is printed under the bars; pass nothing when the code must not be read as text (Staff).
 * Returns false when `value` cannot be encoded as Code 128.
 */
export function downloadBarcodePng(value: string, fileName: string, caption?: string): boolean {
  const widths = code128Widths(value);
  if (!widths) return false;
  const canvas = document.createElement("canvas");
  canvas.width = (widths.reduce((a, b) => a + b, 0) + 2 * QUIET) * SCALE;
  canvas.height = MARGIN * 2 + BAR_HEIGHT + (caption ? CAPTION_HEIGHT : 0);
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000";
  let x = QUIET * SCALE;
  widths.forEach((w, i) => {
    if (i % 2 === 0) ctx.fillRect(x, MARGIN, w * SCALE, BAR_HEIGHT); // even index = bar, odd = space
    x += w * SCALE;
  });
  if (caption) {
    ctx.font = "bold 26px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(caption, canvas.width / 2, MARGIN + BAR_HEIGHT + 6);
  }
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
  return true;
}
