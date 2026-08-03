"use client";

import { Suspense } from "react";
import NuovoRapportinoForm from "./nuovo-form";

export default function NuovoRapportinoPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-700" />
        </div>
      }
    >
      <NuovoRapportinoForm />
    </Suspense>
  );
}
