import qrcode from "qrcode-generator";

/** QR code modules for `value` (byte mode, error correction M, smallest version). `true` = dark module. Null for an empty value. */
export function qrMatrix(value: string): boolean[][] | null {
  if (!value.trim()) return null;
  const qr = qrcode(0, "M");
  qr.addData(value, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}
