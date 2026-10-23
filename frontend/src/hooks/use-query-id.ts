import { useSearchParams } from "next/navigation";

/** Entity pages use a query string (/items/view?id=12) so static export works (PRD 0.3). */
export function useQueryId(): number | null {
  const raw = useSearchParams().get("id");
  const id = raw ? Number(raw) : NaN;
  return Number.isInteger(id) ? id : null;
}
