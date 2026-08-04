import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessDocumentiHr } from "@/lib/access";
import { prisma } from "@/lib/db";
import {
  canonicalCategoria,
  ENTITY_LABELS,
  type EntityTypeKey,
} from "@/lib/document-categories";

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

function hrWhere(canHr: boolean): Record<string, unknown> {
  if (canHr) return {};
  return {
    entityType: { not: "DIPENDENTE" },
    categoria: {
      notIn: ["UNILAV", "DOC", "IDONEITA", "F24", "DURC", "DURF"],
    },
  };
}

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canHr = canAccessDocumentiHr(session);
  const where = {
    canonicalDocumentoId: null,
    ...hrWhere(canHr),
  };

  const [grouped, total] = await Promise.all([
    prisma.documento.groupBy({
      by: ["entityType", "categoria", "dipendenteId", "automezzoId"],
      where,
      _count: { _all: true },
    }),
    prisma.documento.count({ where }),
  ]);

  const dipendenteIds = [
    ...new Set(grouped.map((g) => g.dipendenteId).filter(Boolean)),
  ] as string[];
  const automezzoIds = [
    ...new Set(grouped.map((g) => g.automezzoId).filter(Boolean)),
  ] as string[];

  const [dipendenti, automezzi] = await Promise.all([
    dipendenteIds.length
      ? prisma.dipendente.findMany({
          where: { id: { in: dipendenteIds } },
          select: { id: true, nome: true, cognome: true },
        })
      : Promise.resolve([]),
    automezzoIds.length
      ? prisma.automezzo.findMany({
          where: { id: { in: automezzoIds } },
          select: { id: true, targa: true, descrizione: true },
        })
      : Promise.resolve([]),
  ]);

  const dipMap = new Map(
    dipendenti.map((d) => [d.id, `${d.cognome} ${d.nome}`.trim()])
  );
  const autoMap = new Map(
    automezzi.map((a) => [
      a.id,
      a.descrizione ? `${a.targa} — ${a.descrizione}` : a.targa,
    ])
  );

  const roots: Record<EntityTypeKey, TreeNode> = {
    AZIENDA: {
      key: "AZIENDA",
      label: ENTITY_LABELS.AZIENDA,
      count: 0,
      entityType: "AZIENDA",
      children: [],
    },
    DIPENDENTE: {
      key: "DIPENDENTE",
      label: ENTITY_LABELS.DIPENDENTE,
      count: 0,
      entityType: "DIPENDENTE",
      children: [],
    },
    AUTOMEZZO: {
      key: "AUTOMEZZO",
      label: ENTITY_LABELS.AUTOMEZZO,
      count: 0,
      entityType: "AUTOMEZZO",
      children: [],
    },
  };

  for (const row of grouped) {
    const entityType = row.entityType as EntityTypeKey;
    const root = roots[entityType];
    if (!root) continue;

    const count = row._count._all;
    const categoria = canonicalCategoria(row.categoria);
    root.count += count;

    if (entityType === "DIPENDENTE" && row.dipendenteId) {
      const dipKey = `DIPENDENTE:${row.dipendenteId}`;
      let dipNode = root.children!.find((c) => c.key === dipKey);
      if (!dipNode) {
        dipNode = {
          key: dipKey,
          label: dipMap.get(row.dipendenteId) ?? "Dipendente",
          count: 0,
          entityType: "DIPENDENTE",
          dipendenteId: row.dipendenteId,
          children: [],
        };
        root.children!.push(dipNode);
      }
      dipNode.count += count;

      const catKey = `${dipKey}:${categoria}`;
      let catNode = dipNode.children!.find((c) => c.key === catKey);
      if (!catNode) {
        catNode = {
          key: catKey,
          label: categoria,
          count: 0,
          entityType: "DIPENDENTE",
          dipendenteId: row.dipendenteId,
          categoria,
        };
        dipNode.children!.push(catNode);
      }
      catNode.count += count;
      continue;
    }

    if (entityType === "AUTOMEZZO" && row.automezzoId) {
      const autoKey = `AUTOMEZZO:${row.automezzoId}`;
      let autoNode = root.children!.find((c) => c.key === autoKey);
      if (!autoNode) {
        autoNode = {
          key: autoKey,
          label: autoMap.get(row.automezzoId) ?? "Automezzo",
          count: 0,
          entityType: "AUTOMEZZO",
          automezzoId: row.automezzoId,
          children: [],
        };
        root.children!.push(autoNode);
      }
      autoNode.count += count;

      const catKey = `${autoKey}:${categoria}`;
      let catNode = autoNode.children!.find((c) => c.key === catKey);
      if (!catNode) {
        catNode = {
          key: catKey,
          label: categoria,
          count: 0,
          entityType: "AUTOMEZZO",
          automezzoId: row.automezzoId,
          categoria,
        };
        autoNode.children!.push(catNode);
      }
      catNode.count += count;
      continue;
    }

    // AZIENDA (o docs senza entity collegata)
    const catKey = `${entityType}:${categoria}`;
    let catNode = root.children!.find((c) => c.key === catKey);
    if (!catNode) {
      catNode = {
        key: catKey,
        label: categoria,
        count: 0,
        entityType,
        categoria,
      };
      root.children!.push(catNode);
    }
    catNode.count += count;
  }

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.label.localeCompare(b.label, "it"));
    for (const n of nodes) {
      if (n.children?.length) sortNodes(n.children);
    }
  };

  const tree = (Object.keys(roots) as EntityTypeKey[])
    .map((k) => roots[k])
    .filter((n) => canHr || n.entityType !== "DIPENDENTE");

  for (const n of tree) {
    if (n.children) sortNodes(n.children);
  }

  return NextResponse.json({ tree, total });
}
