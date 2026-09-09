"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// /robinhood is a placeholder hub for Robinhood Chain collections. Until it
// gets its own content, it forwards to the first collection page so existing
// links keep working.
export default function RobinhoodRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/robinhood/rhmachines");
  }, [router]);
  return null;
}
