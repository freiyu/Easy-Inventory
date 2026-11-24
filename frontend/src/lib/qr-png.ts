import { qrMatrix } from "@/lib/qr";

const QUIET = 4; // modules of empty space each side, the QR minimum (same as components/shared/qr-code.tsx)
const SCALE = 8; // pixels per module: sharp when printed
const MARGIN = 16;
const CAPTION_HEIGHT = 36;

/**
 * Draws the QR code on a canvas, black on white, and saves it as a PNG file.
 * `caption` is printed under the symbol; pass nothing when the code must not be read as text (Staff).
 * Returns false when `value` is empty or the canvas is not available.
 */
export function downloadQrPng(value: string, fileName: string, caption?: string): boolean {
  const matrix = qrMatrix(value);
  if (!matrix) return false;
  const side = (matrix.length + 2 * QUIET) * SCALE;
  const canvas = document.createElement("canvas");
  canvas.width = side + MARGIN * 2;
  canvas.height = side + MARGIN * 2 + (caption ? CAPTION_HEIGHT : 0);
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000";
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) ctx.fillRect(MARGIN + (x + QUIET) * SCALE, MARGIN + (y + QUIET) * SCALE, SCALE, SCALE);
    }),
  );
  if (caption) {
    ctx.font = "bold 26px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(caption, canvas.width / 2, MARGIN + side + 6);
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
