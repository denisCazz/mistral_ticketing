"use client";

import { STATO_COLORS, STATO_LABELS } from "@/lib/constants";
import { StatoPratica } from "@prisma/client";
import { cn } from "@/lib/utils";

export function StatoBadge({ stato }: { stato: StatoPratica }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        STATO_COLORS[stato]
      )}
    >
      {STATO_LABELS[stato]}
    </span>
  );
}
