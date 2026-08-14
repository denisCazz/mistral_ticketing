"use client";

import { useState } from "react";
import { Bot, Network } from "lucide-react";
import ProcessingPanel from "@/components/documenti-ai/processing-panel";
import DocumentMapPanel from "@/components/documenti-ai/document-map-panel";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

export default function DocumentiAiAdminPage() {
  const [tab, setTab] = useState("processing");

  return (
    <div className="max-w-7xl space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <Bot className="size-6 text-sky-700" />
          Elaborazione AI documenti
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Coda persistente e embedding RAG v2. I job partono solo se è
          attivo <code>npm run documenti:worker</code>.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="processing">
            <Bot />
            Elaborazione
          </TabsTrigger>
          <TabsTrigger value="map">
            <Network />
            Mappa 3D
          </TabsTrigger>
        </TabsList>
        <TabsContent value="processing" className="pt-4">
          <ProcessingPanel />
        </TabsContent>
        <TabsContent value="map" className="pt-4">
          {tab === "map" ? <DocumentMapPanel /> : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
