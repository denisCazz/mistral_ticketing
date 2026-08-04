"use client";

import { SessionProvider } from "next-auth/react";
import { Sidebar, MobileTopbar } from "@/components/layout/sidebar";
import { FloatingDocumentiAiChat } from "@/components/documenti-ai-chat";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <div className="flex h-full min-h-screen">
        <Sidebar />
        <div className="flex flex-1 min-w-0 flex-col">
          <MobileTopbar />
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
        <FloatingDocumentiAiChat />
      </div>
    </SessionProvider>
  );
}
