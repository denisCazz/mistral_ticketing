"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-80 flex-col items-center justify-center gap-4 p-8 text-center">
      <div>
        <p className="font-medium text-slate-950">Qualcosa è andato storto</p>
        <p className="mt-1 text-sm text-slate-500">
          Riprova oppure torna alla dashboard.
        </p>
      </div>
      <Button variant="outline" onClick={reset}>
        Riprova
      </Button>
    </div>
  );
}
