import { Suspense } from "react";
import DocumentiWorkspace from "./documenti-workspace";

export default function DocumentiPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-700 border-t-transparent" />
        </div>
      }
    >
      <DocumentiWorkspace />
    </Suspense>
  );
}
