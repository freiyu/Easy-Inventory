"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/api";
import { useMounted } from "@/hooks/use-mounted";

// Entry point: send the visitor to the right place for their session.
export default function Home() {
  const router = useRouter();
  const mounted = useMounted();
  const { user, loaded } = useSession();
  useEffect(() => {
    if (mounted && loaded) router.replace(user ? "/dashboard" : "/login");
  }, [mounted, loaded, user, router]);
  return null;
}
