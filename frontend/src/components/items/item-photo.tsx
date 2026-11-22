import { ImageOff } from "lucide-react";
import { apiUrl } from "@/lib/api/transport";
import { cn } from "@/lib/utils";

/**
 * An item's photo, or an empty state when there is none. `version` is the stored file name: it changes with
 * every new photo, so it is the cache key. `src` overrides it for a preview of a file the user just chose.
 */
export function ItemPhoto({
  id, name, version, src, emptyLabel, className,
}: { id?: number; name: string; version: string | null | undefined; src?: string; emptyLabel: string; className?: string }) {
  const url = src ?? (id && version ? `${apiUrl(`/items/${id}/photo`)}?v=${version}` : null);
  return (
    <div className={cn("flex size-36 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted", className)}>
      {url ? (
        // A plain img: the file comes from our own API and, for a preview, from a blob URL, so next/image has nothing to optimise.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className="size-full object-cover" />
      ) : (
        <div className="flex flex-col items-center gap-1 px-2 text-center text-(length:--text-table) text-muted-foreground">
          <ImageOff className="size-6" aria-hidden="true" />
          <span>{emptyLabel}</span>
        </div>
      )}
    </div>
  );
}
