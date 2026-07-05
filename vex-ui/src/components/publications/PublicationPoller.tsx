"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Refreshes the current Server Component page on an interval while a
 * publication is waiting on something external (the signing workflow) —
 * stops as soon as nothing is in flight, so this isn't running forever.
 */
export function PublicationPoller({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(interval);
  }, [active, router]);

  return null;
}
