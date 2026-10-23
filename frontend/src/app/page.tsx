"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/lib/mock/store";
import { useMounted } from "@/hooks/use-mounted";

// Entry point: send the visitor to the right place for their session.
export default function Home() {
  const router = useRouter();
  const mounted = useMounted();
  const user = useCurrentUser();
  useEffect(() => {
    if (mounted) router.replace(user ? "/dashboard" : "/login");
  }, [mounted, user, router]);
  return null;
}
