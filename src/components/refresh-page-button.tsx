"use client";

import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RefreshPageButton() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Aggiorna"
      onClick={() => router.refresh()}
    >
      <RefreshCw className="size-4" aria-hidden />
    </Button>
  );
}
