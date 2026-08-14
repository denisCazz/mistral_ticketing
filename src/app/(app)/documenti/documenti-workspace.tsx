"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  Archive,
  Building2,
  CalendarClock,
  Car,
  ChevronRight,
  File,
  FileText,
  Folder,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  categorieForEntity,
  ENTITY_LABELS,
  type EntityTypeKey,
} from "@/lib/document-categories";
import {
  getCachedList,
  getCachedTree,
  invalidateDocumentiCache,
  setCachedList,
  setCachedTree,
} from "@/lib/documenti-cache";
import { cn } from "@/lib/utils";

type TreeNode = {
  key: string;
  label: string;
  count: number;
  entityType?: EntityTypeKey;
  categoria?: string;
  dipendenteId?: string;
  automezzoId?: string;
  children?: TreeNode[];
};

type Documento = {
  id: string;
  titoloOriginale: string;
  categoria: string;
  entityType: EntityTypeKey;
  mimeType: string;
  sizeBytes: number;
  dataScadenza: string | null;
  statoValidita: string;
  aiWhitelist: boolean;
  dipendente?: { nome: string; cognome: string } | null;
  automezzo?: { targa: string } | null;
};

type Dipendente = { id: string; nome: string; cognome: string };
type Automezzo = { id: string; targa: string; descrizione: string | null };

const SECTION_CONFIG = {
  AZIENDA: {
    label: "Azienda",
    description: "Documenti societari e sicurezza",
    icon: Building2,
  },
  DIPENDENTE: {
    label: "Dipendenti",
    description: "Formazione e documenti personali",
    icon: Users,
  },
  AUTOMEZZO: {
    label: "Automezzi",
    description: "Libretti e assicurazioni",
    icon: Car,
  },
} satisfies Record<
  EntityTypeKey,
  { label: string; description: string; icon: typeof Building2 }
>;

async function sha256Hex(file: File): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const checkboxClassName =
  "h-4 w-4 shrink-0 rounded border-gray-300 text-sky-700 accent-sky-700";

function statusStyle(status: string): string {
  if (status === "VALIDO") return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
  if (status === "SCADUTO") return "bg-red-50 text-red-700 ring-red-600/20";
  if (status === "ARCHIVIATO") return "bg-gray-100 text-gray-600 ring-gray-500/20";
  return "bg-amber-50 text-amber-700 ring-amber-600/20";
}

function entityLabel(documento: Documento): string {
  if (documento.dipendente) {
    return `${documento.dipendente.cognome} ${documento.dipendente.nome}`;
  }
  if (documento.automezzo) return documento.automezzo.targa;
  return ENTITY_LABELS[documento.entityType] ?? "Azienda";
}

const NEW_CATEGORY_VALUE = "__new_categoria__";
const NEW_DIPENDENTE_VALUE = "__new_dipendente__";
const NEW_AUTOMEZZO_VALUE = "__new_automezzo__";

function UploadDialog({
  open,
  onOpenChange,
  section,
  destination,
  categoriaPreset,
  knownCategories,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  section: EntityTypeKey | null;
  destination: TreeNode | null;
  categoriaPreset: string | null;
  knownCategories: Record<EntityTypeKey, string[]>;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Il dialog viene montato solo all'apertura: lo stato iniziale si calcola dalle props
  const initialType: EntityTypeKey = section ?? "AZIENDA";
  const [entityType, setEntityType] = useState<EntityTypeKey>(initialType);
  const [categoria, setCategoria] = useState(
    categoriaPreset ?? destination?.categoria ?? categorieForEntity(initialType)[0] ?? "ALTRO"
  );
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [creatingCategoria, setCreatingCategoria] = useState(false);
  const [nuovaCategoria, setNuovaCategoria] = useState("");
  const [dipendenteId, setDipendenteId] = useState(destination?.dipendenteId ?? "");
  const [automezzoId, setAutomezzoId] = useState(destination?.automezzoId ?? "");
  const [creatingDipendente, setCreatingDipendente] = useState(false);
  const [nuovoDipendente, setNuovoDipendente] = useState({ nome: "", cognome: "" });
  const [creatingAutomezzo, setCreatingAutomezzo] = useState(false);
  const [nuovoAutomezzo, setNuovoAutomezzo] = useState({ targa: "", descrizione: "" });
  const [creatingEntity, setCreatingEntity] = useState(false);
  const [dataScadenza, setDataScadenza] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dipendenti, setDipendenti] = useState<Dipendente[]>([]);
  const [automezzi, setAutomezzi] = useState<Automezzo[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/dipendenti").then((r) => (r.ok ? r.json() : { dipendenti: [] })),
      fetch("/api/automezzi").then((r) => (r.ok ? r.json() : { automezzi: [] })),
    ]).then(([dip, auto]) => {
      if (cancelled) return;
      setDipendenti(dip.dipendenti ?? []);
      setAutomezzi(auto.automezzi ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(() => {
    const base = categorieForEntity(entityType);
    const extras = [
      ...(knownCategories[entityType] ?? []),
      ...customCategories,
      categoria,
    ].filter(Boolean);
    const seen = new Set<string>(base);
    const merged = [...base];
    for (const item of extras) {
      const name = item.trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      merged.push(name);
    }
    return merged;
  }, [entityType, knownCategories, customCategories, categoria]);

  function resetEntityCreateForms() {
    setCreatingDipendente(false);
    setNuovoDipendente({ nome: "", cognome: "" });
    setCreatingAutomezzo(false);
    setNuovoAutomezzo({ targa: "", descrizione: "" });
  }

  function switchEntityType(type: EntityTypeKey) {
    setEntityType(type);
    setCategoria(categorieForEntity(type)[0] ?? "ALTRO");
    setCreatingCategoria(false);
    setNuovaCategoria("");
    setDipendenteId("");
    setAutomezzoId("");
    resetEntityCreateForms();
  }

  function confirmNuovaCategoria() {
    const name = nuovaCategoria.replace(/\s+/g, " ").trim().toUpperCase();
    if (!name) {
      toast.error("Inserisci il nome della categoria");
      return;
    }
    setCustomCategories((current) =>
      current.includes(name) ? current : [...current, name]
    );
    setCategoria(name);
    setCreatingCategoria(false);
    setNuovaCategoria("");
  }

  async function createDipendenteInline() {
    const nome = nuovoDipendente.nome.trim();
    const cognome = nuovoDipendente.cognome.trim();
    if (!nome || !cognome) {
      toast.error("Nome e cognome obbligatori");
      return;
    }
    setCreatingEntity(true);
    try {
      const res = await fetch("/api/dipendenti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, cognome }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Creazione dipendente fallita");
      const created = body.dipendente as Dipendente;
      setDipendenti((current) =>
        current.some((item) => item.id === created.id)
          ? current
          : [...current, created].sort((a, b) =>
              `${a.cognome} ${a.nome}`.localeCompare(`${b.cognome} ${b.nome}`, "it")
            )
      );
      setDipendenteId(created.id);
      setCreatingDipendente(false);
      setNuovoDipendente({ nome: "", cognome: "" });
      if (body.credenziali) {
        toast.success(
          `Dipendente creato. Login: ${body.credenziali.utente} / ${body.credenziali.password}`
        );
      } else {
        toast.success(`Dipendente ${created.cognome} ${created.nome} pronto`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Creazione fallita");
    } finally {
      setCreatingEntity(false);
    }
  }

  async function createAutomezzoInline() {
    const targa = nuovoAutomezzo.targa.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    if (!targa) {
      toast.error("Targa obbligatoria");
      return;
    }
    setCreatingEntity(true);
    try {
      const res = await fetch("/api/automezzi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targa,
          descrizione: nuovoAutomezzo.descrizione.trim() || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Creazione automezzo fallita");
      const created = body.automezzo as Automezzo;
      setAutomezzi((current) =>
        current.some((item) => item.id === created.id)
          ? current
          : [...current, created].sort((a, b) => a.targa.localeCompare(b.targa, "it"))
      );
      setAutomezzoId(created.id);
      setCreatingAutomezzo(false);
      setNuovoAutomezzo({ targa: "", descrizione: "" });
      toast.success(`Automezzo ${created.targa} creato`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Creazione fallita");
    } finally {
      setCreatingEntity(false);
    }
  }

  function addFiles(incoming: FileList | File[]) {
    const next = Array.from(incoming);
    setFiles((current) => {
      const seen = new Set(current.map((f) => `${f.name}:${f.size}`));
      return [...current, ...next.filter((f) => !seen.has(`${f.name}:${f.size}`))];
    });
  }

  async function uploadOne(file: File) {
    const hash = await sha256Hex(file);
    const extension = file.name.includes(".")
      ? file.name.split(".").pop()!.toLowerCase()
      : "bin";
    const entityId = (
      entityType === "DIPENDENTE"
        ? dipendenteId
        : entityType === "AUTOMEZZO"
          ? automezzoId
          : categoria.toLowerCase().replace(/\s+/g, "-")
    )
      .replace(/[^a-z0-9_-]/gi, "")
      .slice(0, 100);

    const presign = await fetch("/api/files/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity: `docs/${entityType.toLowerCase()}`,
        entityId,
        mimeType: file.type || "application/octet-stream",
        ext: extension,
      }),
    });
    const presignBody = await presign.json();
    if (!presign.ok) throw new Error(presignBody.error ?? "Preparazione upload fallita");

    const uploaded = await fetch(presignBody.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!uploaded.ok) throw new Error(`Caricamento fallito: ${file.name}`);

    const created = await fetch("/api/documenti", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storageKey: presignBody.key,
        sha256: hash,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        titoloOriginale: file.name,
        categoria,
        entityType,
        dipendenteId: entityType === "DIPENDENTE" ? dipendenteId : null,
        automezzoId: entityType === "AUTOMEZZO" ? automezzoId : null,
        dataScadenza: dataScadenza || null,
      }),
    });
    const createdBody = await created.json();
    if (!created.ok) throw new Error(createdBody.error ?? `Registrazione fallita: ${file.name}`);
  }

  async function startUpload() {
    if (!files.length) return toast.error("Seleziona almeno un file");
    if (creatingCategoria) {
      return toast.error("Conferma o annulla la nuova categoria");
    }
    if (creatingDipendente) {
      return toast.error("Crea o annulla il nuovo dipendente");
    }
    if (creatingAutomezzo) {
      return toast.error("Crea o annulla il nuovo automezzo");
    }
    if (!categoria.trim()) {
      return toast.error("Seleziona o crea una categoria");
    }
    if (entityType === "DIPENDENTE" && !dipendenteId) {
      return toast.error("Seleziona o crea un dipendente");
    }
    if (entityType === "AUTOMEZZO" && !automezzoId) {
      return toast.error("Seleziona o crea un automezzo");
    }

    setUploading(true);
    let completed = 0;
    const errors: string[] = [];
    for (const file of files) {
      try {
        await uploadOne(file);
        completed += 1;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : file.name);
      }
      setProgress(completed + errors.length);
    }

    setUploading(false);
    if (completed) {
      toast.success(
        completed === 1 ? "Documento caricato" : `${completed} documenti caricati`
      );
      onUploaded();
    }
    if (errors.length) toast.error(`${errors.length} file non caricati`);
    if (!errors.length) onOpenChange(false);
  }

  const busy = uploading || creatingEntity;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Carica documenti</DialogTitle>
          <DialogDescription>
            Scegli o crea destinazione e categoria. Puoi caricare più file insieme.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Archivio</Label>
            <select
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              value={entityType}
              disabled={busy}
              onChange={(event) => switchEntityType(event.target.value as EntityTypeKey)}
            >
              {(Object.keys(ENTITY_LABELS) as EntityTypeKey[]).map((key) => (
                <option key={key} value={key}>
                  {ENTITY_LABELS[key]}
                </option>
              ))}
            </select>
          </div>

          {entityType === "DIPENDENTE" ? (
            <div className="space-y-1.5">
              <Label>Dipendente</Label>
              <select
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                value={creatingDipendente ? NEW_DIPENDENTE_VALUE : dipendenteId}
                disabled={busy}
                onChange={(event) => {
                  if (event.target.value === NEW_DIPENDENTE_VALUE) {
                    setCreatingDipendente(true);
                    setDipendenteId("");
                    return;
                  }
                  setCreatingDipendente(false);
                  setDipendenteId(event.target.value);
                }}
              >
                <option value="">Seleziona dipendente…</option>
                {dipendenti.map((dipendente) => (
                  <option key={dipendente.id} value={dipendente.id}>
                    {dipendente.cognome} {dipendente.nome}
                  </option>
                ))}
                <option value={NEW_DIPENDENTE_VALUE}>＋ Nuovo dipendente…</option>
              </select>
            </div>
          ) : entityType === "AUTOMEZZO" ? (
            <div className="space-y-1.5">
              <Label>Automezzo</Label>
              <select
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                value={creatingAutomezzo ? NEW_AUTOMEZZO_VALUE : automezzoId}
                disabled={busy}
                onChange={(event) => {
                  if (event.target.value === NEW_AUTOMEZZO_VALUE) {
                    setCreatingAutomezzo(true);
                    setAutomezzoId("");
                    return;
                  }
                  setCreatingAutomezzo(false);
                  setAutomezzoId(event.target.value);
                }}
              >
                <option value="">Seleziona automezzo…</option>
                {automezzi.map((automezzo) => (
                  <option key={automezzo.id} value={automezzo.id}>
                    {automezzo.targa}
                    {automezzo.descrizione ? ` — ${automezzo.descrizione}` : ""}
                  </option>
                ))}
                <option value={NEW_AUTOMEZZO_VALUE}>＋ Nuovo automezzo…</option>
              </select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Destinazione</Label>
              <div className="flex h-10 items-center rounded-lg border bg-gray-50 px-3 text-sm">
                Archivio aziendale
              </div>
            </div>
          )}

          {creatingDipendente && (
            <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/50 p-3 sm:col-span-2">
              <p className="text-sm font-medium text-sky-900">Nuovo dipendente</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="upload-cognome">Cognome</Label>
                  <Input
                    id="upload-cognome"
                    value={nuovoDipendente.cognome}
                    disabled={busy}
                    onChange={(event) =>
                      setNuovoDipendente((current) => ({
                        ...current,
                        cognome: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="upload-nome">Nome</Label>
                  <Input
                    id="upload-nome"
                    value={nuovoDipendente.nome}
                    disabled={busy}
                    onChange={(event) =>
                      setNuovoDipendente((current) => ({
                        ...current,
                        nome: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={createDipendenteInline}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Crea dipendente
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setCreatingDipendente(false);
                    setNuovoDipendente({ nome: "", cognome: "" });
                  }}
                >
                  Annulla
                </Button>
              </div>
            </div>
          )}

          {creatingAutomezzo && (
            <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/50 p-3 sm:col-span-2">
              <p className="text-sm font-medium text-sky-900">Nuovo automezzo</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="upload-targa">Targa</Label>
                  <Input
                    id="upload-targa"
                    value={nuovoAutomezzo.targa}
                    disabled={busy}
                    onChange={(event) =>
                      setNuovoAutomezzo((current) => ({
                        ...current,
                        targa: event.target.value.toUpperCase(),
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="upload-descrizione">Descrizione (opzionale)</Label>
                  <Input
                    id="upload-descrizione"
                    value={nuovoAutomezzo.descrizione}
                    disabled={busy}
                    onChange={(event) =>
                      setNuovoAutomezzo((current) => ({
                        ...current,
                        descrizione: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={createAutomezzoInline}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Crea automezzo
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setCreatingAutomezzo(false);
                    setNuovoAutomezzo({ targa: "", descrizione: "" });
                  }}
                >
                  Annulla
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <select
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              value={creatingCategoria ? NEW_CATEGORY_VALUE : categoria}
              disabled={busy}
              onChange={(event) => {
                if (event.target.value === NEW_CATEGORY_VALUE) {
                  setCreatingCategoria(true);
                  setNuovaCategoria("");
                  return;
                }
                setCreatingCategoria(false);
                setCategoria(event.target.value);
              }}
            >
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
              <option value={NEW_CATEGORY_VALUE}>＋ Nuova categoria…</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Scadenza comune (opzionale)</Label>
            <Input
              type="date"
              value={dataScadenza}
              disabled={busy}
              onChange={(event) => setDataScadenza(event.target.value)}
            />
          </div>

          {creatingCategoria && (
            <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/50 p-3 sm:col-span-2">
              <p className="text-sm font-medium text-sky-900">Nuova categoria</p>
              <div className="space-y-1.5">
                <Label htmlFor="upload-categoria">Nome categoria</Label>
                <Input
                  id="upload-categoria"
                  placeholder="es. TERMICO, VISITE MEDICHE…"
                  value={nuovaCategoria}
                  disabled={busy}
                  onChange={(event) => setNuovaCategoria(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      confirmNuovaCategoria();
                    }
                  }}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={confirmNuovaCategoria}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Usa questa categoria
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setCreatingCategoria(false);
                    setNuovaCategoria("");
                  }}
                >
                  Annulla
                </Button>
              </div>
            </div>
          )}
        </div>

        <div
          className={cn(
            "rounded-xl border-2 border-dashed p-6 text-center transition-colors",
            dragging ? "border-sky-500 bg-sky-50" : "border-gray-200 bg-gray-50/60"
          )}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            addFiles(event.dataTransfer.files);
          }}
        >
          <Upload className="mx-auto mb-2 h-7 w-7 text-sky-700" />
          <p className="font-medium">Trascina qui i documenti</p>
          <p className="mb-3 text-xs text-gray-500">oppure selezionali dal computer</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => event.target.files && addFiles(event.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            Scegli file
          </Button>
        </div>

        {files.length > 0 && (
          <div className="max-h-32 space-y-1 overflow-y-auto">
            {files.map((file) => (
              <div
                key={`${file.name}:${file.size}`}
                className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm"
              >
                <FileText className="h-4 w-4 shrink-0 text-gray-500" />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="text-xs text-gray-400">{formatSize(file.size)}</span>
                {!busy && (
                  <button
                    type="button"
                    aria-label={`Rimuovi ${file.name}`}
                    onClick={() =>
                      setFiles((current) => current.filter((item) => item !== file))
                    }
                  >
                    <X className="h-4 w-4 text-gray-400 hover:text-red-600" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button disabled={busy || files.length === 0} onClick={startUpload}>
            {uploading
              ? `Caricamento ${progress}/${files.length}…`
              : `Carica${files.length > 1 ? ` ${files.length} file` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function isEntityType(value: string | null): value is EntityTypeKey {
  return value === "AZIENDA" || value === "DIPENDENTE" || value === "AUTOMEZZO";
}

function collectCategoriesFromTree(tree: TreeNode[]): Record<EntityTypeKey, string[]> {
  const result: Record<EntityTypeKey, string[]> = {
    AZIENDA: [],
    DIPENDENTE: [],
    AUTOMEZZO: [],
  };
  const seen: Record<EntityTypeKey, Set<string>> = {
    AZIENDA: new Set(),
    DIPENDENTE: new Set(),
    AUTOMEZZO: new Set(),
  };

  function walk(nodes: TreeNode[], entityType?: EntityTypeKey) {
    for (const node of nodes) {
      const type = node.entityType ?? entityType;
      if (type && node.categoria && !seen[type].has(node.categoria)) {
        seen[type].add(node.categoria);
        result[type].push(node.categoria);
      }
      if (node.children?.length) walk(node.children, type);
    }
  }

  walk(tree);
  return result;
}

function findDestination(
  tree: TreeNode[],
  section: EntityTypeKey | null,
  dipendenteId: string | null,
  automezzoId: string | null
): TreeNode | null {
  if (!section || section === "AZIENDA") return null;
  const root = tree.find((node) => node.entityType === section);
  if (!root?.children) return null;
  if (dipendenteId) {
    return root.children.find((node) => node.dipendenteId === dipendenteId) ?? null;
  }
  if (automezzoId) {
    return root.children.find((node) => node.automezzoId === automezzoId) ?? null;
  }
  return null;
}

export default function DocumentiWorkspace() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialDestination = useRef({
    dipendenteId: searchParams.get("dipendenteId"),
    automezzoId: searchParams.get("automezzoId"),
  });
  const initialDestinationResolved = useRef(
    !searchParams.get("dipendenteId") && !searchParams.get("automezzoId")
  );

  const [tree, setTree] = useState<TreeNode[]>([]);
  const [total, setTotal] = useState(0);
  const [documents, setDocuments] = useState<Documento[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [section, setSection] = useState<EntityTypeKey | null>(() => {
    const value = searchParams.get("section");
    return isEntityType(value) ? value : null;
  });
  const [destination, setDestination] = useState<TreeNode | null>(null);
  const [category, setCategory] = useState<string | null>(
    () => searchParams.get("categoria")
  );
  const [navigationSearch, setNavigationSearch] = useState("");
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(
    () => searchParams.get("q") ?? ""
  );
  const [status, setStatus] = useState(() => searchParams.get("stato") ?? "");
  const [expiry, setExpiry] = useState(() => searchParams.get("scadenza") ?? "");
  const [loading, setLoading] = useState(false);
  const [treeLoading, setTreeLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    ids: string[];
    label: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);

  const knownCategories = useMemo(() => collectCategoriesFromTree(tree), [tree]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  // Keep URL in sync so "indietro" ripristina categoria/destinazione
  useEffect(() => {
    if (!initialDestinationResolved.current) return;
    const params = new URLSearchParams();
    if (section) params.set("section", section);
    if (category) params.set("categoria", category);
    if (destination?.dipendenteId) params.set("dipendenteId", destination.dipendenteId);
    if (destination?.automezzoId) params.set("automezzoId", destination.automezzoId);
    if (status) params.set("stato", status);
    if (expiry) params.set("scadenza", expiry);
    if (debouncedSearch) params.set("q", debouncedSearch);
    const next = params.toString();
    const current = searchParams.toString();
    if (next !== current) {
      router.replace(next ? `/documenti?${next}` : "/documenti", { scroll: false });
    }
  }, [
    section,
    category,
    destination,
    status,
    expiry,
    debouncedSearch,
    router,
    searchParams,
  ]);

  const returnQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (section) params.set("section", section);
    if (category) params.set("categoria", category);
    if (destination?.dipendenteId) params.set("dipendenteId", destination.dipendenteId);
    if (destination?.automezzoId) params.set("automezzoId", destination.automezzoId);
    if (status) params.set("stato", status);
    if (expiry) params.set("scadenza", expiry);
    if (debouncedSearch) params.set("q", debouncedSearch);
    return params.toString();
  }, [section, category, destination, status, expiry, debouncedSearch]);

  const hasDocumentScope = Boolean(
    debouncedSearch ||
      status ||
      expiry ||
      (section === "AZIENDA" && category) ||
      (section === "DIPENDENTE" && (destination || category)) ||
      (section === "AUTOMEZZO" && (destination || category))
  );

  const [refreshKey, setRefreshKey] = useState(0);
  const [prevRefreshKey, setPrevRefreshKey] = useState(refreshKey);
  if (prevRefreshKey !== refreshKey) {
    setPrevRefreshKey(refreshKey);
    setTreeLoading(true);
    setLoading(true);
  }

  useEffect(() => {
    let cancelled = false;
    const force = refreshKey > 0;
    if (!force) {
      const cached = getCachedTree<{ tree: TreeNode[]; total: number }>();
      if (cached) {
        queueMicrotask(() => {
          if (cancelled) return;
          setTree(cached.tree);
          setTotal(cached.total);
          setTreeLoading(false);
        });
        return () => {
          cancelled = true;
        };
      }
    }
    fetch("/api/documenti/albero")
      .then(async (response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (cancelled || !body) return;
        const next = { tree: (body.tree ?? []) as TreeNode[], total: body.total ?? 0 };
        setTree(next.tree);
        setTotal(next.total);
        setCachedTree(next);
      })
      .finally(() => {
        if (!cancelled) setTreeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  // Resolve the initial URL once. Later URL changes are produced by local navigation.
  useEffect(() => {
    if (treeLoading || initialDestinationResolved.current) return;
    const found = findDestination(
      tree,
      section,
      initialDestination.current.dipendenteId,
      initialDestination.current.automezzoId
    );
    queueMicrotask(() => {
      setDestination((current) => (found?.key === current?.key ? current : found));
      initialDestinationResolved.current = true;
    });
  }, [tree, treeLoading, section]);

  useEffect(() => {
    let cancelled = false;
    const currentRequest = ++requestId.current;
    const force = refreshKey > 0;

    if (!hasDocumentScope) {
      queueMicrotask(() => {
        if (cancelled || currentRequest !== requestId.current) return;
        setDocuments([]);
        setListTotal(0);
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    const params = new URLSearchParams({ limit: "100" });
    if (section) params.set("entityType", section);
    if (destination?.dipendenteId) params.set("dipendenteId", destination.dipendenteId);
    if (destination?.automezzoId) params.set("automezzoId", destination.automezzoId);
    if (category) params.set("categoria", category);
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (status) params.set("statoValidita", status);
    if (expiry) params.set("scadenza", expiry);
    const queryKey = params.toString();

    if (!force) {
      const cached = getCachedList<{ documenti: Documento[]; total: number }>(queryKey);
      if (cached) {
        queueMicrotask(() => {
          if (cancelled || currentRequest !== requestId.current) return;
          setDocuments(cached.documenti);
          setListTotal(cached.total);
          setLoading(false);
        });
        return () => {
          cancelled = true;
        };
      }
    }

    fetch(`/api/documenti?${queryKey}`)
      .then((response) => response.json())
      .then((body) => {
        if (cancelled || currentRequest !== requestId.current) return;
        const next = {
          documenti: (body.documenti ?? []) as Documento[],
          total: body.total ?? 0,
        };
        setDocuments(next.documenti);
        setListTotal(next.total);
        setCachedList(queryKey, next);
      })
      .finally(() => {
        if (!cancelled && currentRequest === requestId.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hasDocumentScope, section, destination, category, debouncedSearch, status, expiry, refreshKey]);

  const activeRoot = tree.find((node) => node.entityType === section) ?? null;
  const navigationItems = activeRoot?.children ?? [];
  const filteredNavigation = navigationItems.filter((node) =>
    node.label.toLocaleLowerCase("it").includes(navigationSearch.toLocaleLowerCase("it"))
  );
  const categories =
    section === "AZIENDA" ? navigationItems : destination?.children ?? [];

  const title =
    category ??
    destination?.label ??
    (section ? SECTION_CONFIG[section].label : "Archivio documenti");

  function chooseSection(next: EntityTypeKey | null) {
    setSection(next);
    setDestination(null);
    setCategory(null);
    setNavigationSearch("");
    setDocuments([]);
    setListTotal(0);
  }

  function chooseNavigation(node: TreeNode) {
    if (section === "AZIENDA") {
      setCategory(node.categoria ?? node.label);
      setDestination(null);
    } else {
      setDestination(node);
      const hasLinkedEntity = Boolean(node.dipendenteId || node.automezzoId);
      setCategory(hasLinkedEntity ? null : (node.categoria ?? null));
    }
  }

  function refresh() {
    invalidateDocumentiCache();
    setRefreshKey((k) => k + 1);
  }

  const selectedCount = selectedIds.size;
  const allVisibleSelected =
    documents.length > 0 && documents.every((doc) => selectedIds.has(doc.id));
  const someVisibleSelected = documents.some((doc) => selectedIds.has(doc.id));

  useEffect(() => {
    const visible = new Set(documents.map((doc) => doc.id));
    setSelectedIds((current) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of current) {
        if (visible.has(id)) next.add(id);
        else changed = true;
      }
      if (!changed && next.size === current.size) return current;
      return next;
    });
  }, [documents]);

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
  }, [someVisibleSelected, allVisibleSelected]);

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(documents.map((doc) => doc.id)));
  }

  async function confirmDelete() {
    if (!pendingDelete || pendingDelete.ids.length === 0) return;
    setDeleting(true);
    const ids = pendingDelete.ids;
    const res =
      ids.length === 1
        ? await fetch(`/api/documenti/${ids[0]}`, { method: "DELETE" })
        : await fetch("/api/documenti", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids }),
          });
    setDeleting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(
        typeof data.error === "string" ? data.error : "Eliminazione non riuscita"
      );
      return;
    }
    const data = await res.json().catch(() => ({}));
    const deleted =
      typeof data.deleted === "number" ? data.deleted : ids.length;
    toast.success(
      deleted === 1 ? "Documento eliminato" : `${deleted} documenti eliminati`
    );
    setPendingDelete(null);
    setSelectedIds(new Set());
    refresh();
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Archivio documenti</h1>
          <p className="mt-1 text-sm text-gray-500">
            Trova, controlla e carica i documenti aziendali in un unico posto.
          </p>
        </div>
        {isAdmin && (
          <Button size="lg" onClick={() => setUploadOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Carica documenti
          </Button>
        )}
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => chooseSection(null)}
          className={cn(
            "rounded-xl border bg-white p-4 text-left transition hover:border-sky-300 hover:shadow-sm",
            section === null && "border-sky-500 ring-2 ring-sky-100"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="rounded-lg bg-sky-50 p-2 text-sky-700">
              <Archive className="h-5 w-5" />
            </span>
            <span className="text-xl font-bold tabular-nums">
              {treeLoading ? "…" : total}
            </span>
          </div>
          <p className="mt-3 font-semibold">Documenti totali</p>
          <p className="hidden text-xs text-gray-500 sm:block">
            Tutti i file in archivio
          </p>
        </button>

        {(Object.keys(SECTION_CONFIG) as EntityTypeKey[]).map((key) => {
          const config = SECTION_CONFIG[key];
          const Icon = config.icon;
          const count = tree.find((node) => node.entityType === key)?.count ?? 0;
          return (
            <button
              type="button"
              key={key}
              onClick={() => chooseSection(key)}
              className={cn(
                "rounded-xl border bg-white p-4 text-left transition hover:border-sky-300 hover:shadow-sm",
                section === key && "border-sky-500 ring-2 ring-sky-100"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="rounded-lg bg-gray-100 p-2 text-gray-700">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-xl font-bold tabular-nums">{count}</span>
              </div>
              <p className="mt-3 font-semibold">{config.label}</p>
              <p className="hidden truncate text-xs text-gray-500 sm:block">
                {config.description}
              </p>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border bg-white p-3 sm:p-4">
        <div className="flex flex-col gap-2 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              className="pl-9"
              placeholder="Cerca per titolo, categoria o percorso…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <select
            aria-label="Filtra per stato"
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">Tutti gli stati</option>
            <option value="VALIDO">Validi</option>
            <option value="DA_REVISIONARE">Da revisionare</option>
            <option value="SCADUTO">Scaduti</option>
            <option value="ARCHIVIATO">Archiviati</option>
          </select>
          <select
            aria-label="Filtra per scadenza"
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
            value={expiry}
            onChange={(event) => setExpiry(event.target.value)}
          >
            <option value="">Tutte le scadenze</option>
            <option value="presenti">Con scadenza</option>
            <option value="mancanti">Da classificare</option>
            <option value="non-serve">Non serve scadenza</option>
          </select>
        </div>
      </div>

      <div
        className={cn(
          "grid gap-4",
          section ? "lg:grid-cols-[280px_minmax(0,1fr)]" : "grid-cols-1"
        )}
      >
        {section && (
          <aside className="self-start overflow-hidden rounded-xl border bg-white lg:sticky lg:top-6">
            <div className="border-b px-4 py-3">
              <p className="font-semibold">
                {section === "AZIENDA"
                  ? "Categorie"
                  : section === "DIPENDENTE"
                    ? "Dipendenti"
                    : "Automezzi"}
              </p>
              <p className="text-xs text-gray-500">
                {section === "AZIENDA"
                  ? "Apri una categoria per vedere i file"
                  : "Seleziona per filtrare i documenti"}
              </p>
            </div>
            {section !== "AZIENDA" && (
              <div className="border-b p-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    className="pl-9"
                    placeholder={section === "DIPENDENTE" ? "Cerca dipendente…" : "Cerca targa…"}
                    value={navigationSearch}
                    onChange={(event) => setNavigationSearch(event.target.value)}
                  />
                </div>
              </div>
            )}
            <div className="max-h-64 overflow-y-auto p-2 lg:max-h-[55vh]">
              <button
                type="button"
                onClick={() => {
                  setDestination(null);
                  setCategory(null);
                  setDocuments([]);
                  setListTotal(0);
                }}
                className={cn(
                  "mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50",
                  !destination && !category && "bg-sky-50 font-medium text-sky-800"
                )}
              >
                <Folder className="h-4 w-4" />
                <span className="flex-1">
                  {section === "AZIENDA" ? "Scegli categoria…" : "Scegli…"}
                </span>
                <span className="text-xs text-gray-400">{activeRoot?.count ?? 0}</span>
              </button>
              {filteredNavigation.map((node) => {
                const selected =
                  section === "AZIENDA" ? category === node.categoria : destination?.key === node.key;
                return (
                  <button
                    type="button"
                    key={node.key}
                    onClick={() => chooseNavigation(node)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50",
                      selected && "bg-sky-50 font-medium text-sky-800"
                    )}
                  >
                    {section === "DIPENDENTE" ? (
                      <UserRound className="h-4 w-4 shrink-0 text-gray-400" />
                    ) : (
                      <Folder className="h-4 w-4 shrink-0 text-gray-400" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{node.label}</span>
                    <span className="text-xs text-gray-400">{node.count}</span>
                  </button>
                );
              })}
            </div>
          </aside>
        )}

        <main className="min-w-0 overflow-hidden rounded-xl border bg-white">
          <div className="space-y-3 border-b p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold">{title}</h2>
                <p className="text-sm text-gray-500">
                  {hasDocumentScope
                    ? `${listTotal} ${listTotal === 1 ? "documento" : "documenti"}`
                    : section
                      ? "Seleziona una voce a sinistra per caricare l’elenco"
                      : "Cerca qui sopra oppure scegli un archivio"}
                </p>
              </div>
              {isAdmin && section && (
                <Button variant="outline" onClick={() => setUploadOpen(true)}>
                  <Upload className="mr-2 h-4 w-4" />
                  Carica qui
                </Button>
              )}
            </div>

            {categories.length > 0 && section !== "AZIENDA" && destination && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setCategory(null)}
                  className={cn(
                    "whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium",
                    category === null
                      ? "border-sky-600 bg-sky-50 text-sky-800"
                      : "text-gray-600 hover:bg-gray-50"
                  )}
                >
                  Tutte
                </button>
                {categories.map((node) => (
                  <button
                    type="button"
                    key={node.key}
                    onClick={() => setCategory(node.categoria ?? node.label)}
                    className={cn(
                      "whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium",
                      category === node.categoria
                        ? "border-sky-600 bg-sky-50 text-sky-800"
                        : "text-gray-600 hover:bg-gray-50"
                    )}
                  >
                    {node.label} · {node.count}
                  </button>
                ))}
              </div>
            )}
          </div>

          {!hasDocumentScope ? (
            <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
              <span className="mb-3 rounded-full bg-sky-50 p-3 text-sky-700">
                <Search className="h-6 w-6" />
              </span>
              <p className="font-medium">
                {section ? "Nessuna selezione attiva" : "Cerca un documento"}
              </p>
              <p className="mt-1 max-w-sm text-sm text-gray-500">
                {section === "AZIENDA"
                  ? "Scegli una categoria (es. CCIAA, DURC) per vedere solo quei documenti."
                  : section === "DIPENDENTE"
                    ? "Seleziona un dipendente, poi eventualmente una categoria."
                    : section === "AUTOMEZZO"
                      ? "Seleziona un automezzo per vedere libretti e assicurazioni."
                      : "Usa la barra di ricerca e i filtri, oppure apri Azienda, Dipendenti o Automezzi."}
              </p>
            </div>
          ) : loading ? (
            <div className="flex min-h-72 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-700 border-t-transparent" />
            </div>
          ) : documents.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
              <span className="mb-3 rounded-full bg-gray-100 p-3">
                <File className="h-6 w-6 text-gray-500" />
              </span>
              <p className="font-medium">Nessun documento trovato</p>
              <p className="mt-1 max-w-sm text-sm text-gray-500">
                Modifica i filtri oppure carica un documento in questa sezione.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              <div className="flex flex-wrap items-center gap-2 px-3 py-2 sm:px-5">
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    className={checkboxClassName}
                    checked={allVisibleSelected}
                    onChange={toggleSelectAll}
                    aria-label="Seleziona tutti i documenti visibili"
                  />
                  <span className="hidden sm:inline">Seleziona tutti</span>
                </label>
                {selectedCount > 0 && (
                  <>
                    <span className="text-sm font-medium text-gray-800">
                      {selectedCount}{" "}
                      {selectedCount === 1 ? "selezionato" : "selezionati"}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedIds(new Set())}
                    >
                      Annulla
                    </Button>
                    {isAdmin && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() =>
                          setPendingDelete({
                            ids: [...selectedIds],
                            label:
                              selectedCount === 1
                                ? `“${
                                    documents.find((doc) => selectedIds.has(doc.id))
                                      ?.titoloOriginale ?? "documento"
                                  }”`
                                : `${selectedCount} documenti`,
                          })
                        }
                      >
                        <Trash2 />
                        Elimina
                      </Button>
                    )}
                  </>
                )}
              </div>
              {documents.map((documento) => {
                const href = returnQuery
                  ? `/documenti/${documento.id}?return=${encodeURIComponent(returnQuery)}`
                  : `/documenti/${documento.id}`;
                const checked = selectedIds.has(documento.id);
                return (
                  <div
                    key={documento.id}
                    className={cn(
                      "group flex items-center gap-2 px-3 py-3 transition hover:bg-gray-50 sm:px-5 sm:gap-3",
                      checked && "bg-sky-50 hover:bg-sky-50"
                    )}
                  >
                    <input
                      type="checkbox"
                      className={checkboxClassName}
                      checked={checked}
                      onChange={() => toggleSelected(documento.id)}
                      aria-label={`Seleziona ${documento.titoloOriginale}`}
                    />
                    <Link
                      href={href}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      <span className="rounded-lg bg-sky-50 p-2.5 text-sky-700">
                        <FileText className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-gray-900 group-hover:text-sky-800">
                          {documento.titoloOriginale}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                          <span>{entityLabel(documento)}</span>
                          <span>{documento.categoria}</span>
                          <span>{formatSize(documento.sizeBytes)}</span>
                          {documento.dataScadenza && (
                            <span className="flex items-center gap-1">
                              <CalendarClock className="h-3.5 w-3.5" />
                              {new Date(documento.dataScadenza).toLocaleDateString("it-IT")}
                            </span>
                          )}
                          {documento.aiWhitelist && (
                            <span className="flex items-center gap-1 text-violet-600">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              AI
                            </span>
                          )}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "hidden rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset sm:inline-flex",
                          statusStyle(documento.statoValidita)
                        )}
                      >
                        {documento.statoValidita.replaceAll("_", " ")}
                      </span>
                    </Link>
                    {isAdmin && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Elimina ${documento.titoloOriginale}`}
                        title="Elimina documento"
                        className="shrink-0 text-gray-400 hover:bg-red-50 hover:text-red-700"
                        onClick={() =>
                          setPendingDelete({
                            ids: [documento.id],
                            label: `“${documento.titoloOriginale}”`,
                          })
                        }
                      >
                        <Trash2 />
                      </Button>
                    )}
                    <Link
                      href={href}
                      tabIndex={-1}
                      aria-hidden
                      className="flex shrink-0 items-center"
                    >
                      <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-sky-600" />
                    </Link>
                  </div>
                );
              })}
              {listTotal > documents.length && (
                <div className="px-4 py-3 text-center text-xs text-gray-500">
                  Mostrati i primi {documents.length} di {listTotal} documenti
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {isAdmin && uploadOpen && (
        <UploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          section={section}
          destination={destination}
          categoriaPreset={category}
          knownCategories={knownCategories}
          onUploaded={refresh}
        />
      )}

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
      >
        <DialogContent showCloseButton={!deleting}>
          <DialogHeader>
            <DialogTitle>
              {pendingDelete && pendingDelete.ids.length > 1
                ? "Eliminare i documenti selezionati?"
                : "Eliminare il documento?"}
            </DialogTitle>
            <DialogDescription>
              {pendingDelete
                ? pendingDelete.ids.length > 1
                  ? `${pendingDelete.label} verranno rimossi dall’archivio e dallo storage. L’operazione non è reversibile.`
                  : `${pendingDelete.label} verrà rimosso dall’archivio e dallo storage. L’operazione non è reversibile.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={deleting}
              onClick={() => setPendingDelete(null)}
            >
              Annulla
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={confirmDelete}
            >
              <Trash2 />
              {deleting ? "Eliminazione…" : "Elimina"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
