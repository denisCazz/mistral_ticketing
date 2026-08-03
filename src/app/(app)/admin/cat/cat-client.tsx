"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Building2, Upload, Trash2, Mail, Phone, Pencil, X } from "lucide-react";

export interface Cat {
  id: string;
  ragioneSociale: string;
  referenti: string[];
  emails: string[];
  telefono: string | null;
  indirizzo: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  note: string | null;
  active: boolean;
  _count: { pratiche: number };
}

interface CatForm {
  ragioneSociale: string;
  emails: string[];
  referenti: string[];
  telefono: string;
  indirizzo: string;
  cap: string;
  citta: string;
  provincia: string;
  note: string;
}

const EMPTY: CatForm = {
  ragioneSociale: "",
  emails: [""],
  referenti: [""],
  telefono: "",
  indirizzo: "",
  cap: "",
  citta: "",
  provincia: "",
  note: "",
};

function catToForm(c: Cat): CatForm {
  return {
    ragioneSociale: c.ragioneSociale,
    emails: c.emails.length > 0 ? c.emails : [""],
    referenti: c.referenti.length > 0 ? c.referenti : [""],
    telefono: c.telefono ?? "",
    indirizzo: c.indirizzo ?? "",
    cap: c.cap ?? "",
    citta: c.citta ?? "",
    provincia: c.provincia ?? "",
    note: c.note ?? "",
  };
}

function formPayload(form: CatForm) {
  const referenti = form.referenti.map((r) => r.trim()).filter(Boolean);
  const emails = form.emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
  return {
    ragioneSociale: form.ragioneSociale,
    emails,
    referenti,
    telefono: form.telefono || null,
    indirizzo: form.indirizzo || null,
    cap: form.cap || null,
    citta: form.citta || null,
    provincia: form.provincia || null,
    note: form.note || null,
  };
}

export function CatClient({ initialCat }: { initialCat: Cat[] }) {
  const [cat, setCat] = useState<Cat[]>(initialCat);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Cat | null>(null);
  const [form, setForm] = useState<CatForm>(EMPTY);
  const [loading, setLoading] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  async function fetchCat() {
    const res = await fetch("/api/cat");
    if (res.ok) setCat(await res.json());
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setDialogOpen(true);
  }

  function openEdit(c: Cat) {
    setEditing(c);
    setForm(catToForm(c));
    setDialogOpen(true);
  }

  function updateReferente(index: number, value: string) {
    setForm((f) => {
      const referenti = [...f.referenti];
      referenti[index] = value;
      return { ...f, referenti };
    });
  }

  function addReferente() {
    setForm((f) => ({ ...f, referenti: [...f.referenti, ""] }));
  }

  function removeReferente(index: number) {
    setForm((f) => ({
      ...f,
      referenti: f.referenti.length > 1 ? f.referenti.filter((_, i) => i !== index) : [""],
    }));
  }

  function updateEmail(index: number, value: string) {
    setForm((f) => {
      const emails = [...f.emails];
      emails[index] = value;
      return { ...f, emails };
    });
  }

  function addEmail() {
    setForm((f) => ({ ...f, emails: [...f.emails, ""] }));
  }

  function removeEmail(index: number) {
    setForm((f) => ({
      ...f,
      emails: f.emails.length > 1 ? f.emails.filter((_, i) => i !== index) : [""],
    }));
  }

  async function saveCat(e: React.FormEvent) {
    e.preventDefault();
    const payload = formPayload(form);
    if (payload.emails.length === 0) {
      toast.error("Inserisci almeno un'email");
      return;
    }
    setLoading(true);
    const res = await fetch(editing ? `/api/cat/${editing.id}` : "/api/cat", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    if (!res.ok) {
      toast.error(editing ? "Errore aggiornamento CAT" : "Errore creazione CAT");
      return;
    }
    toast.success(editing ? "CAT aggiornato" : "CAT creato");
    setDialogOpen(false);
    setEditing(null);
    setForm(EMPTY);
    fetchCat();
  }

  async function removeCat(c: Cat) {
    if (!confirm(`Eliminare il CAT "${c.ragioneSociale}"?`)) return;
    const res = await fetch(`/api/cat/${c.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Errore eliminazione");
      return;
    }
    toast.success("CAT eliminato");
    fetchCat();
  }

  async function importFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const toastId = toast.loading("Import CAT in corso...");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/cat/import", { method: "POST", body: fd });
    if (importRef.current) importRef.current.value = "";
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Errore import", { id: toastId });
      return;
    }
    toast.success(`${data.created} nuovi, ${data.updated} aggiornati, ${data.ko} scartati`, {
      id: toastId,
    });
    fetchCat();
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="h-6 w-6 text-orange-500" /> Centri Assistenza (CAT)
          </h1>
          <p className="text-sm text-gray-500 mt-1">{cat.length} CAT registrati</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => importRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" /> Importa XLSX
          </Button>
          <input
            ref={importRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={importFile}
          />
          <Button className="w-full sm:w-auto bg-orange-500 hover:bg-orange-600" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> Nuovo CAT
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Ragione sociale</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Contatti</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Città</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Pratiche</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cat.map((c) => (
                <tr key={c.id} className={c.active ? "" : "opacity-50"}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{c.ragioneSociale}</p>
                    {c.referenti.length > 0 && (
                      <p className="text-xs text-gray-500">{c.referenti.join(" · ")}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.emails.map((email) => (
                      <div key={email} className="flex items-center gap-1 text-xs">
                        <Mail className="h-3 w-3 text-gray-400" /> {email}
                      </div>
                    ))}
                    {c.telefono && (
                      <div className="flex items-center gap-1 text-xs mt-0.5">
                        <Phone className="h-3 w-3 text-gray-400" /> {c.telefono}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.citta}
                    {c.provincia ? ` (${c.provincia})` : ""}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                      {c._count.pratiche}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600"
                        onClick={() => removeCat(c)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {cat.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    Nessun CAT. Creane uno o importa un XLSX.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditing(null);
            setForm(EMPTY);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Modifica Centro Assistenza" : "Nuovo Centro Assistenza"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveCat} className="space-y-3 mt-2">
            <div className="space-y-1">
              <Label>Ragione sociale *</Label>
              <Input
                required
                value={form.ragioneSociale}
                onChange={(e) => setForm((f) => ({ ...f, ragioneSociale: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Email * (ricevono solleciti e prese in carico)</Label>
                <Button type="button" variant="outline" size="sm" onClick={addEmail}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Aggiungi
                </Button>
              </div>
              {form.emails.map((email, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    type="email"
                    required={i === 0}
                    placeholder="nome@dominio.it"
                    value={email}
                    onChange={(e) => updateEmail(i, e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => removeEmail(i)}
                    disabled={form.emails.length === 1 && !email}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Referenti</Label>
                <Button type="button" variant="outline" size="sm" onClick={addReferente}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Aggiungi
                </Button>
              </div>
              {form.referenti.map((ref, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    placeholder="Nome referente"
                    value={ref}
                    onChange={(e) => updateReferente(i, e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => removeReferente(i)}
                    disabled={form.referenti.length === 1 && !ref}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <Label>Telefono</Label>
              <Input
                value={form.telefono}
                onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <Label>Città</Label>
                <Input
                  value={form.citta}
                  onChange={(e) => setForm((f) => ({ ...f, citta: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Prov</Label>
                <Input
                  value={form.provincia}
                  onChange={(e) => setForm((f) => ({ ...f, provincia: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Note</Label>
              <Textarea
                rows={2}
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Annulla
              </Button>
              <Button
                type="submit"
                className="bg-orange-500 hover:bg-orange-600"
                disabled={loading}
              >
                {loading ? "Salvataggio..." : editing ? "Salva modifiche" : "Crea CAT"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
