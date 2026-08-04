"use client";

import {
  STATO_PREVENTIVO_COLORS,
  STATO_PREVENTIVO_LABELS,
} from "@/lib/preventivo-constants";
import { StatoPreventivo } from "@prisma/client";
import { cn } from "@/lib/utils";

export function PreventivoStatoBadge({ stato }: { stato: StatoPreventivo }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        STATO_PREVENTIVO_COLORS[stato]
      )}
    >
      {STATO_PREVENTIVO_LABELS[stato]}
    </span>
  );
}
