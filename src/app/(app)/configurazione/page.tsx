"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Settings,
  Mail,
  Sparkles,
  Plus,
  X,
  Loader2,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatUsd } from "@/lib/ai-costs";

type AdminUser = { id: string; name: string; email: string };

type AiStats = {
  modelloChat: string;
  modelloEmbedding: string;
  meseCorrente: {
    generazioni: number;
    promptTokens: number;
    completionTokens: number;
    embeddingTokens: number;
    costoUsd: number;
    costoUsdFormatted: string;
    stimeParziali: number;
  };
  mesePrecedente: {
    generazioni: number;
    promptTokens: number;
    completionTokens: number;
    embeddingTokens: number;
    costoUsd: number;
    costoUsdFormatted: string;
    stimeParziali: number;
  };
  totaleGenerazioni: number;
  recenti: Array<{
    id: string;
    createdAt: string;
    model: string;
    user: string;
    promptTokens: number;
    completionTokens: number;
    embeddingTokens: number;
    costoUsd: number;
    estimated: boolean;
  }>;
};

export default function ConfigurazionePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [emails, setEmails] = useState<string[]>([]);
  const [includiAdmin, setIncludiAdmin] = useState(true);
  const [adminAttivi, setAdminAttivi] = useState<AdminUser[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [ai, setAi] = useState<AiStats | null>(null);

  useEffect(() => {
    fetch("/api/configurazione")
      .then(async (res) => {
        if (!res.ok) throw new Error("load");
        const data = await res.json();
        setEmails(data.alert.emails ?? []);
        setIncludiAdmin(Boolean(data.alert.includiAdmin));
        setAdminAttivi(data.alert.adminAttivi ?? []);
        setAi(data.ai);
      })
      .catch(() => toast.error("Errore caricamento configurazione"))
      .finally(() => setLoading(false));
  }, []);

  function addEmail() {
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Email non valida");
      return;
    }
    if (emails.includes(email)) {
      toast.error("Email già presente");
      return;
    }
    setEmails((prev) => [...prev, email]);
    setNewEmail("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/configurazione", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emails, includiAdmin }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Errore salvataggio");
      return;
    }
    const data = await res.json();
    setEmails(data.alert.emails);
    setIncludiAdmin(data.alert.includiAdmin);
    toast.success("Configurazione alert salvata");
  }

  async function testAlert() {
    setTesting(true);
    const res = await fetch("/api/configurazione/test-alert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emails, includiAdmin }),
    });
    setTesting(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Invio test fallito");
      return;
    }
    toast.success(data.message ?? "Test inviato");
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-700 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Settings className="h-6 w-6" /> Configurazione
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Destinatari alert scadenze e stima costi AI.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <form
          onSubmit={save}
          className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm space-y-4"
        >
          <div>
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-sky-700 shrink-0" />
              <h2 className="text-base font-semibold text-gray-900">
                Alert email scadenze
              </h2>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              A 30, 7 e 1 giorno. Il responsabile della scadenza riceve sempre
              la notifica.
            </p>
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
              checked={includiAdmin}
              onChange={(e) => setIncludiAdmin(e.target.checked)}
            />
            <span className="min-w-0">
              <span className="text-sm font-medium text-gray-900">
                Includi admin attivi
              </span>
              {adminAttivi.length > 0 && (
                <span className="block text-xs text-gray-500 mt-0.5 truncate">
                  {adminAttivi.map((a) => a.email).join(", ")}
                </span>
              )}
            </span>
          </label>

          <div className="space-y-2">
            <Label className="text-sm">Destinatari aggiuntivi</Label>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="email@esempio.it"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addEmail();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={addEmail}
                className="shrink-0"
              >
                <Plus className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Aggiungi</span>
              </Button>
            </div>
            {emails.length === 0 ? (
              <p className="text-xs text-gray-400">Nessuna email aggiuntiva.</p>
            ) : (
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {emails.map((email) => (
                  <li
                    key={email}
                    className="flex items-center justify-between gap-2 rounded-md border border-gray-100 bg-gray-50 px-2.5 py-1.5 text-sm"
                  >
                    <span className="text-gray-800 truncate">{email}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setEmails((prev) => prev.filter((e) => e !== email))
                      }
                      className="text-gray-400 hover:text-red-600 shrink-0"
                      aria-label={`Rimuovi ${email}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              disabled={testing || saving}
              onClick={testAlert}
            >
              {testing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Invio...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Testa alert
                </>
              )}
            </Button>
            <Button
              type="submit"
              disabled={saving || testing}
              className="bg-orange-500 hover:bg-orange-600"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvataggio...
                </>
              ) : (
                "Salva alert"
              )}
            </Button>
          </div>
        </form>

        {ai && (
          <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-sky-700 shrink-0" />
                <h2 className="text-base font-semibold text-gray-900">
                  Costi stimati AI
                </h2>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                USD · {ai.modelloChat} + {ai.modelloEmbedding}
                {ai.meseCorrente.stimeParziali > 0
                  ? ` · ${ai.meseCorrente.stimeParziali} stime approssimate`
                  : ""}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-sky-100 bg-sky-50 px-2.5 py-2.5">
                <p className="text-[10px] font-medium text-sky-700 uppercase tracking-wide">
                  Questo mese
                </p>
                <p className="text-lg font-bold text-sky-950 mt-0.5 tabular-nums leading-tight">
                  {ai.meseCorrente.costoUsdFormatted}
                </p>
                <p className="text-[11px] text-sky-800 mt-0.5">
                  {ai.meseCorrente.generazioni} gen.
                </p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2.5">
                <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                  Prec.
                </p>
                <p className="text-lg font-bold text-gray-900 mt-0.5 tabular-nums leading-tight">
                  {ai.mesePrecedente.costoUsdFormatted}
                </p>
                <p className="text-[11px] text-gray-600 mt-0.5">
                  {ai.mesePrecedente.generazioni} gen.
                </p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2.5">
                <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                  Totale
                </p>
                <p className="text-lg font-bold text-gray-900 mt-0.5 tabular-nums leading-tight">
                  {ai.totaleGenerazioni}
                </p>
                <p className="text-[11px] text-gray-600 mt-0.5">generazioni</p>
              </div>
            </div>

            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-[11px] text-gray-600 leading-relaxed">
              Token mese — prompt{" "}
              <span className="font-medium text-gray-800 tabular-nums">
                {ai.meseCorrente.promptTokens.toLocaleString("it-IT")}
              </span>
              , completion{" "}
              <span className="font-medium text-gray-800 tabular-nums">
                {ai.meseCorrente.completionTokens.toLocaleString("it-IT")}
              </span>
              , embedding{" "}
              <span className="font-medium text-gray-800 tabular-nums">
                {ai.meseCorrente.embeddingTokens.toLocaleString("it-IT")}
              </span>
            </div>

            {ai.recenti.length > 0 && (
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-[10px] text-gray-500 uppercase tracking-wide">
                      <th className="py-1.5 px-1 font-medium">Data</th>
                      <th className="py-1.5 px-1 font-medium">Utente</th>
                      <th className="py-1.5 px-1 font-medium text-right">
                        Token
                      </th>
                      <th className="py-1.5 px-1 font-medium text-right">
                        Costo
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {ai.recenti.slice(0, 8).map((r) => (
                      <tr key={r.id} className="border-b border-gray-50">
                        <td className="py-1.5 px-1 text-gray-600 whitespace-nowrap">
                          {new Date(r.createdAt).toLocaleString("it-IT", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="py-1.5 px-1 text-gray-800 truncate max-w-[7rem]">
                          {r.user}
                        </td>
                        <td className="py-1.5 px-1 text-right text-gray-600 tabular-nums">
                          {(
                            r.promptTokens +
                            r.completionTokens +
                            r.embeddingTokens
                          ).toLocaleString("it-IT")}
                          {r.estimated ? "*" : ""}
                        </td>
                        <td className="py-1.5 px-1 text-right font-medium text-gray-900 tabular-nums whitespace-nowrap">
                          {formatUsd(r.costoUsd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
