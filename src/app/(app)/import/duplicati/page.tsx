"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Users, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface DuplicatoRecord {
  id: string;
  gruppoId: string;
  recordJson: {
    ragioneSociale: string;
    indirizzo?: string;
    cap?: string;
    citta?: string;
    provincia?: string;
    cellulare?: string;
    telFisso?: string;
    email?: string;
  };
  scelto: boolean;
  risolto: boolean;
}

interface Gruppo {
  gruppoId: string;
  records: DuplicatoRecord[];
}

export default function DuplicatiPage() {
  const [gruppi, setGruppi] = useState<Gruppo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const fetchDuplicati = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/import/duplicati");
    if (res.ok) setGruppi(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchDuplicati(); }, [fetchDuplicati]);

  async function scegli(recordId: string) {
    setLoadingId(recordId);
    const res = await fetch(`/api/import/duplicati/${recordId}/scegli`, { method: "POST" });
    setLoadingId(null);
    if (!res.ok) { toast.error("Errore durante la scelta"); return; }
    toast.success("Cliente importato correttamente");
    fetchDuplicati();
  }

  const totale = gruppi.length;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/import">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="h-6 w-6 text-orange-500" />
            Gestione duplicati
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {totale === 0 ? "Nessun duplicato da risolvere" : `${totale} gruppi da risolvere — scegli quale record tenere per ogni gruppo`}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-16 flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
        </div>
      ) : gruppi.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <p className="font-medium text-gray-900">Nessun duplicato da risolvere</p>
            <p className="text-sm text-gray-500 mt-1">Tutti i gruppi sono stati risolti</p>
            <Link href="/clienti" className="mt-4 inline-block">
              <Button className="bg-orange-500 hover:bg-orange-600">Vai ai clienti →</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {gruppi.map((gruppo, gi) => (
            <Card key={gruppo.gruppoId} className="overflow-hidden">
              <CardHeader className="bg-yellow-50 border-b border-yellow-100 pb-3">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>Gruppo {gi + 1} — <span className="text-gray-600">{gruppo.records[0]?.recordJson.ragioneSociale}</span></span>
                  <Badge variant="outline" className="text-yellow-700 border-yellow-300">
                    {gruppo.records.length} record simili
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-gray-100">
                  {gruppo.records.map((r) => {
                    const rec = r.recordJson;
                    return (
                      <div key={r.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-gray-900">{rec.ragioneSociale}</p>
                          <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500">
                            {rec.indirizzo && <span>{rec.indirizzo}{rec.cap ? `, ${rec.cap}` : ""} {rec.citta}{rec.provincia ? ` (${rec.provincia})` : ""}</span>}
                            {rec.cellulare && <span>📱 {rec.cellulare}</span>}
                            {rec.telFisso && <span>☎ {rec.telFisso}</span>}
                            {rec.email && <span>✉ {rec.email}</span>}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          className="ml-4 shrink-0 bg-orange-500 hover:bg-orange-600"
                          disabled={loadingId === r.id}
                          onClick={() => scegli(r.id)}
                        >
                          {loadingId === r.id ? "..." : "Scegli questo"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
