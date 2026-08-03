"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { StatoBadge } from "@/components/stato-badge";
import { STATO_LABELS, STATI_CHIUSURA, statiTargetDisponibili, messaggioStatoNonModificabile } from "@/lib/constants";
import { canAssignOperatore } from "@/lib/access";
import { StatoPratica } from "@prisma/client";
import { ArrowLeft, Phone, MapPin, Clock, Send, Pencil, UserCog } from "lucide-react";
import { useSession } from "next-auth/react";

interface PraticaDetail {
  id: string;
  numeroPratica: string;
  stato: StatoPratica;
  tipoIntervento: string | null;
  descrizione: string | null;
  noteInterne: string | null;
  createdAt: string;
  updatedAt: string;
  cliente: {
    id: string;
    ragioneSociale: string;
    citta: string | null;
    provincia: string | null;
    indirizzo: string | null;
    cap: string | null;
    cellulare: string | null;
    telFisso: string | null;
    email: string | null;
  };
  operatore: { id: string; name: string; email: string };
  storia: {
    id: string;
    statoDa: StatoPratica | null;
    statoA: StatoPratica;
    changedAt: string;
    note: string | null;
    changedBy: { id: string; name: string };
  }[];
}

export default function PraticaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const [pratica, setPratica] = useState<PraticaDetail | null>(null);
  const [newStato, setNewStato] = useState<StatoPratica | "">("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [operatoriList, setOperatoriList] = useState<{ id: string; name: string; email: string }[]>([]);
  const [savingOperatore, setSavingOperatore] = useState(false);
  const [sollecitoLoading, setSollecitoLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    tipoIntervento: "",
    descrizione: "",
    noteInterne: "",
  });

  useEffect(() => {
    fetch(`/api/pratiche/${id}?includeOperatori=1`)
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          if (r.status === 403) {
            toast.error("Non hai accesso a questa pratica");
          } else if (r.status === 404) {
            toast.error("Pratica non trovata");
          } else {
            toast.error(data.error ?? "Errore caricamento pratica");
          }
          router.push("/pratiche");
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        const { operatoriList: ops, ...praticaData } = d;
        setPratica(praticaData);
        if (Array.isArray(ops)) setOperatoriList(ops);
      });
  }, [id, router]);

  function openEdit() {
    if (!pratica) return;
    setEditForm({
      tipoIntervento: pratica.tipoIntervento ?? "",
      descrizione: pratica.descrizione ?? "",
      noteInterne: pratica.noteInterne ?? "",
    });
    setEditOpen(true);
  }

  async function reloadPratica() {
    const res = await fetch(`/api/pratiche/${id}?includeOperatori=1`);
    if (!res.ok) return null;
    const data = await res.json();
    const { operatoriList: ops, ...praticaData } = data;
    setPratica(praticaData);
    if (Array.isArray(ops)) setOperatoriList(ops);
    return praticaData;
  }

  async function salvaModifica() {
    setSavingEdit(true);
    const res = await fetch(`/api/pratiche/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipoIntervento: editForm.tipoIntervento || null,
        descrizione: editForm.descrizione || null,
        noteInterne: editForm.noteInterne || null,
      }),
    });
    setSavingEdit(false);
    if (!res.ok) { toast.error("Errore durante il salvataggio"); return; }
    await reloadPratica();
    setEditOpen(false);
    toast.success("Pratica aggiornata");
  }

  async function assegnaOperatore(operatoreId: string) {
    if (!operatoreId) return;
    setSavingOperatore(true);
    const res = await fetch(`/api/pratiche/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operatoreId }),
    });
    setSavingOperatore(false);
    if (!res.ok) { toast.error("Errore assegnazione operatore"); return; }
    await reloadPratica();
    toast.success("Operatore assegnato");
  }

  async function inviaSollecito() {
    setSollecitoLoading(true);
    const res = await fetch(`/api/pratiche/${id}/sollecito`, { method: "POST" });
    setSollecitoLoading(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(data.error ?? "Errore invio sollecito"); return; }
    toast.success(`Sollecito inviato a ${data.to}`);
  }

  async function cambiaStato() {
    if (!newStato) return;
    setLoading(true);
    const res = await fetch(`/api/pratiche/${id}/stato`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stato: newStato as StatoPratica, note: note || undefined }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Errore aggiornamento stato");
      return;
    }
    await reloadPratica();
    setNewStato("");
    setNote("");
    toast.success(isClosed ? "Pratica riaperta" : "Stato aggiornato");
  }

  const operatoriOptions = useMemo(() => {
    const map = new Map(operatoriList.map((o) => [o.id, o]));
    if (pratica?.operatore && !map.has(pratica.operatore.id)) {
      map.set(pratica.operatore.id, {
        id: pratica.operatore.id,
        name: pratica.operatore.name,
        email: pratica.operatore.email,
      });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "it"));
  }, [operatoriList, pratica?.operatore]);

  if (!pratica) {
    return (
      <div className="p-8 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
      </div>
    );
  }

  const isClosed = STATI_CHIUSURA.includes(pratica.stato);
  const canAssign = canAssignOperatore(session);
  const isAdmin = session?.user?.role === "ADMIN";
  const statiDisponibili = statiTargetDisponibili(
    session?.user?.role,
    pratica.stato
  );
  const messaggioStato = messaggioStatoNonModificabile(session?.user?.role);
  const puoAggiornareStato = statiDisponibili.length > 0;

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/pratiche">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900 font-mono">{pratica.numeroPratica}</h1>
            <StatoBadge stato={pratica.stato} />
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Aperta il {new Date(pratica.createdAt).toLocaleDateString("it-IT")} · Ultimo aggiornamento {new Date(pratica.updatedAt).toLocaleDateString("it-IT")}
          </p>
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={openEdit}>
            <Pencil className="h-4 w-4 mr-2" /> Modifica
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-4">
          {/* Dettagli intervento */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Dettagli intervento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pratica.tipoIntervento && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tipo</p>
                  <p className="text-sm text-gray-900 mt-1">{pratica.tipoIntervento}</p>
                </div>
              )}
              {pratica.descrizione && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Descrizione</p>
                  <p className="text-sm text-gray-900 mt-1 whitespace-pre-wrap">{pratica.descrizione}</p>
                </div>
              )}
              {pratica.noteInterne && (
                <div className="bg-yellow-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-yellow-700 uppercase tracking-wide">Note interne</p>
                  <p className="text-sm text-yellow-900 mt-1">{pratica.noteInterne}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cambia stato / Riapri */}
          {puoAggiornareStato && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {isClosed ? "Riapri pratica" : "Aggiorna stato"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {isClosed && (
                  <p className="text-sm text-gray-600">
                    La pratica è chiusa. Seleziona lo stato in cui riaprirla.
                  </p>
                )}
                <Select value={newStato || "none"} onValueChange={(v) => setNewStato((v === "none" ? "" : v) as StatoPratica | "")}>
                  <SelectTrigger>
                    <SelectValue placeholder={isClosed ? "Seleziona stato di riapertura..." : "Seleziona nuovo stato..."} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" disabled>
                      {isClosed ? "Seleziona stato di riapertura..." : "Seleziona nuovo stato..."}
                    </SelectItem>
                    {statiDisponibili.map((s) => (
                      <SelectItem key={s} value={s}>{STATO_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="space-y-1">
                  <Label>{isClosed ? "Motivo riapertura (opzionale)" : "Note sul cambio (opzionale)"}</Label>
                  <Textarea
                    placeholder={isClosed ? "Es. cliente ha richiesto ulteriore intervento..." : "Aggiungi una nota..."}
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
                <Button
                  className="w-full bg-orange-500 hover:bg-orange-600"
                  onClick={cambiaStato}
                  disabled={!newStato || loading}
                >
                  {loading
                    ? "Aggiornamento..."
                    : isClosed
                      ? "Riapri pratica"
                      : "Conferma cambio stato"}
                </Button>
              </CardContent>
            </Card>
          )}

          {messaggioStato && !puoAggiornareStato && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Aggiorna stato</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600">{messaggioStato}</p>
              </CardContent>
            </Card>
          )}

          {/* Timeline */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Storico stati</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {pratica.storia.map((s, i) => (
                  <div key={s.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                        <Clock className="h-4 w-4 text-orange-500" />
                      </div>
                      {i < pratica.storia.length - 1 && (
                        <div className="w-0.5 h-full bg-gray-200 mt-1" />
                      )}
                    </div>
                    <div className="pb-4 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatoBadge stato={s.statoA} />
                        <span className="text-xs text-gray-500">
                          {new Date(s.changedAt).toLocaleString("it-IT")} · {s.changedBy.name}
                        </span>
                      </div>
                      {s.note && <p className="text-xs text-gray-600 mt-1">{s.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Cliente */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href={`/clienti/${pratica.cliente.id}`} className="text-sm font-medium text-orange-600 hover:underline block">
                {pratica.cliente.ragioneSociale}
              </Link>
              {pratica.cliente.indirizzo && (
                <div className="flex items-start gap-1.5 text-xs text-gray-600">
                  <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{pratica.cliente.indirizzo}, {pratica.cliente.cap} {pratica.cliente.citta} ({pratica.cliente.provincia})</span>
                </div>
              )}
              {(pratica.cliente.cellulare || pratica.cliente.telFisso) && (
                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  <span>{pratica.cliente.cellulare ?? pratica.cliente.telFisso}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Assegnazione */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <UserCog className="h-4 w-4" /> Assegnazione
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-gray-500 mb-1">Operatore</p>
                {canAssign ? (
                  <Select
                    value={pratica.operatore.id}
                    onValueChange={(v) => v && assegnaOperatore(String(v))}
                  >
                    <SelectTrigger disabled={savingOperatore}>
                      <SelectValue>
                        {pratica.operatore.name}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {operatoriOptions.map((o) => (
                        <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="font-medium text-gray-900">{pratica.operatore.name}</p>
                )}
                {pratica.operatore.email && (
                  <p className="text-xs text-gray-500 mt-1">{pratica.operatore.email}</p>
                )}
                {isAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2"
                    onClick={inviaSollecito}
                    disabled={sollecitoLoading}
                  >
                    <Send className="h-3.5 w-3.5 mr-2" />
                    {sollecitoLoading ? "Invio..." : "Invia sollecito"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {isAdmin && (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Modifica pratica {pratica.numeroPratica}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-1">
                <Label htmlFor="edit-tipo">Tipo intervento</Label>
                <Input
                  id="edit-tipo"
                  value={editForm.tipoIntervento}
                  onChange={(e) => setEditForm((f) => ({ ...f, tipoIntervento: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-descrizione">Descrizione problema</Label>
                <Textarea
                  id="edit-descrizione"
                  rows={3}
                  value={editForm.descrizione}
                  onChange={(e) => setEditForm((f) => ({ ...f, descrizione: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-note">Note interne</Label>
                <Textarea
                  id="edit-note"
                  rows={2}
                  value={editForm.noteInterne}
                  onChange={(e) => setEditForm((f) => ({ ...f, noteInterne: e.target.value }))}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Annulla</Button>
                <Button
                  type="button"
                  className="bg-orange-500 hover:bg-orange-600"
                  onClick={salvaModifica}
                  disabled={savingEdit}
                >
                  {savingEdit ? "Salvataggio..." : "Salva modifiche"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
