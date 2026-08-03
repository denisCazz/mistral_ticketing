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
import { STATO_LABELS, STATI_CHIUSURA, statiTargetDisponibili, messaggioStatoNonModificabile, isCatOperatore } from "@/lib/constants";
import { StatoPratica } from "@prisma/client";
import { ArrowLeft, Phone, MapPin, Clock, Building2, Send, Pencil } from "lucide-react";
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
  manutentore: { id: string; name: string; email: string } | null;
  cat: { id: string; ragioneSociale: string; emails: string[]; telefono: string | null; referenti: string[] } | null;
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
  const [catList, setCatList] = useState<{ id: string; ragioneSociale: string }[]>([]);
  const [savingCat, setSavingCat] = useState(false);
  const [sollecitoLoading, setSollecitoLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [manutentori, setManutentori] = useState<{ id: string; name: string }[]>([]);
  const [editForm, setEditForm] = useState({
    tipoIntervento: "",
    descrizione: "",
    noteInterne: "",
    manutentoreId: "",
  });

  useEffect(() => {
    fetch(`/api/pratiche/${id}?includeCats=1`)
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
        const { catList: cats, ...praticaData } = d;
        setPratica(praticaData);
        if (Array.isArray(cats)) setCatList(cats);
      });
  }, [id, router]);

  function openEdit() {
    if (!pratica) return;
    setEditForm({
      tipoIntervento: pratica.tipoIntervento ?? "",
      descrizione: pratica.descrizione ?? "",
      noteInterne: pratica.noteInterne ?? "",
      manutentoreId: pratica.manutentore?.id ?? "",
    });
    setEditOpen(true);
    if (manutentori.length === 0) {
      fetch("/api/utenti")
        .then((r) => (r.ok ? r.json() : []))
        .then((users: { id: string; name: string; role: string; active: boolean }[]) => {
          if (!Array.isArray(users)) return;
          setManutentori(
            users
              .filter((u) => u.role === "MANUTENTORE" && u.active)
              .map((u) => ({ id: u.id, name: u.name }))
          );
        })
        .catch(() => {});
    }
  }

  async function reloadPratica() {
    const res = await fetch(`/api/pratiche/${id}?includeCats=1`);
    if (!res.ok) return null;
    const data = await res.json();
    const { catList: cats, ...praticaData } = data;
    setPratica(praticaData);
    if (Array.isArray(cats)) setCatList(cats);
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
        manutentoreId: editForm.manutentoreId || null,
      }),
    });
    setSavingEdit(false);
    if (!res.ok) { toast.error("Errore durante il salvataggio"); return; }
    await reloadPratica();
    setEditOpen(false);
    toast.success("Pratica aggiornata");
  }

  async function assegnaCat(catId: string) {
    setSavingCat(true);
    const res = await fetch(`/api/pratiche/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ catId: catId || null }),
    });
    setSavingCat(false);
    if (!res.ok) { toast.error("Errore assegnazione CAT"); return; }
    await reloadPratica();
    toast.success(catId ? "CAT assegnato" : "CAT rimosso");
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

  const catOptions = useMemo(() => {
    const map = new Map(catList.map((c) => [c.id, c]));
    if (pratica?.cat && !map.has(pratica.cat.id)) {
      map.set(pratica.cat.id, { id: pratica.cat.id, ragioneSociale: pratica.cat.ragioneSociale });
    }
    return [...map.values()].sort((a, b) => a.ragioneSociale.localeCompare(b.ragioneSociale, "it"));
  }, [catList, pratica?.cat]);

  if (!pratica) {
    return (
      <div className="p-8 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
      </div>
    );
  }

  const selectedCatLabel = pratica.cat?.ragioneSociale
    ?? catOptions.find((c) => c.id === pratica.cat?.id)?.ragioneSociale;

  const isClosed = STATI_CHIUSURA.includes(pratica.stato);
  const isCatUser = isCatOperatore(session?.user?.role, session?.user?.catId);
  const canEdit = session?.user?.role !== "MANUTENTORE" || Boolean(session?.user?.catId);
  const canManageCat = canEdit && !isCatUser;
  const isAdmin = session?.user?.role === "ADMIN";
  const statiDisponibili = statiTargetDisponibili(
    session?.user?.role,
    session?.user?.catId,
    pratica.stato
  );
  const messaggioStato = messaggioStatoNonModificabile(
    session?.user?.role,
    session?.user?.catId,
    pratica.stato
  );
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
              {pratica.noteInterne && session?.user?.role !== "MANUTENTORE" && (
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

          {isCatUser && messaggioStato && !puoAggiornareStato && (
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
              {canEdit ? (
                <Link href={`/clienti/${pratica.cliente.id}`} className="text-sm font-medium text-orange-600 hover:underline block">
                  {pratica.cliente.ragioneSociale}
                </Link>
              ) : (
                <p className="text-sm font-medium text-gray-900">{pratica.cliente.ragioneSociale}</p>
              )}
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
              <CardTitle className="text-base">Assegnazione</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-gray-500 mb-1">Operatore</p>
                <p className="font-medium text-gray-900">{pratica.operatore.name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Manutentore</p>
                <p className="font-medium text-gray-900">
                  {pratica.manutentore?.name ?? "Non assegnato"}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* CAT */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Centro Assistenza
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {canManageCat && (
                <Select
                  value={pratica.cat?.id ?? "none"}
                  onValueChange={(v) => assegnaCat(!v || v === "none" ? "" : String(v))}
                >
                  <SelectTrigger disabled={savingCat}>
                    <SelectValue placeholder="Assegna un CAT...">
                      {selectedCatLabel}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nessun CAT</SelectItem>
                    {catOptions.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.ragioneSociale}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {pratica.cat ? (
                <div className="space-y-1">
                  <p className="font-medium text-gray-900">{pratica.cat.ragioneSociale}</p>
                  {pratica.cat.referenti?.length ? (
                    <p className="text-xs text-gray-500">{pratica.cat.referenti.join(" · ")}</p>
                  ) : null}
                  {pratica.cat.emails.map((email) => (
                    <p key={email} className="text-xs text-gray-500">{email}</p>
                  ))}
                  {pratica.cat.telefono && (
                    <p className="text-xs text-gray-500">{pratica.cat.telefono}</p>
                  )}
                  {canManageCat && (
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
              ) : (
                <p className="text-xs text-gray-400">Nessun CAT assegnato</p>
              )}
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
                <Label htmlFor="edit-manutentore">Manutentore</Label>
                <Select
                  value={editForm.manutentoreId || "none"}
                  onValueChange={(v) => setEditForm((f) => ({ ...f, manutentoreId: v === "none" ? "" : String(v) }))}
                >
                  <SelectTrigger id="edit-manutentore">
                    <SelectValue placeholder="Nessun manutentore">
                      {editForm.manutentoreId
                        ? manutentori.find((m) => m.id === editForm.manutentoreId)?.name
                          ?? pratica.manutentore?.name
                        : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nessun manutentore</SelectItem>
                    {manutentori.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
