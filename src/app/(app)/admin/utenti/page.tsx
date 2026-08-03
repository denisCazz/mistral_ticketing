"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, UserCog, CheckCircle, XCircle, Pencil, Trash2 } from "lucide-react";

interface Cat {
  id: string;
  ragioneSociale: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "OPERATORE" | "MANUTENTORE";
  active: boolean;
  createdAt: string;
  catId: string | null;
  cat?: Cat | null;
}

const ROLE_LABELS = { ADMIN: "Admin", OPERATORE: "Operatore", MANUTENTORE: "Manutentore" };
const ROLE_COLORS = {
  ADMIN: "bg-red-100 text-red-700",
  OPERATORE: "bg-blue-100 text-blue-700",
  MANUTENTORE: "bg-green-100 text-green-700",
};

export default function UtentiPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [catList, setCatList] = useState<Cat[]>([]);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "OPERATORE" as User["role"], catId: "" });
  const [editForm, setEditForm] = useState({ name: "", password: "", role: "OPERATORE" as User["role"], catId: "" });
  const [loading, setLoading] = useState(false);

  async function fetchUsers() {
    const res = await fetch("/api/utenti");
    if (res.ok) setUsers(await res.json());
  }

  useEffect(() => { fetchUsers(); }, []);

  useEffect(() => {
    fetch("/api/cat?list=1")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Cat[]) => setCatList(Array.isArray(data) ? data : []));
  }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/utenti", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, catId: form.catId || null }),
    });
    setLoading(false);
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error ?? "Errore creazione utente");
      return;
    }
    toast.success("Utente creato");
    setOpen(false);
    setForm({ name: "", email: "", password: "", role: "OPERATORE", catId: "" });
    fetchUsers();
  }

  async function toggleActive(user: User) {
    const res = await fetch(`/api/utenti/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !user.active }),
    });
    if (res.ok) {
      toast.success(user.active ? "Utente disattivato" : "Utente attivato");
      fetchUsers();
    }
  }

  async function removeUser(user: User) {
    if (!confirm(`Eliminare l'utente "${user.name}"?`)) return;
    const res = await fetch(`/api/utenti/${user.id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Errore eliminazione utente");
      return;
    }
    const data = await res.json();
    toast.success(
      data.softDeleted
        ? "Utente disattivato (collegato a pratiche)"
        : "Utente eliminato"
    );
    fetchUsers();
  }

  function openEdit(user: User) {
    setEditing(user);
    setEditForm({ name: user.name, password: "", role: user.role, catId: user.catId ?? "" });
    setEditOpen(true);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setLoading(true);
    const payload: Record<string, unknown> = {
      name: editForm.name,
      role: editForm.role,
      catId: editForm.catId || null,
    };
    if (editForm.password) payload.password = editForm.password;
    const res = await fetch(`/api/utenti/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    if (!res.ok) {
      toast.error("Errore aggiornamento utente");
      return;
    }
    toast.success("Utente aggiornato");
    setEditOpen(false);
    setEditing(null);
    fetchUsers();
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <UserCog className="h-6 w-6" /> Gestione utenti
          </h1>
          <p className="text-sm text-gray-500 mt-1">{users.length} utenti registrati</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <Button className="w-full sm:w-auto bg-orange-500 hover:bg-orange-600" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Nuovo utente
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crea nuovo utente</DialogTitle>
            </DialogHeader>
            <form onSubmit={createUser} className="space-y-4 mt-2">
              <div className="space-y-1">
                <Label>Nome completo</Label>
                <Input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Password</Label>
                <Input type="password" required minLength={6} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Ruolo</Label>
                <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as User["role"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="OPERATORE">Operatore</SelectItem>
                    <SelectItem value="MANUTENTORE">Manutentore</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>CAT collegato (opzionale)</Label>
                <Select
                  value={form.catId || "none"}
                  onValueChange={(v) => setForm((f) => ({ ...f, catId: v && v !== "none" ? v : "" }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Nessun CAT">
                      {form.catId ? catList.find((c) => c.id === form.catId)?.ragioneSociale : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nessun CAT</SelectItem>
                    {catList.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.ragioneSociale}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-400">Se collegato, l&apos;utente vedrà solo le pratiche di quel CAT.</p>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annulla</Button>
                <Button type="submit" className="bg-orange-500 hover:bg-orange-600" disabled={loading}>
                  {loading ? "Creazione..." : "Crea utente"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Modifica utente</DialogTitle>
            </DialogHeader>
            {editing && (
              <form onSubmit={saveEdit} className="space-y-4 mt-2">
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input value={editing.email} disabled />
                </div>
                <div className="space-y-1">
                  <Label>Nome completo</Label>
                  <Input required value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Nuova password (opzionale)</Label>
                  <Input type="password" minLength={6} value={editForm.password} onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Ruolo</Label>
                  <Select value={editForm.role} onValueChange={(v) => setEditForm((f) => ({ ...f, role: v as User["role"] }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                      <SelectItem value="OPERATORE">Operatore</SelectItem>
                      <SelectItem value="MANUTENTORE">Manutentore</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>CAT collegato (opzionale)</Label>
                  <Select
                    value={editForm.catId || "none"}
                    onValueChange={(v) => setEditForm((f) => ({ ...f, catId: v && v !== "none" ? v : "" }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Nessun CAT">
                        {editForm.catId ? catList.find((c) => c.id === editForm.catId)?.ragioneSociale : undefined}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nessun CAT</SelectItem>
                      {catList.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.ragioneSociale}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-400">Se collegato, l&apos;utente vedrà solo le pratiche di quel CAT.</p>
                </div>
                <div className="flex gap-3 justify-end pt-2">
                  <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Annulla</Button>
                  <Button type="submit" className="bg-orange-500 hover:bg-orange-600" disabled={loading}>
                    {loading ? "Salvataggio..." : "Salva modifiche"}
                  </Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Ruolo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">CAT</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Stato</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => (
                <tr key={u.id} className={u.active ? "" : "opacity-50"}>
                  <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[u.role]}`}>
                      {ROLE_LABELS[u.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {u.cat?.ragioneSociale ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {u.active ? (
                      <div className="flex items-center gap-1 text-green-600 text-xs">
                        <CheckCircle className="h-3.5 w-3.5" /> Attivo
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-gray-400 text-xs">
                        <XCircle className="h-3.5 w-3.5" /> Disattivato
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        onClick={() => toggleActive(u)}
                      >
                        {u.active ? "Disattiva" : "Riattiva"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600"
                        onClick={() => removeUser(u)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
