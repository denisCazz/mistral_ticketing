"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ScadenzaRow {
  id: string;
  titolo: string;
  dataScadenza: string;
  giorniRimanenti: number;
  confermata: boolean;
  documento?: { titoloOriginale: string } | null;
  responsabile?: { name: string } | null;
}

export default function ScadenzePage() {
  const [scadenze, setScadenze] = useState<ScadenzaRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/scadenze?giorni=90")
      .then((r) => r.json())
      .then((d) => {
        setScadenze(d.scadenze ?? []);
        setLoading(false);
      });
  }, []);

  async function conferma(id: string) {
    const res = await fetch(`/api/scadenze/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confermata: true }),
    });
    if (!res.ok) {
      toast.error("Errore");
      return;
    }
    toast.success("Confermata");
    const refreshed = await fetch("/api/scadenze?giorni=90").then((r) => r.json());
    setScadenze(refreshed.scadenze ?? []);
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Scadenziario</h1>
        <p className="text-sm text-gray-500">Alert a 30, 7 e 1 giorno</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-700" />
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3">Titolo</th>
                <th className="px-4 py-3">Scadenza</th>
                <th className="px-4 py-3">Giorni</th>
                <th className="px-4 py-3">Confermata</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {scadenze.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="px-4 py-3">{s.titolo}</td>
                  <td className="px-4 py-3">
                    {new Date(s.dataScadenza).toLocaleDateString("it-IT")}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        s.giorniRimanenti <= 7
                          ? "text-red-600 font-medium"
                          : s.giorniRimanenti <= 30
                            ? "text-orange-600"
                            : ""
                      }
                    >
                      {s.giorniRimanenti}
                    </span>
                  </td>
                  <td className="px-4 py-3">{s.confermata ? "Sì" : "No"}</td>
                  <td className="px-4 py-3">
                    {!s.confermata && (
                      <Button size="sm" variant="outline" onClick={() => conferma(s.id)}>
                        Conferma
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {scadenze.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    Nessuna scadenza nei prossimi 90 giorni
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
