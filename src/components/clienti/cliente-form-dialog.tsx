"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ClienteForForm {
  id: string;
  ragioneSociale: string;
  cellulare: string | null;
  telFisso: string | null;
  email: string | null;
  indirizzo: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  note1?: string | null;
  note2?: string | null;
  note3?: string | null;
}

interface ClienteForm {
  ragioneSociale: string;
  cellulare: string;
  telFisso: string;
  email: string;
  indirizzo: string;
  cap: string;
  citta: string;
  provincia: string;
  note1: string;
  note2: string;
  note3: string;
}

const EMPTY: ClienteForm = {
  ragioneSociale: "",
  cellulare: "",
  telFisso: "",
  email: "",
  indirizzo: "",
  cap: "",
  citta: "",
  provincia: "",
  note1: "",
  note2: "",
  note3: "",
};

function clienteToForm(c: ClienteForForm): ClienteForm {
  return {
    ragioneSociale: c.ragioneSociale,
    cellulare: c.cellulare ?? "",
    telFisso: c.telFisso ?? "",
    email: c.email ?? "",
    indirizzo: c.indirizzo ?? "",
    cap: c.cap ?? "",
    citta: c.citta ?? "",
    provincia: c.provincia ?? "",
    note1: c.note1 ?? "",
    note2: c.note2 ?? "",
    note3: c.note3 ?? "",
  };
}

export function ClienteFormDialog({
  open,
  onOpenChange,
  cliente,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cliente: ClienteForForm | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ClienteForm>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(cliente ? clienteToForm(cliente) : EMPTY);
  }, [open, cliente]);

  async function saveCliente(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = cliente
      ? await fetch(`/api/clienti/${cliente.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })
      : await fetch("/api/clienti", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
    setSaving(false);
    if (!res.ok) {
      toast.error(cliente ? "Errore aggiornamento cliente" : "Errore creazione cliente");
      return;
    }
    toast.success(cliente ? "Cliente aggiornato" : "Cliente creato");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{cliente ? "Modifica cliente" : "Nuovo cliente"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={saveCliente} className="space-y-3 mt-2">
          <div className="space-y-1">
            <Label>Ragione sociale *</Label>
            <Input
              required
              value={form.ragioneSociale}
              onChange={(e) => setForm((f) => ({ ...f, ragioneSociale: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Cellulare</Label>
              <Input
                value={form.cellulare}
                onChange={(e) => setForm((f) => ({ ...f, cellulare: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Tel. fisso</Label>
              <Input
                value={form.telFisso}
                onChange={(e) => setForm((f) => ({ ...f, telFisso: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label>Indirizzo</Label>
            <Input
              value={form.indirizzo}
              onChange={(e) => setForm((f) => ({ ...f, indirizzo: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>CAP</Label>
              <Input
                value={form.cap}
                onChange={(e) => setForm((f) => ({ ...f, cap: e.target.value }))}
              />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>Città</Label>
              <Input
                value={form.citta}
                onChange={(e) => setForm((f) => ({ ...f, citta: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Provincia</Label>
            <Input
              value={form.provincia}
              onChange={(e) => setForm((f) => ({ ...f, provincia: e.target.value }))}
            />
          </div>
          {cliente && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Note 1</Label>
                <Textarea
                  value={form.note1}
                  onChange={(e) => setForm((f) => ({ ...f, note1: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Note 2</Label>
                <Textarea
                  value={form.note2}
                  onChange={(e) => setForm((f) => ({ ...f, note2: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Note 3</Label>
                <Textarea
                  value={form.note3}
                  onChange={(e) => setForm((f) => ({ ...f, note3: e.target.value }))}
                />
              </div>
            </div>
          )}
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button
              type="submit"
              className="bg-orange-500 hover:bg-orange-600"
              disabled={saving}
            >
              {saving ? "Salvataggio..." : cliente ? "Salva modifiche" : "Crea cliente"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
