"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
  Search,
  ShieldCheck,
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

function UploadDialog({
  open,
  onOpenChange,
  section,
  destination,
  categoriaPreset,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  section: EntityTypeKey | null;
  destination: TreeNode | null;
  categoriaPreset: string | null;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [entityType, setEntityType] = useState<EntityTypeKey>("AZIENDA");
  const [categoria, setCategoria] = useState("CCIAA");
  const [dipendenteId, setDipendenteId] = useState("");
  const [automezzoId, setAutomezzoId] = useState("");
  const [dataScadenza, setDataScadenza] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dipendenti, setDipendenti] = useState<Dipendente[]>([]);
  const [automezzi, setAutomezzi] = useState<Automezzo[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!open) return;
    const nextType = section ?? "AZIENDA";
    setEntityType(nextType);
    setCategoria(
      categoriaPreset ?? destination?.categoria ?? categorieForEntity(nextType)[0] ?? "ALTRO"
    );
    setDipendenteId(destination?.dipendenteId ?? "");
    setAutomezzoId(destination?.automezzoId ?? "");
    setDataScadenza("");
    setFiles([]);
    setProgress(0);

    Promise.all([
      fetch("/api/dipendenti").then((r) => (r.ok ? r.json() : { dipendenti: [] })),
      fetch("/api/automezzi").then((r) => (r.ok ? r.json() : { automezzi: [] })),
    ]).then(([dip, auto]) => {
      setDipendenti(dip.dipendenti ?? []);
      setAutomezzi(auto.automezzi ?? []);
    });
  }, [open, section, destination, categoriaPreset]);

  const categories = useMemo(() => categorieForEntity(entityType), [entityType]);

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
    const entityId =
      entityType === "DIPENDENTE"
        ? dipendenteId
        : entityType === "AUTOMEZZO"
          ? automezzoId
          : categoria.toLowerCase().replace(/\s+/g, "-");

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
    if (entityType === "DIPENDENTE" && !dipendenteId) {
      return toast.error("Seleziona un dipendente");
    }
    if (entityType === "AUTOMEZZO" && !automezzoId) {
      return toast.error("Seleziona un automezzo");
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Carica documenti</DialogTitle>
          <DialogDescription>
            Scegli destinazione e categoria. Puoi caricare più file insieme.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Archivio</Label>
            <select
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              value={entityType}
              disabled={uploading}
              onChange={(event) => {
                const type = event.target.value as EntityTypeKey;
                setEntityType(type);
                setCategoria(categorieForEntity(type)[0] ?? "ALTRO");
                setDipendenteId("");
                setAutomezzoId("");
              }}
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
                value={dipendenteId}
                disabled={uploading}
                onChange={(event) => setDipendenteId(event.target.value)}
              >
                <option value="">Seleziona dipendente…</option>
                {dipendenti.map((dipendente) => (
                  <option key={dipendente.id} value={dipendente.id}>
                    {dipendente.cognome} {dipendente.nome}
                  </option>
                ))}
              </select>
            </div>
          ) : entityType === "AUTOMEZZO" ? (
            <div className="space-y-1.5">
              <Label>Automezzo</Label>
              <select
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                value={automezzoId}
                disabled={uploading}
                onChange={(event) => setAutomezzoId(event.target.value)}
              >
                <option value="">Seleziona automezzo…</option>
                {automezzi.map((automezzo) => (
                  <option key={automezzo.id} value={automezzo.id}>
                    {automezzo.targa}
                    {automezzo.descrizione ? ` — ${automezzo.descrizione}` : ""}
                  </option>
                ))}
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

          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <select
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              value={categoria}
              disabled={uploading}
              onChange={(event) => setCategoria(event.target.value)}
            >
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Scadenza comune (opzionale)</Label>
            <Input
              type="date"
              value={dataScadenza}
              disabled={uploading}
              onChange={(event) => setDataScadenza(event.target.value)}
            />
          </div>
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
            disabled={uploading}
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
                {!uploading && (
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
          <Button variant="outline" disabled={uploading} onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button disabled={uploading || files.length === 0} onClick={startUpload}>
            {uploading
              ? `Caricamento ${progress}/${files.length}…`
              : `Carica${files.length > 1 ? ` ${files.length} file` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DocumentiWorkspace() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [total, setTotal] = useState(0);
  const [documents, setDocuments] = useState<Documento[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [section, setSection] = useState<EntityTypeKey | null>(null);
  const [destination, setDestination] = useState<TreeNode | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [navigationSearch, setNavigationSearch] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [expiry, setExpiry] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const fetchTree = useCallback(async () => {
    const response = await fetch("/api/documenti/albero");
    const body = await response.json();
    if (response.ok) {
      setTree(body.tree ?? []);
      setTotal(body.total ?? 0);
    }
  }, []);

  const fetchDocuments = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    const params = new URLSearchParams({ limit: "100" });
    if (section) params.set("entityType", section);
    if (destination?.dipendenteId) params.set("dipendenteId", destination.dipendenteId);
    if (destination?.automezzoId) params.set("automezzoId", destination.automezzoId);
    if (category) params.set("categoria", category);
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (status) params.set("statoValidita", status);
    if (expiry) params.set("scadenza", expiry);

    try {
      const response = await fetch(`/api/documenti?${params}`);
      const body = await response.json();
      if (currentRequest !== requestId.current) return;
      setDocuments(body.documenti ?? []);
      setListTotal(body.total ?? 0);
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [section, destination, category, debouncedSearch, status, expiry]);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const activeRoot = tree.find((node) => node.entityType === section) ?? null;
  const navigationItems = activeRoot?.children ?? [];
  const filteredNavigation = navigationItems.filter((node) =>
    node.label.toLocaleLowerCase("it").includes(navigationSearch.toLocaleLowerCase("it"))
  );
  const categories =
    section === "AZIENDA"
      ? navigationItems
      : destination?.children ?? [];

  const title = destination?.label ?? (section ? SECTION_CONFIG[section].label : "Tutti i documenti");

  function chooseSection(next: EntityTypeKey | null) {
    setSection(next);
    setDestination(null);
    setCategory(null);
    setNavigationSearch("");
  }

  function chooseNavigation(node: TreeNode) {
    if (section === "AZIENDA") {
      setCategory(node.categoria ?? node.label);
      setDestination(null);
    } else {
      setDestination(node);
      setCategory(null);
    }
  }

  function refresh() {
    fetchTree();
    fetchDocuments();
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
            <span className="text-xl font-bold tabular-nums">{total}</span>
          </div>
          <p className="mt-3 font-semibold">Tutto</p>
          <p className="hidden text-xs text-gray-500 sm:block">Archivio completo</p>
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
                  ? "Seleziona una raccolta"
                  : "Seleziona per vedere i documenti"}
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
                }}
                className={cn(
                  "mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50",
                  !destination && !category && "bg-sky-50 font-medium text-sky-800"
                )}
              >
                <Folder className="h-4 w-4" />
                <span className="flex-1">Tutti</span>
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
                  {listTotal} {listTotal === 1 ? "documento" : "documenti"}
                </p>
              </div>
              {isAdmin && section && (
                <Button variant="outline" onClick={() => setUploadOpen(true)}>
                  <Upload className="mr-2 h-4 w-4" />
                  Carica qui
                </Button>
              )}
            </div>

            {categories.length > 0 && section !== "AZIENDA" && (
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

            <div className="flex flex-col gap-2 md:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  className="pl-9"
                  placeholder="Cerca per nome, categoria o percorso…"
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
                <option value="mancanti">Senza scadenza</option>
              </select>
            </div>
          </div>

          {loading ? (
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
              {documents.map((documento) => (
                <Link
                  key={documento.id}
                  href={`/documenti/${documento.id}`}
                  className="group flex items-center gap-3 px-4 py-3 transition hover:bg-gray-50 sm:px-5"
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
                  <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-sky-600" />
                </Link>
              ))}
              {listTotal > documents.length && (
                <div className="px-4 py-3 text-center text-xs text-gray-500">
                  Mostrati i primi {documents.length} di {listTotal} documenti
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {isAdmin && (
        <UploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          section={section}
          destination={destination}
          categoriaPreset={category}
          onUploaded={refresh}
        />
      )}
    </div>
  );
}
